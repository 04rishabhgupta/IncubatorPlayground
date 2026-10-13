-- =============================================================================
-- Company review workflow
--
-- Admins review a company by updating companies.status (RLS: admin update).
-- Everything that must happen with a status change happens in the same
-- transaction, via triggers, regardless of which client made the change:
--   * rejected / suspended require a reason
--   * the pending registration request is resolved with the decision
--   * the company account is notified
-- Rejected companies can resubmit through resubmit_company_registration().
-- =============================================================================

-- A rejection or suspension must always say why.
alter table public.companies
  add constraint companies_reason_required
  check (status not in ('rejected', 'suspended') or nullif(btrim(status_reason), '') is not null);

-- Each service is a short label.
create function public.valid_services(p_services text[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(btrim(s)) between 1 and 80), true)
  from unnest(p_services) as s;
$$;

alter table public.companies
  add constraint companies_services_items_check check (public.valid_services(services));

-- Re-define the company guard so that moving back to 'pending' (resubmission)
-- clears the review stamp instead of recording the owner as reviewer.
create or replace function public.guard_company_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.space_kind;
begin
  if new.space_id is not null then
    select kind into v_kind from public.floor_spaces where id = new.space_id;
    if v_kind is distinct from 'office' then
      raise exception 'companies can only be assigned to office spaces' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := (select auth.uid());
    end if;
  end if;

  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.status_reason := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.floor_id := null;
    new.space_id := null;
    new.created_at := now();
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.slug is distinct from old.slug
     or new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.floor_id is distinct from old.floor_id
     or new.space_id is distinct from old.space_id then
    raise exception 'only a super admin can change ownership, slug, status or floor placement'
      using errcode = '42501';
  end if;
  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Resolve the registration request and notify the owner on every status change.
create function public.after_company_status_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_type public.notification_type;
  v_title text;
  v_body text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    update public.company_registration_requests
       set status = new.status::text::public.registration_status,
           review_notes = new.status_reason
     where company_id = new.id and status = 'pending';
  end if;

  case new.status
    when 'approved' then
      v_type := 'company_approved';
      v_title := case when old.status = 'suspended'
                      then 'Your company has been reinstated'
                      else 'Your company has been approved' end;
      v_body := new.name || ' is now visible to visitors in the directory.';
    when 'rejected' then
      v_type := 'company_rejected';
      v_title := 'Your company registration was not approved';
      v_body := new.status_reason;
    when 'suspended' then
      v_type := 'company_suspended';
      v_title := 'Your company has been suspended';
      v_body := new.status_reason;
    else
      return new;
  end case;

  insert into public.notifications (recipient_id, type, title, body, link, data)
  values (
    new.owner_id, v_type, v_title, left(v_body, 1000), '/company',
    jsonb_build_object('company_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

create trigger after_company_status_change
  after update of status on public.companies
  for each row when (old.status is distinct from new.status)
  execute function public.after_company_status_change();

revoke execute on function public.after_company_status_change() from public, anon, authenticated;

-- Lets a rejected company send its (edited) profile back for review.
create function public.resubmit_company_registration()
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  select * into v_company
    from public.companies
   where owner_id = (select auth.uid())
   for update;

  if not found then
    raise exception 'no company is linked to this account' using errcode = 'P0002';
  end if;
  if v_company.status <> 'rejected' then
    raise exception 'only rejected registrations can be resubmitted' using errcode = '22023';
  end if;

  update public.companies set status = 'pending', status_reason = null where id = v_company.id;

  insert into public.company_registration_requests (company_id, submitted_by, submitted_data)
  values (
    v_company.id,
    v_company.owner_id,
    jsonb_build_object(
      'resubmission', true,
      'name', v_company.name,
      'tagline', v_company.tagline,
      'description', v_company.description,
      'industry_id', v_company.industry_id,
      'services', to_jsonb(v_company.services),
      'website', v_company.website,
      'business_email', v_company.business_email,
      'phone', v_company.phone,
      'office_details', v_company.office_details,
      'founded_year', v_company.founded_year
    )
  );
  return v_company.id;
end;
$$;

revoke execute on function public.resubmit_company_registration() from public, anon;
grant execute on function public.resubmit_company_registration() to authenticated;
