-- =============================================================================
-- Startup Floor Connect — security
-- Authorization helpers, signup + integrity guard triggers, grants and RLS.
--
-- Principles
--   * RLS is enabled on every table; nothing relies on frontend role checks.
--   * Grants are explicit (revoke all first) so behaviour does not depend on
--     the project's default privileges.
--   * Privileged columns (roles, company status, floor placement) are guarded
--     by triggers: only super admins or trusted server contexts (service role,
--     SQL editor, migrations) may change them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies can call them without
-- recursing through RLS on the tables they inspect)
-- -----------------------------------------------------------------------------
create function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'super_admin'
  );
$$;

create function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create function public.owns_company(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.companies
    where id = p_company_id and owner_id = (select auth.uid())
  );
$$;

create function public.is_company_public(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.companies
    where id = p_company_id and status = 'approved'
  );
$$;

create function public.can_manage_member(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_team_members m
    join public.companies c on c.id = m.company_id
    where m.id = p_member_id and c.owner_id = (select auth.uid())
  );
$$;

create function public.is_member_public(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_team_members m
    join public.companies c on c.id = m.company_id
    where m.id = p_member_id and m.is_public and c.status = 'approved'
  );
$$;

create function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and profile_id = (select auth.uid())
  );
$$;

-- True when the caller has a legitimate relationship with another profile
-- (shared conversation, or an appointment between the caller and a company
-- the other profile owns / requested). Lets a company see who contacted it.
create function public.shares_context_with(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members a
    join public.conversation_members b on b.conversation_id = a.conversation_id
    where a.profile_id = (select auth.uid()) and b.profile_id = p_profile_id
  ) or exists (
    select 1
    from public.appointments ap
    join public.companies c on c.id = ap.company_id
    where (c.owner_id = (select auth.uid()) and ap.requester_id = p_profile_id)
       or (ap.requester_id = (select auth.uid()) and c.owner_id = p_profile_id)
  );
$$;

-- True for contexts outside the Data API's end-user roles: service role,
-- postgres (SQL editor, migrations) and SECURITY DEFINER functions.
create function public.is_trusted_context()
returns boolean
language sql stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated');
$$;

-- -----------------------------------------------------------------------------
-- Signup: create a profile for every auth user
-- account_type metadata may only request 'visitor' or 'company'.
-- super_admin is granted manually (see README).
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
    case when new.raw_user_meta_data ->> 'account_type' = 'company'
         then 'company'::public.app_role
         else 'visitor'::public.app_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Guard triggers (SECURITY INVOKER so current_user reflects the caller)
-- -----------------------------------------------------------------------------

-- Profiles: users cannot change their own role or email.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'profile id and email cannot be changed directly' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'only a super admin can change roles' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and new.id = (select auth.uid()) then
    raise exception 'admins cannot change their own role' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Companies: owners edit their profile; review status, placement, slug and
-- ownership are admin-controlled.
create function public.guard_company_write()
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
    new.reviewed_at := now();
    new.reviewed_by := (select auth.uid());
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

create trigger guard_company_write before insert or update on public.companies
  for each row execute function public.guard_company_write();

-- Registration requests: requesters submit; only admins review.
create function public.guard_registration_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'pending' then
    new.reviewed_at := now();
    new.reviewed_by := (select auth.uid());
  end if;
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.review_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger guard_registration_write before insert or update on public.company_registration_requests
  for each row execute function public.guard_registration_write();

-- Availability rows: stamp who updated them and when.
create function public.stamp_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger stamp_availability before insert or update on public.company_availability
  for each row execute function public.stamp_availability();
create trigger stamp_availability before insert or update on public.member_availability
  for each row execute function public.stamp_availability();

-- Messages: server-assigned timestamps; bump conversation + sender read state.
create function public.prepare_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_trusted_context() then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger prepare_message before insert on public.messages
  for each row execute function public.prepare_message();

create function public.after_message_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  update public.conversation_members
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id and profile_id = new.sender_id;
  return new;
end;
$$;

create trigger after_message_insert after insert on public.messages
  for each row execute function public.after_message_insert();

-- Appointments: validate requests and enforce the status workflow.
--   requester: pending|accepted -> cancelled
--   company:   pending -> accepted|rejected; accepted -> cancelled|completed
--   admin / trusted contexts: unrestricted
create function public.guard_appointment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_company boolean;
  v_bookable boolean;
begin
  if tg_op = 'INSERT' then
    if new.member_id is not null then
      select is_bookable into v_bookable from public.company_team_members where id = new.member_id;
      if not coalesce(v_bookable, false) then
        raise exception 'this team member is not accepting appointment requests' using errcode = '23514';
      end if;
    end if;

    if public.is_trusted_context() or public.is_super_admin() then
      return new;
    end if;

    if public.owns_company(new.company_id) then
      raise exception 'companies cannot book appointments with themselves' using errcode = '42501';
    end if;
    if new.starts_at <= now() then
      raise exception 'appointments must start in the future' using errcode = '23514';
    end if;
    if new.starts_at > now() + interval '1 year' then
      raise exception 'appointments can be requested at most one year ahead' using errcode = '23514';
    end if;
    new.status := 'pending';
    new.decision_note := null;
    new.decided_at := null;
    new.decided_by := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.meeting_link := null;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if new.status in ('accepted', 'rejected') then
      new.decided_at := now();
      new.decided_by := v_uid;
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
      new.cancelled_by := v_uid;
    end if;
  end if;

  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.company_id is distinct from old.company_id
     or new.requester_id is distinct from old.requester_id
     or new.member_id is distinct from old.member_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.timezone is distinct from old.timezone
     or new.meeting_type is distinct from old.meeting_type
     or new.purpose is distinct from old.purpose
     or new.created_at is distinct from old.created_at then
    raise exception 'appointment details cannot be changed after submission' using errcode = '42501';
  end if;

  v_is_company := public.owns_company(old.company_id);

  if v_is_company then
    if new.status is distinct from old.status and not (
         (old.status = 'pending' and new.status in ('accepted', 'rejected'))
      or (old.status = 'accepted' and new.status = 'cancelled')
      or (old.status = 'accepted' and new.status = 'completed' and old.starts_at <= now())
    ) then
      raise exception 'invalid appointment status change: % -> %', old.status, new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.requester_id = v_uid then
    if new.meeting_link is distinct from old.meeting_link
       or new.location_note is distinct from old.location_note
       or new.decision_note is distinct from old.decision_note then
      raise exception 'only the company can edit meeting details' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (
      old.status in ('pending', 'accepted') and new.status = 'cancelled'
    ) then
      raise exception 'invalid appointment status change: % -> %', old.status, new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'not allowed to modify this appointment' using errcode = '42501';
end;
$$;

create trigger guard_appointment_write before insert or update on public.appointments
  for each row execute function public.guard_appointment_write();

-- Trigger-only functions must not be callable through the Data API.
revoke execute on function
  public.handle_new_user(),
  public.handle_user_email_change(),
  public.after_message_insert()
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grants (explicit; RLS below narrows rows)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;

-- Public reference data
grant select on public.buildings, public.floors, public.floor_layouts,
                public.floor_spaces, public.industries
  to anon, authenticated;
grant insert, update, delete on public.buildings, public.floors, public.floor_layouts,
                                public.floor_spaces, public.industries
  to authenticated;

-- Profiles: no anon access; users edit only safe columns.
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, phone, role) on public.profiles to authenticated;

-- Companies and their public sub-resources
grant select on public.companies, public.company_availability,
                public.company_team_members, public.member_availability
  to anon, authenticated;
grant insert, update, delete on public.companies, public.company_availability,
                                public.company_team_members, public.member_availability
  to authenticated;

grant select, insert, update, delete on public.company_registration_requests to authenticated;

-- Chat: conversations are created through server code / RPC (added with the
-- chat phase), messages are append-only.
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

grant select, insert, update, delete on public.appointments to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles                      enable row level security;
alter table public.buildings                     enable row level security;
alter table public.floors                        enable row level security;
alter table public.floor_layouts                 enable row level security;
alter table public.floor_spaces                  enable row level security;
alter table public.industries                    enable row level security;
alter table public.companies                     enable row level security;
alter table public.company_registration_requests enable row level security;
alter table public.company_availability          enable row level security;
alter table public.company_team_members          enable row level security;
alter table public.member_availability           enable row level security;
alter table public.conversations                 enable row level security;
alter table public.conversation_members          enable row level security;
alter table public.messages                      enable row level security;
alter table public.appointments                  enable row level security;
alter table public.notifications                 enable row level security;

-- profiles ---------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: read related" on public.profiles
  for select to authenticated using (public.shares_context_with(id));
create policy "profiles: admin read" on public.profiles
  for select to authenticated using (public.is_super_admin());
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admin update" on public.profiles
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- floor reference data ----------------------------------------------------------
create policy "buildings: public read" on public.buildings
  for select to anon, authenticated using (true);
create policy "buildings: admin write" on public.buildings
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "floors: public read active" on public.floors
  for select to anon, authenticated using (is_active or public.is_super_admin());
create policy "floors: admin write" on public.floors
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "floor_layouts: public read" on public.floor_layouts
  for select to anon, authenticated using (true);
create policy "floor_layouts: admin write" on public.floor_layouts
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "floor_spaces: public read" on public.floor_spaces
  for select to anon, authenticated using (true);
create policy "floor_spaces: admin write" on public.floor_spaces
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "industries: public read" on public.industries
  for select to anon, authenticated using (true);
create policy "industries: admin write" on public.industries
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- companies ---------------------------------------------------------------------
create policy "companies: public read approved" on public.companies
  for select to anon, authenticated using (status = 'approved');
create policy "companies: owner read" on public.companies
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "companies: admin read" on public.companies
  for select to authenticated using (public.is_super_admin());
create policy "companies: company account creates own" on public.companies
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_app_role() = 'company');
create policy "companies: owner update" on public.companies
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "companies: admin update" on public.companies
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "companies: admin delete" on public.companies
  for delete to authenticated using (public.is_super_admin());

-- registration requests -----------------------------------------------------------
create policy "registrations: submitter read" on public.company_registration_requests
  for select to authenticated using (submitted_by = (select auth.uid()));
create policy "registrations: admin read" on public.company_registration_requests
  for select to authenticated using (public.is_super_admin());
create policy "registrations: owner submits" on public.company_registration_requests
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and public.owns_company(company_id));
create policy "registrations: admin update" on public.company_registration_requests
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "registrations: admin delete" on public.company_registration_requests
  for delete to authenticated using (public.is_super_admin());

-- company availability ------------------------------------------------------------
create policy "company_availability: public read" on public.company_availability
  for select to anon, authenticated using (public.is_company_public(company_id));
create policy "company_availability: owner/admin read" on public.company_availability
  for select to authenticated
  using (public.owns_company(company_id) or public.is_super_admin());
create policy "company_availability: owner/admin write" on public.company_availability
  for all to authenticated
  using (public.owns_company(company_id) or public.is_super_admin())
  with check (public.owns_company(company_id) or public.is_super_admin());

-- team members ------------------------------------------------------------------
create policy "team_members: public read" on public.company_team_members
  for select to anon, authenticated using (is_public and public.is_company_public(company_id));
create policy "team_members: owner/admin read" on public.company_team_members
  for select to authenticated
  using (public.owns_company(company_id) or public.is_super_admin());
create policy "team_members: owner/admin write" on public.company_team_members
  for all to authenticated
  using (public.owns_company(company_id) or public.is_super_admin())
  with check (public.owns_company(company_id) or public.is_super_admin());

create policy "member_availability: public read" on public.member_availability
  for select to anon, authenticated using (public.is_member_public(member_id));
create policy "member_availability: owner/admin read" on public.member_availability
  for select to authenticated
  using (public.can_manage_member(member_id) or public.is_super_admin());
create policy "member_availability: owner/admin write" on public.member_availability
  for all to authenticated
  using (public.can_manage_member(member_id) or public.is_super_admin())
  with check (public.can_manage_member(member_id) or public.is_super_admin());

-- chat ----------------------------------------------------------------------------
-- Admins deliberately have no read access to private conversations.
create policy "conversations: members read" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

create policy "conversation_members: members read" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "conversation_members: update own read state" on public.conversation_members
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "messages: members send as self" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

-- appointments ------------------------------------------------------------------
create policy "appointments: participants/admin read" on public.appointments
  for select to authenticated
  using (requester_id = (select auth.uid())
         or public.owns_company(company_id)
         or public.is_super_admin());
create policy "appointments: request with approved company" on public.appointments
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and public.is_company_public(company_id));
create policy "appointments: participants/admin update" on public.appointments
  for update to authenticated
  using (requester_id = (select auth.uid())
         or public.owns_company(company_id)
         or public.is_super_admin())
  with check (requester_id = (select auth.uid())
         or public.owns_company(company_id)
         or public.is_super_admin());
create policy "appointments: admin delete" on public.appointments
  for delete to authenticated using (public.is_super_admin());

-- notifications ------------------------------------------------------------------
create policy "notifications: read own" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy "notifications: mark own read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "notifications: delete own" on public.notifications
  for delete to authenticated using (recipient_id = (select auth.uid()));
