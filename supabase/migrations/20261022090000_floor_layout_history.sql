-- =============================================================================
-- Phase 4R.6: layout editor with history
--
-- The admin edits a floor as one JSON document:
--   { "width": …, "height": …, "geometry": { walls, areas, … }, "spaces": { "<code>": <shape>, … } }
-- save_floor_layout() applies it in one transaction: the layout, the shapes of
-- existing spaces (matched by code, so ids, placements and appointments are
-- untouched), and a new row in floor_layout_versions. Versions are append-only.
-- =============================================================================

create table public.floor_layout_versions (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references public.floors (id) on delete cascade,
  document    jsonb not null check (jsonb_typeof(document) = 'object'),
  note        text check (note is null or char_length(note) <= 200),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index floor_layout_versions_floor_idx on public.floor_layout_versions (floor_id, created_at desc);

grant select, insert on public.floor_layout_versions to authenticated;
grant all on public.floor_layout_versions to service_role;
alter table public.floor_layout_versions enable row level security;

create policy "floor_layout_versions: admin read" on public.floor_layout_versions
  for select to authenticated using (public.is_super_admin());
create policy "floor_layout_versions: admin insert" on public.floor_layout_versions
  for insert to authenticated with check (public.is_super_admin());
-- No update or delete policy: history can't be rewritten.

-- The floor's current layout as an editor document.
create function public.floor_layout_document(p_floor_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'width', l.width,
    'height', l.height,
    'geometry', l.geometry,
    'spaces', coalesce(
      (select jsonb_object_agg(s.code, s.shape order by s.sort_order)
         from public.floor_spaces s where s.floor_id = p_floor_id),
      '{}'::jsonb)
  )
  from public.floor_layouts l
  where l.floor_id = p_floor_id;
$$;

-- Apply an editor document. The app validates the geometry first (zod); this
-- function enforces what must never be wrong: admin only, no lost updates,
-- exactly the floor's existing space codes.
create function public.save_floor_layout(
  p_floor_id uuid,
  p_document jsonb,
  p_note text default null,
  p_expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_codes text[];
  v_doc_codes text[];
  v_updated timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'only a super admin can edit floor layouts' using errcode = '42501';
  end if;

  select updated_at into v_current
    from public.floor_layouts where floor_id = p_floor_id
    for update;
  if not found then
    raise exception 'this floor has no layout' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_current <> p_expected_updated_at then
    raise exception 'the layout was changed by someone else since you opened it' using errcode = '40001';
  end if;

  if jsonb_typeof(p_document -> 'geometry') is distinct from 'object'
     or jsonb_typeof(p_document -> 'spaces') is distinct from 'object' then
    raise exception 'the document needs "geometry" and "spaces" objects' using errcode = '22023';
  end if;

  select coalesce(array_agg(code order by code), '{}') into v_codes
    from public.floor_spaces where floor_id = p_floor_id;
  select coalesce(array_agg(k order by k), '{}') into v_doc_codes
    from jsonb_object_keys(p_document -> 'spaces') as k;
  if v_codes <> v_doc_codes then
    raise exception 'spaces must be exactly the floor''s existing codes: %', array_to_string(v_codes, ', ')
      using errcode = '22023';
  end if;

  -- First save on this floor: keep the layout as it was, so it can be restored.
  if not exists (select 1 from public.floor_layout_versions where floor_id = p_floor_id) then
    insert into public.floor_layout_versions (floor_id, document, note, created_by, created_at)
    values (p_floor_id, public.floor_layout_document(p_floor_id), 'Layout before the first edit', null, v_current);
  end if;

  update public.floor_layouts
     set width = (p_document ->> 'width')::integer,
         height = (p_document ->> 'height')::integer,
         geometry = p_document -> 'geometry',
         updated_by = (select auth.uid())
   where floor_id = p_floor_id
  returning updated_at into v_updated;

  update public.floor_spaces s
     set shape = p_document -> 'spaces' -> s.code
   where s.floor_id = p_floor_id
     and s.shape is distinct from p_document -> 'spaces' -> s.code;

  insert into public.floor_layout_versions (floor_id, document, note, created_by)
  values (p_floor_id, public.floor_layout_document(p_floor_id), nullif(btrim(p_note), ''), (select auth.uid()));

  return v_updated;
end;
$$;

revoke execute on function public.floor_layout_document(uuid) from public, anon;
revoke execute on function public.save_floor_layout(uuid, jsonb, text, timestamptz) from public, anon;
grant execute on function public.floor_layout_document(uuid) to authenticated;
grant execute on function public.save_floor_layout(uuid, jsonb, text, timestamptz) to authenticated;
