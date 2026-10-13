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
    placed: [],
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

  // Two approved companies in whichever offices are vacant on Floor 1, so the
  // map has content without colliding with data added by hand.
  const { data: floor } = await admin.from("floors").select("id").eq("slug", "floor-1").single();
  const [{ data: offices }, { data: taken }] = await Promise.all([
    admin
      .from("floor_spaces")
      .select("id, code, label")
      .eq("floor_id", floor!.id)
      .eq("kind", "office")
      .order("sort_order"),
    admin.from("companies").select("space_id").not("space_id", "is", null),
  ]);
  const vacant = (offices ?? []).filter((o) => !(taken ?? []).some((t) => t.space_id === o.id));
  if (vacant.length < 3) throw new Error("E2E map tests need at least 3 vacant offices on Floor 1");

  const fixtures = [
    {
      key: "alpha",
      name: `Map Alpha ${runId}`,
      industry: "artificial-intelligence",
      availability: "available" as const,
      team: [
        { full_name: "Asha Rao", job_title: "Founder", status: "available" as const },
        { full_name: "Kiran Das", job_title: "Engineer", status: null },
      ],
    },
    { key: "beta", name: `Map Beta ${runId}`, industry: "saas", availability: "busy" as const, team: [] },
  ];
  for (const [i, fx] of fixtures.entries()) {
    const ownerId = await create(fx.key, {
      account_type: "company",
      full_name: `${fx.key} owner`,
      company: {
        name: fx.name,
        industry_slug: fx.industry,
        tagline: `${fx.name} tagline`,
        description: "Floor map test company created by the automated test suite.",
      },
    });
    const office = vacant[i];
    const { data: company, error: placeError } = await admin
      .from("companies")
      .update({ status: "approved", floor_id: floor!.id, space_id: office.id })
      .eq("owner_id", ownerId)
      .select("id, slug")
      .single();
    if (placeError || !company) throw new Error(`Could not place ${fx.key}: ${placeError?.message}`);
    await admin.from("company_availability").insert({ company_id: company.id, status: fx.availability });
    for (const [order, member] of fx.team.entries()) {
      const { data: m } = await admin
        .from("company_team_members")
        .insert({
          company_id: company.id,
          full_name: member.full_name,
          job_title: member.job_title,
          sort_order: order,
        })
        .select("id")
        .single();
      if (member.status && m)
        await admin.from("member_availability").insert({ member_id: m.id, status: member.status });
    }
    accounts.placed.push({
      ownerId,
      email: email(fx.key),
      companyId: company.id,
      name: fx.name,
      slug: company.slug,
      spaceCode: office.code,
      spaceLabel: office.label,
    });
  }

  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(accounts, null, 2));
}
