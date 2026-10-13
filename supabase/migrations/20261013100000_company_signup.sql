-- =============================================================================
-- Company self-registration
--
-- A company signs up through Supabase Auth with
--   raw_user_meta_data = {
--     account_type: 'company',
--     full_name: <representative>,
--     company: { name, industry_slug, tagline, description, website,
--                business_email, phone, office_details, founded_year }
--   }
-- The signup trigger creates the profile, the company (always 'pending') and
-- its registration request in the same transaction as the auth user, so a
-- company account can never exist without its company record.
--
-- Metadata is user-controlled: every value is length/format-checked by the
-- table constraints, the status is fixed to 'pending', and placement fields are
-- never read from it. Invalid company data aborts the signup.
-- =============================================================================

-- Lowercase kebab-case slug, max 60 chars. Empty input yields 'company'.
create function public.slugify(p_value text)
returns text
language sql immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g')),
        60
      ),
      ''
    ),
    'company'
  );
$$;

-- Returns a slug for p_name that is not yet used by any company.
create function public.unique_company_slug(p_name text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_base text := trim(both '-' from public.slugify(p_name));
  v_slug text := v_base;
begin
  while exists (select 1 from public.companies where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 6);
  end loop;
  return v_slug;
end;
$$;

-- Treat blank strings in metadata as missing.
create function public.meta_text(p_meta jsonb, p_key text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(p_meta ->> p_key), '');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_is_company boolean := coalesce(v_meta ->> 'account_type' = 'company', false);
  v_company jsonb := coalesce(v_meta -> 'company', '{}'::jsonb);
  v_company_id uuid;
  v_name text;
  v_founded text;
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(btrim(coalesce(v_meta ->> 'full_name', '')), 120),
    case when v_is_company then 'company'::public.app_role else 'visitor'::public.app_role end
  );

  if not v_is_company then
    return new;
  end if;

  if jsonb_typeof(v_company) <> 'object' then
    raise exception 'company registration details are missing' using errcode = '22023';
  end if;

  v_name := public.meta_text(v_company, 'name');
  if v_name is null then
    raise exception 'company name is required' using errcode = '22023';
  end if;

  v_founded := public.meta_text(v_company, 'founded_year');
  if v_founded is not null and v_founded !~ '^[0-9]{4}$' then
    raise exception 'founded year must be a four-digit year' using errcode = '22023';
  end if;

  insert into public.companies (
    owner_id, name, slug, tagline, description, industry_id, website,
    business_email, phone, office_details, founded_year
  )
  values (
    new.id,
    v_name,
    public.unique_company_slug(v_name),
    public.meta_text(v_company, 'tagline'),
    public.meta_text(v_company, 'description'),
    (select id from public.industries where slug = public.meta_text(v_company, 'industry_slug')),
    public.meta_text(v_company, 'website'),
    coalesce(public.meta_text(v_company, 'business_email'), new.email),
    public.meta_text(v_company, 'phone'),
    public.meta_text(v_company, 'office_details'),
    v_founded::smallint
  )
  returning id into v_company_id;

  insert into public.company_registration_requests (company_id, submitted_by, submitted_data)
  values (v_company_id, new.id, v_company);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.unique_company_slug(text) from public, anon, authenticated;
grant execute on function public.unique_company_slug(text) to service_role;
