import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../src/types/database";
import { adminClient, anonClient, loadEnv, PASSWORD, readAccounts } from "./support";

/**
 * Row Level Security against the real Supabase project (Phase 8): the same
 * rules the PGlite tests check, but through the real Data API, Auth and
 * Postgres. Each actor uses the publishable key and its own session, exactly
 * like the browser does. Data created here belongs to the run's accounts and
 * is removed by global teardown.
 */
const accounts = readAccounts();
const alpha = () => accounts.placed[0];
const beta = () => accounts.placed[1];

test.describe.configure({ mode: "serial" });

async function signedInClient(email: string) {
  const env = loadEnv();
  const client = createClient<Database>(env.url, env.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** A query that must come back empty or be refused outright. */
async function seesNothing(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  return Boolean(error) || (data ?? []).length === 0;
}

let conversationId: string;

test.beforeAll(async () => {
  // A private conversation between Beta (as a company account) and Alpha.
  const betaClient = await signedInClient(beta().email);
  const { data, error } = await betaClient.rpc("start_conversation", {
    p_company_id: alpha().companyId,
    p_subject: "",
  });
  if (error || !data) throw new Error(`Could not start conversation: ${error?.message}`);
  conversationId = data;
  await betaClient.from("messages").insert({
    conversation_id: conversationId,
    sender_id: beta().ownerId,
    body: `RLS check ${accounts.runId}`,
  });
});

test("guests read the public floor and directory, and nothing private", async () => {
  const anon = anonClient();
  expect((await anon.from("floors").select("id")).data?.length).toBeGreaterThan(0);
  expect((await anon.from("companies").select("id").eq("id", alpha().companyId)).data).toHaveLength(1);

  for (const table of [
    "profiles",
    "notifications",
    "conversations",
    "messages",
    "contact_messages",
    "office_requests",
    "floor_layout_versions",
    "appointments",
  ] as const) {
    expect(await seesNothing(anon.from(table).select("*").limit(1)), table).toBe(true);
  }
  expect(
    (await anon.rpc("start_conversation", { p_company_id: alpha().companyId, p_subject: "" })).error,
  ).not.toBeNull();
  expect(
    (await anon.from("announcements").insert({ title: `Spam ${accounts.runId}` })).error,
    "guests can't post announcements",
  ).not.toBeNull();
});

test("a conversation is private to its two members — not other users, not the admin", async () => {
  const read = async (email: string) =>
    (
      await (
        await signedInClient(email)
      )
        .from("messages")
        .select("body")
        .eq("conversation_id", conversationId)
    ).data ?? [];

  expect(await read(beta().email)).toHaveLength(1);
  expect(await read(alpha().email)).toHaveLength(1);
  expect(await read(accounts.visitor.email)).toHaveLength(0);
  expect(await read(accounts.admin.email)).toHaveLength(0);

  // Not a member: can't post into it either.
  const visitor = await signedInClient(accounts.visitor.email);
  const { error } = await visitor
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: accounts.visitor.id, body: "let me in" });
  expect(error).not.toBeNull();
});

test("users can't raise their own privileges or approve themselves", async () => {
  const visitor = await signedInClient(accounts.visitor.email);
  const promote = await visitor
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", accounts.visitor.id);
  expect(promote.error?.message).toMatch(/only a super admin/);

  // A fresh pending company of this run (earlier specs approve the shared one on purpose).
  const admin = adminClient();
  const email = `sfc-e2e-pending-${accounts.runId}@e2e-test.dev`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      account_type: "company",
      company: { name: `E2E Pending ${accounts.runId}`, description: "Pending company for the RLS check." },
    },
  });
  if (createError || !created.user)
    throw new Error(`Could not create pending company: ${createError?.message}`);
  const company = await signedInClient(email);
  const approve = await company
    .from("companies")
    .update({ status: "approved" })
    .eq("owner_id", created.user.id);
  expect(approve.error?.message).toMatch(/only a super admin can change/);

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", accounts.visitor.id)
    .single();
  expect(profile?.role).toBe("visitor");
  const { data: pending } = await admin
    .from("companies")
    .select("status")
    .eq("owner_id", created.user.id)
    .single();
  expect(pending?.status).toBe("pending");
});

test("notifications and office requests stay with their owners", async () => {
  const alphaClient = await signedInClient(alpha().email);
  const visitor = await signedInClient(accounts.visitor.email);

  // Alpha has a message notification from Beta; nobody else can see it.
  expect(
    (
      await alphaClient
        .from("notifications")
        .select("id")
        .eq("type", "message_received")
        .eq("data->>conversation_id", conversationId)
    ).data?.length,
  ).toBe(1);
  expect(
    await seesNothing(visitor.from("notifications").select("id").eq("recipient_id", alpha().ownerId)),
  ).toBe(true);

  // Admin-only tables refuse ordinary users.
  expect(await seesNothing(visitor.from("floor_layout_versions").select("id"))).toBe(true);
  expect(
    (await visitor.from("incubator_staff").insert({ building_id: crypto.randomUUID(), full_name: "x" }))
      .error,
  ).not.toBeNull();
});
