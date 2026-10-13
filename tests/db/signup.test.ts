import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

let db: Db;

const companyMeta = (overrides: Record<string, unknown> = {}) => ({
  account_type: "company",
  full_name: "Rahul Rep",
  company: {
    name: "Acme Robotics",
    industry_slug: "deep-tech-hardware",
    tagline: "Robots for labs",
    description: "We build lab automation robots.",
    website: "https://acme.example",
    business_email: "contact@acme.example",
    phone: "+91 98765 43210",
    office_details: "Currently in Office 101",
    founded_year: "2021",
    ...overrides,
  },
});

beforeAll(async () => {
  db = await createTestDatabase();
});

describe("visitor signup", () => {
  it("creates only a visitor profile", async () => {
    const id = await createAuthUser(db, "vera@example.com", { full_name: "  Vera Visitor  " });
    const profile = await db.query(`select full_name, role from public.profiles where id = $1`, [id]);
    expect(profile.rows).toEqual([{ full_name: "Vera Visitor", role: "visitor" }]);
    const companies = await db.query(`select 1 from public.companies where owner_id = $1`, [id]);
    expect(companies.rows).toHaveLength(0);
  });
});

describe("company signup", () => {
  it("creates profile, pending company and registration request atomically", async () => {
    const id = await createAuthUser(db, "owner@acme.example", companyMeta());

    const { rows } = await db.query<Record<string, unknown>>(
      `select c.name, c.slug, c.status, c.tagline, c.website, c.business_email, c.founded_year,
              c.office_details, i.slug as industry, p.role, p.full_name
         from public.companies c
         join public.profiles p on p.id = c.owner_id
         left join public.industries i on i.id = c.industry_id
        where c.owner_id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      name: "Acme Robotics",
      slug: "acme-robotics",
      status: "pending",
      tagline: "Robots for labs",
      website: "https://acme.example",
      business_email: "contact@acme.example",
      founded_year: 2021,
      office_details: "Currently in Office 101",
      industry: "deep-tech-hardware",
      role: "company",
      full_name: "Rahul Rep",
    });

    const requests = await db.query<{ status: string; name: string }>(
      `select r.status, r.submitted_data ->> 'name' as name
         from public.company_registration_requests r
         join public.companies c on c.id = r.company_id
        where c.owner_id = $1`,
      [id],
    );
    expect(requests.rows).toEqual([{ status: "pending", name: "Acme Robotics" }]);
  });

  it("generates a unique slug when the name is taken", async () => {
    const id = await createAuthUser(db, "owner2@acme.example", companyMeta());
    const { rows } = await db.query<{ slug: string }>(
      `select slug from public.companies where owner_id = $1`,
      [id],
    );
    expect(rows[0].slug).toMatch(/^acme-robotics-[0-9a-f]{6}$/);
  });

  it("ignores attempts to self-approve or pick an office through metadata", async () => {
    const id = await createAuthUser(db, "sneaky@acme.example", {
      ...companyMeta({ name: "Sneaky Co", status: "approved" }),
      status: "approved",
      space_id: "00000000-0000-4000-8000-000000000101",
    });
    const { rows } = await db.query(
      `select status, floor_id, space_id from public.companies where owner_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ status: "pending", floor_id: null, space_id: null }]);
  });

  it("falls back to the login email and tolerates an unknown industry and blank optionals", async () => {
    const id = await createAuthUser(
      db,
      "minimal@startup.example",
      companyMeta({
        name: "Minimal",
        industry_slug: "not-a-real-industry",
        business_email: "",
        website: "  ",
        tagline: "",
        founded_year: "",
      }),
    );
    const { rows } = await db.query(
      `select business_email, industry_id, website, tagline, founded_year from public.companies where owner_id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        business_email: "minimal@startup.example",
        industry_id: null,
        website: null,
        tagline: null,
        founded_year: null,
      },
    ]);
  });

  it.each([
    ["missing company name", companyMeta({ name: " " }), /company name is required/],
    [
      "invalid website",
      companyMeta({ name: "Bad Web", website: "javascript:alert(1)" }),
      /companies_website_check/,
    ],
    ["invalid founded year", companyMeta({ name: "Bad Year", founded_year: "20x1" }), /four-digit year/],
    ["out-of-range founded year", companyMeta({ name: "Old", founded_year: "1066" }), /founded_year_check/],
  ])("rejects the whole signup on %s", async (_label, meta, error) => {
    const email = `bad-${Math.random().toString(36).slice(2)}@example.com`;
    await expect(createAuthUser(db, email, meta)).rejects.toThrow(error);
    const users = await db.query(`select 1 from auth.users where email = $1`, [email]);
    expect(users.rows).toHaveLength(0);
  });

  it("lets the new company account see its own pending company but hides it publicly", async () => {
    const id = await createAuthUser(
      db,
      "visible@acme.example",
      companyMeta({ name: "Hidden Until Approved" }),
    );
    const own = await as(db, user(id), `select name, status from public.companies where owner_id = $1`, [id]);
    expect(own.rows).toEqual([{ name: "Hidden Until Approved", status: "pending" }]);
    const pub = await as(db, anon, `select name from public.companies`);
    expect(pub.rows).toHaveLength(0);
    const req = await as(db, user(id), `select status from public.company_registration_requests`);
    expect(req.rows).toEqual([{ status: "pending" }]);
  });

  it("does not expose the slug helper to API users", async () => {
    await expect(as(db, anon, `select public.unique_company_slug('x')`)).rejects.toThrow(/permission denied/);
  });
});

describe("slugify", () => {
  it.each([
    ["Acme Robotics Pvt. Ltd.", "acme-robotics-pvt-ltd"],
    ["  --Hello__World--  ", "hello-world"],
    ["नमस्ते", "company"],
    ["", "company"],
  ])("%s -> %s", async (input, expected) => {
    const { rows } = await db.query<{ slug: string }>(`select public.slugify($1) as slug`, [input]);
    expect(rows[0].slug).toBe(expected);
  });
});
