-- =============================================================================
-- Office assignment notifications
--
-- Super admins place companies in offices by updating companies.floor_id /
-- space_id (admin RLS; guard trigger keeps everyone else out). The
-- companies.space_id unique constraint means a company can only be moved into
-- a vacant office — there are no swaps. This trigger tells the company account
-- whenever its office is assigned, changed or removed.
-- =============================================================================

alter type public.notification_type add value if not exists 'office_updated';

create function public.after_company_office_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_new_label text;
  v_old_label text;
  v_floor text;
  v_title text;
  v_body text;
begin
  select s.label, f.name into v_new_label, v_floor
    from public.floor_spaces s join public.floors f on f.id = s.floor_id
   where s.id = new.space_id;
  select label into v_old_label from public.floor_spaces where id = old.space_id;

  if old.space_id is null then
    v_title := 'Your office has been assigned';
    v_body := new.name || ' is now in ' || v_new_label || ' on ' || v_floor || '.';
  elsif new.space_id is null then
    v_title := 'Your office assignment was removed';
    v_body := new.name || ' is no longer assigned to ' || coalesce(v_old_label, 'an office') || '.';
  else
    v_title := 'Your office has changed';
    v_body := new.name || ' has moved from ' || coalesce(v_old_label, 'its previous office')
              || ' to ' || v_new_label || ' on ' || v_floor || '.';
  end if;

  insert into public.notifications (recipient_id, type, title, body, link, data)
  values (
    new.owner_id,
    'office_updated',
    v_title,
    v_body,
    '/company',
    jsonb_build_object('company_id', new.id, 'space_id', new.space_id, 'previous_space_id', old.space_id)
  );
  return new;
end;
$$;

create trigger after_company_office_change
  after update of space_id on public.companies
  for each row when (old.space_id is distinct from new.space_id)
  execute function public.after_company_office_change();

revoke execute on function public.after_company_office_change() from public, anon, authenticated;
