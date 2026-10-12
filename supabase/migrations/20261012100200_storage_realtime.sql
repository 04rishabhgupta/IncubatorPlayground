-- =============================================================================
-- Startup Floor Connect — storage buckets and realtime
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage
-- Objects are stored under "<company_id>/<file>". Buckets are public-read
-- (logos and avatars are shown on public profiles); writes are restricted to
-- the owning company account or a super admin. SVG is excluded to avoid
-- serving script-capable files.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-logos', 'company-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('team-avatars',  'team-avatars',  true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Returns true when the first path segment is a company the caller owns.
create function public.owns_company_folder(p_object_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(p_object_name, '/', 1);
begin
  if v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.owns_company(v_folder::uuid);
end;
$$;

create policy "company media: owner/admin read" on storage.objects
  for select to authenticated
  using (bucket_id in ('company-logos', 'team-avatars')
         and (public.owns_company_folder(name) or public.is_super_admin()));

create policy "company media: owner/admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('company-logos', 'team-avatars')
              and (public.owns_company_folder(name) or public.is_super_admin()));

create policy "company media: owner/admin update" on storage.objects
  for update to authenticated
  using (bucket_id in ('company-logos', 'team-avatars')
         and (public.owns_company_folder(name) or public.is_super_admin()))
  with check (bucket_id in ('company-logos', 'team-avatars')
              and (public.owns_company_folder(name) or public.is_super_admin()));

create policy "company media: owner/admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('company-logos', 'team-avatars')
         and (public.owns_company_folder(name) or public.is_super_admin()));

-- -----------------------------------------------------------------------------
-- Realtime: Postgres Changes respect RLS, so subscribers only receive rows
-- they are allowed to select.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages,
      public.notifications,
      public.company_availability,
      public.member_availability;
  end if;
end;
$$;
