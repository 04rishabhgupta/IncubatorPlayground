-- =============================================================================
-- Phase 7: communication
--
--   * start_conversation()      the only way to open a chat (conversations and
--                               members have no insert grants for end users)
--   * message notifications     one unread "new message" notification per
--                               conversation and recipient, updated, not repeated
--   * send limit                20 messages per minute per sender
--   * contact_messages          log of the email contact form, with limits
--
-- Adds functions, triggers and one table; no existing rows are changed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Starting a conversation
-- -----------------------------------------------------------------------------
-- Any visitor or company account may message an approved company that isn't
-- its own. Returns the existing conversation when there is one.
create function public.start_conversation(p_company_id uuid, p_subject text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_owner uuid;
  v_status public.company_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in to send a message' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null or v_role not in ('visitor', 'company') then
    raise exception 'only visitor and company accounts can start conversations' using errcode = '42501';
  end if;

  select owner_id, status into v_owner, v_status from public.companies where id = p_company_id;
  if v_owner is null or v_status is distinct from 'approved' then
    raise exception 'this company can''t be contacted' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'you can''t message your own company' using errcode = '22023';
  end if;

  select id into v_id from public.conversations where company_id = p_company_id and visitor_id = v_uid;
  if v_id is null then
    insert into public.conversations (company_id, visitor_id, subject)
    values (p_company_id, v_uid, nullif(left(btrim(p_subject), 200), ''))
    on conflict (company_id, visitor_id) do nothing
    returning id into v_id;
    if v_id is null then -- created concurrently
      select id into v_id from public.conversations where company_id = p_company_id and visitor_id = v_uid;
    end if;
  end if;

  insert into public.conversation_members (conversation_id, profile_id, member_role)
  values (v_id, v_uid, 'visitor'), (v_id, v_owner, 'company')
  on conflict (conversation_id, profile_id) do nothing;

  return v_id;
end;
$$;

revoke execute on function public.start_conversation(uuid, text) from public, anon;
grant execute on function public.start_conversation(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Sending: server timestamps (as before) plus a per-sender limit
-- -----------------------------------------------------------------------------
create or replace function public.prepare_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_trusted_context() then
    new.created_at := now();
    if (select count(*) from public.messages
         where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
      raise exception 'you are sending messages too quickly; wait a minute and try again'
        using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- After a message: bump the conversation and the sender's read state (as
-- before), and notify the other members, merging into their unread
-- notification for this conversation instead of adding one per message.
-- -----------------------------------------------------------------------------
create or replace function public.after_message_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_sender_role text;
  v_sender_name text;
  v_recipient uuid;
  v_count integer;
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
  returning company_id into v_company_id;
  update public.conversation_members
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id and profile_id = new.sender_id;

  -- Who it's from, as the recipient knows them: the company's name, or the person's.
  select member_role into v_sender_role
    from public.conversation_members
   where conversation_id = new.conversation_id and profile_id = new.sender_id;
  if v_sender_role = 'company' then
    select name into v_sender_name from public.companies where id = v_company_id;
  else
    select nullif(btrim(full_name), '') into v_sender_name from public.profiles where id = new.sender_id;
  end if;
  v_sender_name := coalesce(v_sender_name, 'a visitor');

  for v_recipient in
    select profile_id from public.conversation_members
     where conversation_id = new.conversation_id and profile_id is distinct from new.sender_id
  loop
    update public.notifications
       set data = data || jsonb_build_object('count', coalesce((data ->> 'count')::integer, 1) + 1),
           body = left(new.body, 200),
           created_at = new.created_at
     where recipient_id = v_recipient
       and type = 'message_received'
       and read_at is null
       and data ->> 'conversation_id' = new.conversation_id::text
    returning (data ->> 'count')::integer into v_count;

    if v_count is null then
      insert into public.notifications (recipient_id, type, title, body, link, data)
      values (v_recipient, 'message_received', 'New message from ' || v_sender_name,
              left(new.body, 200), '/messages/' || new.conversation_id,
              jsonb_build_object('conversation_id', new.conversation_id, 'count', 1));
    else
      update public.notifications
         set title = v_count || ' new messages from ' || v_sender_name
       where recipient_id = v_recipient
         and type = 'message_received'
         and read_at is null
         and data ->> 'conversation_id' = new.conversation_id::text;
    end if;
    v_count := null;
  end loop;

  return new;
end;
$$;

-- Read receipts ("Seen") update live: members' last_read_at changes are broadcast
-- to the other member only (Realtime applies the same RLS as reads).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Email contact form: every submission is logged; sender details come from
-- the signed-in account, not the form, so they can't be forged.
-- -----------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'contact_message';

create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  sender_id     uuid references public.profiles (id) on delete set null,
  sender_name   text not null check (char_length(btrim(sender_name)) between 1 and 120),
  sender_email  text not null check (char_length(sender_email) <= 254),
  subject       text not null check (char_length(btrim(subject)) between 1 and 150),
  body          text not null check (char_length(btrim(body)) between 1 and 5000),
  -- pending → sent | not_configured (no email provider set up) | failed
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'not_configured', 'failed')),
  error         text check (error is null or char_length(error) <= 500),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index contact_messages_company_idx on public.contact_messages (company_id, created_at desc);
create index contact_messages_sender_idx on public.contact_messages (sender_id, created_at desc);

create function public.prepare_contact_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
begin
  if public.is_trusted_context() then
    return new;
  end if;
  select nullif(btrim(full_name), ''), email into v_name, v_email
    from public.profiles where id = (select auth.uid());
  new.sender_id := (select auth.uid());
  new.sender_email := v_email;
  new.sender_name := coalesce(nullif(btrim(new.sender_name), ''), v_name, v_email);
  new.status := 'pending';
  new.error := null;
  new.sent_at := null;
  new.created_at := now();

  if not public.is_company_public(new.company_id) then
    raise exception 'this company can''t be contacted' using errcode = 'P0002';
  end if;
  if public.owns_company(new.company_id) then
    raise exception 'you can''t email your own company' using errcode = '22023';
  end if;
  if (select count(*) from public.contact_messages
       where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'you have sent 3 messages in the last hour; try again later' using errcode = '54000';
  end if;
  if (select count(*) from public.contact_messages
       where company_id = new.company_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'this company has received many messages today; try again tomorrow' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger prepare_contact_message before insert on public.contact_messages
  for each row execute function public.prepare_contact_message();

-- The company hears about it in the app too (whether or not email is set up).
create function public.after_contact_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link, data)
  select c.owner_id, 'contact_message', 'Message from ' || new.sender_name || ': ' || left(new.subject, 120),
         left(new.body, 200), '/company/contact', jsonb_build_object('contact_message_id', new.id)
    from public.companies c where c.id = new.company_id;
  return new;
end;
$$;

create trigger after_contact_message after insert on public.contact_messages
  for each row execute function public.after_contact_message();

-- The sender's server action records the outcome of sending, once.
create function public.set_contact_delivery(p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'not_configured', 'failed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.contact_messages
     set status = p_status,
         error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() end
   where id = p_id and sender_id = (select auth.uid()) and status = 'pending';
end;
$$;

revoke execute on function public.prepare_contact_message(), public.after_contact_message()
  from public, anon, authenticated;
revoke execute on function public.set_contact_delivery(uuid, text, text) from public, anon;
grant execute on function public.set_contact_delivery(uuid, text, text) to authenticated;

grant select, insert on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;
alter table public.contact_messages enable row level security;

create policy "contact_messages: sender, company or admin read" on public.contact_messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or public.owns_company(company_id) or public.is_super_admin());
create policy "contact_messages: signed-in users send" on public.contact_messages
  for insert to authenticated with check (sender_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- The signed-in user's conversations for the inbox: who it's with, the last
-- message and how many are unread. Runs with the caller's rights, so RLS
-- decides what it can see (a company that is no longer public shows by name
-- only to people who can still read it).
-- -----------------------------------------------------------------------------
create function public.my_conversations()
returns table (
  id uuid,
  company_id uuid,
  company_slug text,
  my_role text,
  other_name text,
  subject text,
  last_message_at timestamptz,
  last_body text,
  last_from_me boolean,
  unread integer
)
language sql stable
set search_path = ''
as $$
  select c.id,
         c.company_id,
         co.slug,
         m.member_role,
         case when m.member_role = 'visitor'
              then coalesce(co.name, 'A company')
              else coalesce(nullif(btrim(p.full_name), ''), 'A visitor') end,
         c.subject,
         c.last_message_at,
         lm.body,
         lm.sender_id = (select auth.uid()),
         (select count(*)::integer
            from public.messages x
           where x.conversation_id = c.id
             and x.sender_id is distinct from (select auth.uid())
             and (m.last_read_at is null or x.created_at > m.last_read_at))
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
    left join public.companies co on co.id = c.company_id
    left join public.profiles p on p.id = c.visitor_id
    left join lateral (
      select body, sender_id from public.messages
       where conversation_id = c.id order by created_at desc limit 1
    ) lm on true
   where m.profile_id = (select auth.uid())
   order by c.last_message_at desc nulls last, c.created_at desc;
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;
