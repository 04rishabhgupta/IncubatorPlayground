-- =============================================================================
-- Startup Floor Connect — core schema
-- Tables, enums, constraints and indexes. Security (RLS, grants, guard
-- triggers) lives in the next migration so the two concerns stay reviewable.
--
-- Conventions
--   * All timestamps are timestamptz and stored in UTC. Display timezones are
--     carried separately (buildings.timezone, appointments.timezone).
--   * Every mutable table has created_at / updated_at; updated_at is
--     maintained by public.set_updated_at().
--   * Slugs are lowercase kebab-case.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('visitor', 'company', 'super_admin');
create type public.company_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.registration_status as enum ('pending', 'approved', 'rejected');
create type public.availability_status as enum ('available', 'busy', 'unavailable');
create type public.appointment_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'completed');
create type public.meeting_type as enum ('in_person', 'online');
create type public.space_kind as enum ('office', 'meeting_room', 'common_area', 'reception');
create type public.notification_type as enum (
  'appointment_requested',
  'appointment_accepted',
  'appointment_rejected',
  'appointment_cancelled',
  'appointment_completed',
  'message_received',
  'company_approved',
  'company_rejected',
  'company_suspended',
  'system'
);

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles: one row per auth user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 1024),
  phone       text check (phone is null or char_length(phone) <= 32),
  role        public.app_role not null default 'visitor',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

-- -----------------------------------------------------------------------------
-- Buildings → floors → layout + spaces
-- Only one building/floor is used initially, but the hierarchy is in place so
-- more floors and buildings are data, not code.
-- -----------------------------------------------------------------------------
create table public.buildings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  address     text check (address is null or char_length(address) <= 300),
  timezone    text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.floors (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings (id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  level        integer not null check (level between -10 and 200),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (building_id, level),
  unique (building_id, slug)
);

-- Static drawing for a floor: canvas size plus non-interactive geometry
-- (walls, corridors, lounges, entrances). Validated in the app by
-- src/lib/floor/geometry.ts.
create table public.floor_layouts (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null unique references public.floors (id) on delete cascade,
  width       integer not null check (width between 100 and 10000),
  height      integer not null check (height between 100 and 10000),
  geometry    jsonb not null default '{}'::jsonb check (jsonb_typeof(geometry) = 'object'),
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Interactive, independently clickable spaces on a floor. Companies are
-- assigned to spaces of kind 'office'.
create table public.floor_spaces (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references public.floors (id) on delete cascade,
  code        text not null check (code ~ '^[A-Za-z0-9-]{1,16}$'),
  kind        public.space_kind not null default 'office',
  label       text not null check (char_length(btrim(label)) between 1 and 80),
  shape       jsonb not null check (jsonb_typeof(shape) = 'object' and shape ? 'type'),
  capacity    integer check (capacity is null or capacity between 1 and 500),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (floor_id, code),
  unique (id, floor_id) -- target for the companies (space_id, floor_id) FK
);

-- -----------------------------------------------------------------------------
-- Industries (lookup for directory filters)
-- -----------------------------------------------------------------------------
create table public.industries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Companies — exactly one login account (owner) per company in the MVP
-- -----------------------------------------------------------------------------
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null unique references public.profiles (id) on delete restrict,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  tagline         text check (tagline is null or char_length(tagline) <= 160),
  description     text check (description is null or char_length(description) <= 5000),
  industry_id     uuid references public.industries (id) on delete set null,
  services        text[] not null default '{}' check (cardinality(services) <= 30),
  website         text check (website is null or (website ~* '^https?://' and char_length(website) <= 300)),
  business_email  text not null check (business_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(business_email) <= 254),
  phone           text check (phone is null or char_length(phone) <= 32),
  office_details  text check (office_details is null or char_length(office_details) <= 500),
  founded_year    smallint check (founded_year is null or founded_year between 1800 and 2100),
  logo_path       text check (logo_path is null or char_length(logo_path) <= 512),
  status          public.company_status not null default 'pending',
  status_reason   text check (status_reason is null or char_length(status_reason) <= 1000),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  floor_id        uuid references public.floors (id) on delete restrict,
  space_id        uuid unique, -- one company per office
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint companies_space_requires_floor check (space_id is null or floor_id is not null),
  constraint companies_space_on_floor_fkey
    foreign key (space_id, floor_id) references public.floor_spaces (id, floor_id)
    on delete set null (space_id)
);
create index companies_status_idx on public.companies (status);
create index companies_industry_idx on public.companies (industry_id);
create index companies_floor_idx on public.companies (floor_id);
create index companies_name_idx on public.companies (lower(name));

-- Review trail for company sign-ups (a company may re-apply after rejection).
create table public.company_registration_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  submitted_by    uuid not null references public.profiles (id) on delete cascade,
  status          public.registration_status not null default 'pending',
  submitted_data  jsonb not null default '{}'::jsonb check (jsonb_typeof(submitted_data) = 'object'),
  review_notes    text check (review_notes is null or char_length(review_notes) <= 1000),
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint registration_review_consistency check ((status = 'pending') = (reviewed_at is null))
);
create unique index registration_one_pending_per_company
  on public.company_registration_requests (company_id) where status = 'pending';
create index registration_status_created_idx
  on public.company_registration_requests (status, created_at desc);
create index registration_submitted_by_idx
  on public.company_registration_requests (submitted_by);

-- -----------------------------------------------------------------------------
-- Availability
-- No row = "Unknown". Availability is self-reported and never implies a
-- confirmed slot or physical presence.
-- -----------------------------------------------------------------------------
create table public.company_availability (
  company_id  uuid primary key references public.companies (id) on delete cascade,
  status      public.availability_status not null,
  note        text check (note is null or char_length(note) <= 280),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

-- Team members are records managed by the company account, not logins.
create table public.company_team_members (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  full_name    text not null check (char_length(btrim(full_name)) between 1 and 120),
  job_title    text check (job_title is null or char_length(job_title) <= 120),
  email        text check (email is null or (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254)),
  bio          text check (bio is null or char_length(bio) <= 1000),
  avatar_path  text check (avatar_path is null or char_length(avatar_path) <= 512),
  is_public    boolean not null default true,
  is_bookable  boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, company_id) -- target for the appointments (member_id, company_id) FK
);
create index team_members_company_idx on public.company_team_members (company_id, sort_order);

create table public.member_availability (
  member_id   uuid primary key references public.company_team_members (id) on delete cascade,
  status      public.availability_status not null,
  note        text check (note is null or char_length(note) <= 280),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Chat
-- One conversation per (visitor, company). conversation_members holds the
-- participants and per-participant read state, so future multi-user company
-- accounts only need extra member rows.
-- -----------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  visitor_id       uuid not null references public.profiles (id) on delete cascade,
  subject          text check (subject is null or char_length(subject) <= 200),
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (company_id, visitor_id)
);
create index conversations_visitor_idx on public.conversations (visitor_id, last_message_at desc nulls last);
create index conversations_company_idx on public.conversations (company_id, last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  member_role      text not null check (member_role in ('visitor', 'company')),
  last_read_at     timestamptz,
  joined_at        timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index conversation_members_profile_idx on public.conversation_members (profile_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid references public.profiles (id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at       timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Appointments
-- Accepted appointments for the same representative may not overlap
-- (exclusion constraint). Requests targeting the company in general
-- (member_id null) are not conflict-checked.
-- -----------------------------------------------------------------------------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  requester_id    uuid not null references public.profiles (id) on delete cascade,
  member_id       uuid,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  timezone        text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  meeting_type    public.meeting_type not null,
  purpose         text not null check (char_length(btrim(purpose)) between 3 and 2000),
  meeting_link    text check (meeting_link is null or (meeting_link ~* '^https://' and char_length(meeting_link) <= 500)),
  location_note   text check (location_note is null or char_length(location_note) <= 300),
  status          public.appointment_status not null default 'pending',
  decision_note   text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null,
  cancelled_at    timestamptz,
  cancelled_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint appointments_duration_check
    check (ends_at - starts_at between interval '15 minutes' and interval '4 hours'),
  constraint appointments_member_in_company_fkey
    foreign key (member_id, company_id) references public.company_team_members (id, company_id)
    on delete set null (member_id),
  constraint appointments_no_overlap
    exclude using gist (member_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = 'accepted' and member_id is not null)
);
create index appointments_company_starts_idx on public.appointments (company_id, starts_at);
create index appointments_requester_starts_idx on public.appointments (requester_id, starts_at);
create index appointments_member_idx on public.appointments (member_id) where member_id is not null;
create index appointments_status_idx on public.appointments (status);

-- -----------------------------------------------------------------------------
-- Notifications (written by database triggers / server code only)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  type          public.notification_type not null,
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  body          text check (body is null or char_length(body) <= 1000),
  link          text check (link is null or (link ~ '^/' and char_length(link) <= 500)),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.buildings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.floors
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.floor_layouts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.floor_spaces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.company_registration_requests
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.company_team_members
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
