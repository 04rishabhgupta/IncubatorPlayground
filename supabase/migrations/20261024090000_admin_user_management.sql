-- =============================================================================
-- Phase 8: admin user management
--
-- Role changes made through the app (a super admin on /admin/users) are
-- limited to changes that keep every account working:
--   * an account that owns a company stays a company account (its dashboard,
--     office and team depend on it);
--   * nobody becomes a company account without registering a company;
--   * the last super admin can't be demoted;
--   * admins still can't change their own role (unchanged).
-- So in practice: visitor ↔ super admin. Trusted contexts (SQL editor,
-- migrations, the signup trigger) are not restricted, as before.
-- The user is notified when their role changes.
-- =============================================================================

create or replace function public.guard_profile_update()
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
  if new.role is distinct from old.role then
    if not public.is_super_admin() then
      raise exception 'only a super admin can change roles' using errcode = '42501';
    end if;
    if new.id = (select auth.uid()) then
      raise exception 'admins cannot change their own role' using errcode = '42501';
    end if;
    if old.role = 'company' or exists (select 1 from public.companies where owner_id = new.id) then
      raise exception 'this account owns a company, so it stays a company account' using errcode = '23514';
    end if;
    if new.role = 'company' then
      raise exception 'company accounts are created by registering a company' using errcode = '23514';
    end if;
    if old.role = 'super_admin'
       and (select count(*) from public.profiles where role = 'super_admin') <= 1 then
      raise exception 'the last super admin can''t be demoted' using errcode = '23514';
    end if;
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;

create function public.after_profile_role_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link, data)
  values (
    new.id,
    'system',
    case new.role when 'super_admin' then 'You are now a platform admin'
                  else 'Your account role has changed' end,
    case new.role when 'super_admin' then 'You can manage companies, floors and users from the admin panel.'
                  else 'Your account is now a ' || replace(new.role::text, '_', ' ') || ' account.' end,
    case new.role when 'super_admin' then '/admin' when 'company' then '/company' else '/account' end,
    jsonb_build_object('previous_role', old.role, 'role', new.role)
  );
  return new;
end;
$$;

create trigger after_profile_role_change
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.after_profile_role_change();

revoke execute on function public.after_profile_role_change() from public, anon, authenticated;
