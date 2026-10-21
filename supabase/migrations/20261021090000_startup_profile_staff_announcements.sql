-- =============================================================================
-- Phase 4R.5: startup profile, FITT Incubation Team, announcements, office requests
--
--   * companies.stage / team_size / tech_stack   owner-edited startup profile
--   * incubator_staff                            the FITT team, shown at reception
--   * announcements                              admin notices, floor- or building-wide
--   * office_requests                            one per company: a preferred office
--                                                (or any) plus a note, for the admin
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Startup profile
-- -----------------------------------------------------------------------------
create type public.startup_stage as enum ('idea', 'prototype', 'mvp', 'early_revenue', 'growth');

-- Each label (service, technology …) is short and not blank.
create function public.valid_labels(p_items text[], p_max integer)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(btrim(s)) between 1 and p_max), true)
  from unnest(p_items) as s;
$$;

alter table public.companies
  add column stage public.startup_stage,
  add column team_size integer check (team_size is null or team_size between 1 and 100000),
  add column tech_stack text[] not null default '{}'
    check (cardinality(tech_stack) <= 20 and public.valid_labels(tech_stack, 40));

-- -----------------------------------------------------------------------------
-- FITT Incubation Team (staff of the incubator, not a company)
-- -----------------------------------------------------------------------------
create table public.incubator_staff (
  id                       uuid primary key default gen_random_uuid(),
  building_id              uuid not null references public.buildings (id) on delete cascade,
  full_name                text not null check (char_length(btrim(full_name)) between 1 and 120),
  job_title                text check (job_title is null or char_length(job_title) <= 120),
  email                    text check (email is null or (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254)),
  phone                    text check (phone is null or char_length(phone) <= 32),
  -- Self-reported like company availability; null = Unknown.
  availability             public.availability_status,
  availability_updated_at  timestamptz,
  is_public                boolean not null default true,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index incubator_staff_building_idx on public.incubator_staff (building_id, sort_order);

create trigger set_updated_at before update on public.incubator_staff
  for each row execute function public.set_updated_at();

create function public.stamp_staff_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.availability is distinct from old.availability then
    new.availability_updated_at := case when new.availability is null then null else now() end;
  else
    new.availability_updated_at := old.availability_updated_at;
  end if;
  return new;
end;
$$;

create trigger stamp_staff_availability before insert or update on public.incubator_staff
  for each row execute function public.stamp_staff_availability();

-- -----------------------------------------------------------------------------
-- Announcements (admin only). floor_id null = every floor.
-- -----------------------------------------------------------------------------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid references public.floors (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text check (body is null or char_length(body) <= 1000),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint announcements_period_check check (ends_at is null or ends_at > starts_at)
);
create index announcements_live_idx on public.announcements (starts_at, ends_at);

create trigger set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create function public.stamp_announcement_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger stamp_announcement_author before insert or update on public.announcements
  for each row execute function public.stamp_announcement_author();

-- -----------------------------------------------------------------------------
-- Office requests: one open request per company.
-- -----------------------------------------------------------------------------
create table public.office_requests (
  company_id  uuid primary key references public.companies (id) on delete cascade,
  space_id    uuid references public.floor_spaces (id) on delete set null, -- null = any office
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on public.office_requests
  for each row execute function public.set_updated_at();

-- Only offices can be requested, and only by an approved company without one.
create function public.guard_office_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.space_kind;
  v_status public.company_status;
  v_space uuid;
begin
  if new.space_id is not null then
    select kind into v_kind from public.floor_spaces where id = new.space_id;
    if v_kind is distinct from 'office' then
      raise exception 'only offices can be requested' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id then
      raise exception 'a request belongs to one company' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;

  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  select status, space_id into v_status, v_space from public.companies where id = new.company_id;
  if v_status is distinct from 'approved' then
    raise exception 'only approved companies can request an office' using errcode = '42501';
  end if;
  if v_space is not null then
    raise exception 'this company already has an office' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger guard_office_request before insert or update on public.office_requests
  for each row execute function public.guard_office_request();

-- Placing the company fulfils its request.
create function public.after_company_placed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.office_requests where company_id = new.id;
  return new;
end;
$$;

create trigger after_company_placed
  after update of space_id on public.companies
  for each row when (new.space_id is not null and old.space_id is distinct from new.space_id)
  execute function public.after_company_placed();

-- An admin closing a request (without placing the company) tells the company.
alter type public.notification_type add value if not exists 'office_request_closed';

create function public.after_office_request_closed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    select c.owner_id,
           'office_request_closed',
           'Your office request was closed',
           'The platform admin closed your office request. You can send a new one from your dashboard.',
           '/company',
           jsonb_build_object('company_id', c.id)
      from public.companies c
     where c.id = old.company_id
       and c.space_id is null
       and c.owner_id is distinct from (select auth.uid());
  end if;
  return old;
end;
$$;

create trigger after_office_request_closed
  after delete on public.office_requests
  for each row execute function public.after_office_request_closed();

revoke execute on function public.stamp_staff_availability(), public.stamp_announcement_author(),
  public.guard_office_request(), public.after_company_placed(), public.after_office_request_closed()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grants and Row Level Security
-- -----------------------------------------------------------------------------
grant select on public.incubator_staff, public.announcements to anon, authenticated;
grant insert, update, delete on public.incubator_staff, public.announcements to authenticated;
grant select, insert, update, delete on public.office_requests to authenticated;
grant all on public.incubator_staff, public.announcements, public.office_requests to service_role;

alter table public.incubator_staff enable row level security;
alter table public.announcements   enable row level security;
alter table public.office_requests enable row level security;

create policy "incubator_staff: public read" on public.incubator_staff
  for select to anon, authenticated using (is_public or public.is_super_admin());
create policy "incubator_staff: admin write" on public.incubator_staff
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Visitors see announcements while they run; the admin sees scheduled and past ones too.
create policy "announcements: public read live" on public.announcements
  for select to anon, authenticated
  using ((starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_super_admin());
create policy "announcements: admin write" on public.announcements
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "office_requests: owner/admin read" on public.office_requests
  for select to authenticated using (public.owns_company(company_id) or public.is_super_admin());
create policy "office_requests: owner write" on public.office_requests
  for insert to authenticated with check (public.owns_company(company_id));
create policy "office_requests: owner update" on public.office_requests
  for update to authenticated
  using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "office_requests: owner/admin delete" on public.office_requests
  for delete to authenticated using (public.owns_company(company_id) or public.is_super_admin());

-- Live updates on the floor map (events only; data is re-read under RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.incubator_staff, public.announcements;
  end if;
end;
$$;
