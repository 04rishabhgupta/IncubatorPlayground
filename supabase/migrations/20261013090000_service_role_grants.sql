-- =============================================================================
-- Grant the service role (server-side secret key) access to the public schema.
--
-- The security migration revokes everything and grants explicitly, but only to
-- anon/authenticated. Newer Supabase projects no longer grant table privileges
-- to service_role by default, so trusted server code was denied access.
-- service_role bypasses RLS and is used only from server code that has already
-- authorized the caller (src/lib/supabase/admin.ts).
-- =============================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables and functions created by later migrations get the same access.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
