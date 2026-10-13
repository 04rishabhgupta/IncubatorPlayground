import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adminClient, PASSWORD, STATE_FILE, type Accounts } from "./support";

/** Creates confirmed test accounts directly through the admin API (no emails sent). */
export default async function globalSetup() {
  const admin = adminClient();
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (role: string) => `sfc-e2e-${role}-${runId}@e2e-test.dev`;

  async function create(role: string, metadata: Record<string, unknown>) {
    const { data, error } = await admin.auth.admin.createUser({
      email: email(role),
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw new Error(`Could not create ${role} test user: ${error?.message}`);
    return data.user.id;
  }

  const companyName = `E2E Robotics ${runId}`;
  const accounts: Accounts = {
    runId,
    visitor: { id: "", email: email("visitor"), name: "Vera E2E" },
    company: { id: "", email: email("company"), name: "Rahul E2E", companyName },
    admin: { id: "", email: email("admin"), name: "Admin E2E" },
  };

  accounts.visitor.id = await create("visitor", { full_name: accounts.visitor.name });
  accounts.company.id = await create("company", {
    account_type: "company",
    full_name: accounts.company.name,
    company: {
      name: companyName,
      industry_slug: "deep-tech-hardware",
      tagline: "Robots for labs",
      description: "End-to-end test company created by the automated test suite.",
      business_email: accounts.company.email,
      office_details: "Office 101 please",
      founded_year: "2021",
    },
  });
  accounts.admin.id = await create("admin", { full_name: accounts.admin.name });

  // Super admin is only ever granted from a trusted context.
  const { error } = await admin.from("profiles").update({ role: "super_admin" }).eq("id", accounts.admin.id);
  if (error) throw new Error(`Could not promote admin test user: ${error.message}`);

  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(accounts, null, 2));
}
