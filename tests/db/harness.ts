import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

/**
 * Runs the real migrations against PGlite (Postgres compiled to WASM) with a
 * minimal stand-in for the parts of Supabase the migrations depend on:
 * the anon/authenticated/service_role roles, auth.users + auth.uid(),
 * storage.buckets/objects and the supabase_realtime publication.
 * The shim mirrors Supabase's behaviour closely enough to exercise RLS, but
 * it is not a substitute for testing against a real Supabase project.
 */
const SUPABASE_SHIM = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema extensions;
  create schema auth;
  create schema storage;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;

  create publication supabase_realtime;
`;

const root = path.resolve(import.meta.dirname, "../..");

export async function createTestDatabase() {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(SUPABASE_SHIM);

  const migrationsDir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  await db.exec(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  return db;
}

export type Db = PGlite;
export type Actor = { role: "anon" } | { role: "service_role" } | { role: "authenticated"; uid: string };

export const anon: Actor = { role: "anon" };
export const serviceRole: Actor = { role: "service_role" };
export const user = (uid: string): Actor => ({ role: "authenticated", uid });

/** Run a query as an API role, with a simulated JWT `sub` claim for authenticated users. */
export async function as<T = Record<string, unknown>>(
  db: Db,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      actor.role === "authenticated" ? actor.uid : "",
    ]);
    await tx.exec(`set local role ${actor.role}`);
    return tx.query<T>(sql, params);
  });
}

/** Create an auth user (fires the signup trigger) and return its id. */
export async function createAuthUser(db: Db, email: string, metadata: Record<string, unknown> = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify(metadata)],
  );
  return rows[0].id;
}
