import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

let db: Db;
let adminId: string;
let ownerId: string;
let otherOwnerId: string;
let companyId: string;

const companyMeta = (name: string) => ({
  account_type: "company",
  full_name: "Owner",
  company: { name, industry_slug: "saas", description: "A test company for the review workflow." },
});

async function companyRow() {
  const { rows } = await db.query<Record<string, unknown>>(
    `select status, status_reason, reviewed_by, reviewed_at from public.companies where id = $1`,
    [companyId],
  );
  return rows[0];
}

async function requests() {
  const { rows } = await db.query<{
    status: string;
    review_notes: string | null;
    reviewed_by: string | null;
  }>(
    `select status, review_notes, reviewed_by from public.company_registration_requests
      where company_id = $1 order by created_at, status desc`,
    [companyId],
  );
  return rows;
}

async function notifications() {
  const { rows } = await as<{ type: string; title: string; body: string | null }>(
    db,
    user(ownerId),
    `select type, title, body from public.notifications order by created_at`,
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com");
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  ownerId = await createAuthUser(db, "owner@acme.example", companyMeta("Acme"));
  otherOwnerId = await createAuthUser(db, "owner@globex.example", companyMeta("Globex"));
  const { rows } = await db.query<{ id: string }>(`select id from public.companies where owner_id = $1`, [
    ownerId,
  ]);
  companyId = rows[0].id;
});

describe("rejection", () => {
  it("requires a reason", async () => {
    await expect(
      as(db, user(adminId), `update public.companies set status = 'rejected' where id = $1`, [companyId]),
    ).rejects.toThrow(/companies_reason_required/);
    await expect(
      as(
        db,
        user(adminId),
        `update public.companies set status = 'rejected', status_reason = '  ' where id = $1`,
        [companyId],
      ),
    ).rejects.toThrow(/companies_reason_required/);
  });

  it("resolves the request and notifies the owner in one step", async () => {
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'rejected', status_reason = 'Please add a website.' where id = $1`,
      [companyId],
    );
    expect(await companyRow()).toMatchObject({ status: "rejected", reviewed_by: adminId });
    expect(await requests()).toEqual([
      { status: "rejected", review_notes: "Please add a website.", reviewed_by: adminId },
    ]);
    expect(await notifications()).toEqual([
      {
        type: "company_rejected",
        title: "Your company registration was not approved",
        body: "Please add a website.",
      },
    ]);
  });

  it("keeps notifications private to the owner", async () => {
    const { rows } = await as(db, user(otherOwnerId), `select id from public.notifications`);
    expect(rows).toHaveLength(0);
  });
});

describe("resubmission", () => {
  it("is only available to the owner of a rejected company", async () => {
    await expect(as(db, user(otherOwnerId), `select public.resubmit_company_registration()`)).rejects.toThrow(
      /only rejected registrations/,
    );
    await expect(as(db, anon, `select public.resubmit_company_registration()`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("moves the company back to pending with a new request", async () => {
    await as(
      db,
      user(ownerId),
      `update public.companies set website = 'https://acme.example' where id = $1`,
      [companyId],
    );
    await as(db, user(ownerId), `select public.resubmit_company_registration()`);

    expect(await companyRow()).toMatchObject({
      status: "pending",
      status_reason: null,
      reviewed_by: null,
      reviewed_at: null,
    });
    const history = await requests();
    expect(history.map((r) => r.status)).toEqual(["rejected", "pending"]);

    const { rows } = await db.query<{ website: string; resubmission: boolean }>(
      `select submitted_data ->> 'website' as website, (submitted_data ->> 'resubmission')::boolean as resubmission
         from public.company_registration_requests where company_id = $1 and status = 'pending'`,
      [companyId],
    );
    expect(rows[0]).toEqual({ website: "https://acme.example", resubmission: true });
  });

  it("cannot be repeated while pending", async () => {
    await expect(as(db, user(ownerId), `select public.resubmit_company_registration()`)).rejects.toThrow(
      /only rejected registrations/,
    );
  });
});

describe("approval, suspension and reinstatement", () => {
  it("approves, publishes and notifies", async () => {
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'approved', status_reason = null where id = $1`,
      [companyId],
    );
    expect((await requests()).map((r) => r.status)).toEqual(["rejected", "approved"]);
    const pub = await as(db, anon, `select id from public.companies`);
    expect(pub.rows).toEqual([{ id: companyId }]);
    expect((await notifications()).at(-1)).toMatchObject({
      type: "company_approved",
      title: "Your company has been approved",
    });
  });

  it("suspends with a reason and hides the company", async () => {
    await expect(
      as(db, user(adminId), `update public.companies set status = 'suspended' where id = $1`, [companyId]),
    ).rejects.toThrow(/companies_reason_required/);
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'suspended', status_reason = 'Lease ended.' where id = $1`,
      [companyId],
    );
    const pub = await as(db, anon, `select id from public.companies`);
    expect(pub.rows).toHaveLength(0);
    expect((await notifications()).at(-1)).toMatchObject({ type: "company_suspended", body: "Lease ended." });
  });

  it("reinstates with a dedicated message", async () => {
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'approved', status_reason = null where id = $1`,
      [companyId],
    );
    expect((await notifications()).at(-1)).toMatchObject({ title: "Your company has been reinstated" });
    // Request history is unchanged by suspension/reinstatement.
    expect((await requests()).map((r) => r.status)).toEqual(["rejected", "approved"]);
  });

  it("does not notify when the status is unchanged", async () => {
    const before = (await notifications()).length;
    await as(db, user(adminId), `update public.companies set tagline = 'New tagline' where id = $1`, [
      companyId,
    ]);
    await as(db, user(adminId), `update public.companies set status = 'approved' where id = $1`, [companyId]);
    expect(await notifications()).toHaveLength(before);
  });
});

describe("profile editing", () => {
  it("lets the owner edit public fields including services", async () => {
    await as(
      db,
      user(ownerId),
      `update public.companies set services = array['Robotics', 'Consulting'], industry_id =
         (select id from public.industries where slug = 'deep-tech-hardware') where id = $1`,
      [companyId],
    );
    const { rows } = await db.query(`select services from public.companies where id = $1`, [companyId]);
    expect(rows[0]).toEqual({ services: ["Robotics", "Consulting"] });
  });

  it("rejects blank or overlong services", async () => {
    await expect(
      as(db, user(ownerId), `update public.companies set services = array['', 'x'] where id = $1`, [
        companyId,
      ]),
    ).rejects.toThrow(/companies_services_items_check/);
    await expect(
      as(db, user(ownerId), `update public.companies set services = array[repeat('x', 81)] where id = $1`, [
        companyId,
      ]),
    ).rejects.toThrow(/companies_services_items_check/);
  });

  it("does not let the owner clear a suspension reason", async () => {
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'suspended', status_reason = 'Review pending.' where id = $1`,
      [companyId],
    );
    await expect(
      as(db, user(ownerId), `update public.companies set status_reason = null where id = $1`, [companyId]),
    ).rejects.toThrow(/only a super admin/);
  });
});
