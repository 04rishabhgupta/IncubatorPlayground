-- =============================================================================
-- Appointment booking
--
-- Builds on the Phase 1 appointments table, which already has:
--   * appointments_no_overlap — no two ACCEPTED appointments for the same
--     representative may overlap (GiST exclusion constraint)
--   * guard_appointment_write — status workflow + immutable details
-- This migration adds:
--   1. booking rules (building time zone, opening hours, grid, durations,
--      notice, horizon) and anti-spam limits, enforced on insert
--   2. notifications for every request and decision
--   3. get_busy_times(): a representative's accepted time ranges, with no
--      details about who booked them
--   4. realtime for appointments (subscribers only receive rows RLS lets them read)
-- The same rules live in src/lib/appointments/rules.ts for instant form feedback.
-- =============================================================================

-- Building time zone for a company (its floor's building; Asia/Kolkata if unplaced).
create function public.company_timezone(p_company_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select b.timezone
       from public.companies c
       join public.floors f on f.id = c.floor_id
       join public.buildings b on b.id = f.building_id
      where c.id = p_company_id),
    'Asia/Kolkata'
  );
$$;

create or replace function public.guard_appointment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_company boolean;
  v_bookable boolean;
  v_tz text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_minutes integer;
  v_pending integer;
begin
  if tg_op = 'INSERT' then
    if new.member_id is not null then
      select is_bookable into v_bookable from public.company_team_members where id = new.member_id;
      if not coalesce(v_bookable, false) then
        raise exception 'this team member is not accepting appointment requests' using errcode = '23514';
      end if;
    end if;

    -- Times are always interpreted in the building's zone, never the client's.
    v_tz := public.company_timezone(new.company_id);
    new.timezone := v_tz;

    if public.is_trusted_context() or public.is_super_admin() then
      return new;
    end if;

    if public.owns_company(new.company_id) then
      raise exception 'companies cannot book appointments with themselves' using errcode = '42501';
    end if;

    v_local_start := new.starts_at at time zone v_tz;
    v_local_end := new.ends_at at time zone v_tz;
    v_minutes := extract(epoch from (new.ends_at - new.starts_at))::integer / 60;

    if new.starts_at < now() + interval '1 hour' then
      raise exception 'appointments must start at least 1 hour in the future' using errcode = '23514';
    end if;
    if v_local_start::date > (now() at time zone v_tz)::date + 60 then
      raise exception 'appointments can be booked at most 60 days ahead' using errcode = '23514';
    end if;
    if v_minutes not in (15, 30, 45, 60, 90, 120) then
      raise exception 'appointment duration must be 15, 30, 45, 60, 90 or 120 minutes' using errcode = '23514';
    end if;
    if extract(minute from v_local_start)::integer % 15 <> 0 or extract(second from v_local_start) <> 0 then
      raise exception 'appointments start on 15-minute intervals' using errcode = '23514';
    end if;
    if v_local_start::time < time '08:00'
       or v_local_end > v_local_start::date + time '20:00' then
      raise exception 'appointments must be between 08:00 and 20:00 building time' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.appointments a
       where a.requester_id = new.requester_id
         and a.company_id = new.company_id
         and a.member_id is not distinct from new.member_id
         and a.starts_at = new.starts_at
         and a.status = 'pending'
    ) then
      raise exception 'you already have a pending request for this time' using errcode = '23505';
    end if;

    select count(*) into v_pending
      from public.appointments a
     where a.requester_id = new.requester_id
       and a.company_id = new.company_id
       and a.status = 'pending'
       and a.starts_at > now();
    if v_pending >= 3 then
      raise exception 'you can have at most 3 pending requests with a company' using errcode = '23514';
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

  -- UPDATE (unchanged from Phase 1)
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

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create function public.after_appointment_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_company record;
  v_requester text;
  v_member text;
  v_when text;
begin
  select c.name, c.owner_id into v_company from public.companies c where c.id = new.company_id;
  select coalesce(nullif(p.full_name, ''), p.email) into v_requester from public.profiles p where p.id = new.requester_id;
  select m.full_name into v_member from public.company_team_members m where m.id = new.member_id;
  v_when := to_char(new.starts_at at time zone new.timezone, 'Dy DD Mon, HH12:MI AM');

  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    values (
      v_company.owner_id, 'appointment_requested',
      'New appointment request',
      v_requester || ' requested ' || v_when || coalesce(' with ' || v_member, '') || '.',
      '/company/appointments',
      jsonb_build_object('appointment_id', new.id)
    );
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'accepted' then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    values (new.requester_id, 'appointment_accepted',
            v_company.name || ' accepted your appointment',
            v_when || coalesce(' with ' || v_member, '') || coalesce('. ' || new.decision_note, '.'),
            '/account/appointments', jsonb_build_object('appointment_id', new.id));
  elsif new.status = 'rejected' then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    values (new.requester_id, 'appointment_rejected',
            v_company.name || ' declined your appointment request',
            v_when || coalesce('. ' || new.decision_note, '.'),
            '/account/appointments', jsonb_build_object('appointment_id', new.id));
  elsif new.status = 'cancelled' and new.cancelled_by is not distinct from new.requester_id then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    values (v_company.owner_id, 'appointment_cancelled',
            v_requester || ' cancelled an appointment',
            v_when || coalesce(' with ' || v_member, '') || '.',
            '/company/appointments', jsonb_build_object('appointment_id', new.id));
  elsif new.status = 'cancelled' then
    insert into public.notifications (recipient_id, type, title, body, link, data)
    values (new.requester_id, 'appointment_cancelled',
            v_company.name || ' cancelled your appointment',
            v_when || coalesce('. ' || new.decision_note, '.'),
            '/account/appointments', jsonb_build_object('appointment_id', new.id));
  end if;
  return new;
end;
$$;

create trigger after_appointment_change
  after insert or update of status on public.appointments
  for each row execute function public.after_appointment_change();

revoke execute on function public.after_appointment_change() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Busy times: only start/end of accepted meetings for a public, bookable
-- representative of an approved company. No requester, purpose or status.
-- -----------------------------------------------------------------------------
create function public.get_busy_times(p_member_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.starts_at, a.ends_at
    from public.appointments a
   where a.member_id = p_member_id
     and a.status = 'accepted'
     and a.starts_at < p_to
     and a.ends_at > p_from
     and p_to - p_from <= interval '62 days'
     and public.is_member_public(p_member_id)
   order by a.starts_at;
$$;

revoke execute on function public.get_busy_times(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_busy_times(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Realtime: lets the company inbox refresh when a request arrives.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end;
$$;
