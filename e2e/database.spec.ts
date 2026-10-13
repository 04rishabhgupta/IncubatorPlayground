import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../src/types/database";
import { adminClient, anonClient, loadEnv, PASSWORD, readAccounts } from "./support";

/** Checks the signup trigger and RLS against the real Supabase project. */
const accounts = readAccounts();

async function signedInClient(email: string) {
  const env = loadEnv();
  const client = createClient<Database>(env.url, env.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return client;
}

test("company signup created a pending company and registration request", async () => {
  const { data: company } = await adminClient()
    .from("companies")
    .select(
      "name, status, slug, owner_id, space_id, industry:industries(slug), requests:company_registration_requests(status)",
    )
    .eq("owner_id", accounts.company.id)
    .single();
  expect(company).toMatchObject({
    name: accounts.company.companyName,
    status: "pending",
    space_id: null,
    industry: { slug: "deep-tech-hardware" },
    requests: [{ status: "pending" }],
  });
  expect(company?.slug).toMatch(/^e2e-robotics-/);
});

test("roles were assigned correctly", async () => {
  const { data } = await adminClient()
    .from("profiles")
    .select("id, role")
    .in("id", [accounts.visitor.id, accounts.company.id, accounts.admin.id]);
  const roles = Object.fromEntries((data ?? []).map((p) => [p.id, p.role]));
  expect(roles).toEqual({
    [accounts.visitor.id]: "visitor",
    [accounts.company.id]: "company",
    [accounts.admin.id]: "super_admin",
  });
});

test("pending companies are hidden from guests and other users", async () => {
  const guest = await anonClient().from("companies").select("id").eq("owner_id", accounts.company.id);
  expect(guest.data).toEqual([]);
  const visitor = await signedInClient(accounts.visitor.email);
  const asVisitor = await visitor.from("companies").select("id").eq("owner_id", accounts.company.id);
  expect(asVisitor.data).toEqual([]);
});

test("a company account cannot approve itself", async () => {
  const company = await signedInClient(accounts.company.email);
  const { error } = await company
    .from("companies")
    .update({ status: "approved" })
    .eq("owner_id", accounts.company.id);
  expect(error?.message).toMatch(/only a super admin/);
});

test("users cannot promote themselves", async () => {
  const visitor = await signedInClient(accounts.visitor.email);
  const { error } = await visitor
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", accounts.visitor.id);
  expect(error?.message).toMatch(/super admin can change roles/);
});

test("signing up with company metadata but no company name is rejected", async () => {
  const { error } = await adminClient().auth.admin.createUser({
    email: `sfc-e2e-bad-${accounts.runId}@e2e-test.dev`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { account_type: "company", company: { name: "" } },
  });
  expect(error).not.toBeNull();
});
