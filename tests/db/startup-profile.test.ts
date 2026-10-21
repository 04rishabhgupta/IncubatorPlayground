import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

/** Phase 4R.5: startup profile, FITT team, announcements and office requests. */

const BUILDING_ID = "00000000-0000-4000-8000-000000000001";
const FLOOR_ID = "00000000-0000-4000-8000-000000000101";

let db: Db;
let adminId: string;
let visitorId: string;

async function newCompany(email: string, name: string, status: "approved" | "pending" = "approved") {
  const ownerId = await createAuthUser(db, email, {
    account_type: "company",
    company: { name, description: "Startup profile test company description." },
  });
  const { rows } = await db.query<{ id: string }>(`select id from public.companies where owner_id = $1`, [
    ownerId,
  ]);
  await db.query(`update public.companies set status = $2 where id = $1`, [rows[0].id, status]);
  return { ownerId, companyId: rows[0].id };
}

const spaceId = async (code: string) =>
  (await db.query<{ id: string }>(`select id from public.floor_spaces where code = $1`, [code])).rows[0].id;

const notifications = async (ownerId: string) =>
  (
    await db.query<{ type: string }>(
      `select type from public.notifications where recipient_id = $1 and type::text like 'office%'`,
      [ownerId],
    )
  ).rows.map((r) => r.type);

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com");
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  visitorId = await createAuthUser(db, "visitor@example.com");
});

describe("startup profile", () => {
  it("lets the owner set stage, team size and tech stack", async () => {
    const { ownerId, companyId } = await newCompany("stage@example.com", "Stage Co");
    await as(
      db,
      user(ownerId),
      `update public.companies set stage = 'mvp', team_size = 8, tech_stack = '{Python,ROS}' where id = $1`,
      [companyId],
    );
    const { rows } = await as(
      db,
      anon,
      `select stage, team_size, tech_stack from public.companies where id = $1`,
      [companyId],
    );
    expect(rows[0]).toEqual({ stage: "mvp", team_size: 8, tech_stack: ["Python", "ROS"] });
  });

  it("rejects blank or overlong technologies and impossible team sizes", async () => {
    const { ownerId, companyId } = await newCompany("bad@example.com", "Bad Data Co");
    for (const set of ["tech_stack = '{\"  \"}'", `tech_stack = '{${"x".repeat(41)}}'`, "team_size = 0"]) {
      await expect(
        as(db, user(ownerId), `update public.companies set ${set} where id = $1`, [companyId]),
      ).rejects.toThrow(/check/);
    }
  });
});

describe("FITT Incubation Team", () => {
  it("is managed by the admin, shown publicly, and stamps availability changes", async () => {
    const insert = `insert into public.incubator_staff (building_id, full_name, job_title, availability, is_public)
                    values ($1, $2, 'Programme manager', $3, $4) returning id, availability_updated_at`;
    const { rows } = await as<{ id: string; availability_updated_at: string | null }>(
      db,
      user(adminId),
      insert,
      [BUILDING_ID, "Priya Nair", "available", true],
    );
    expect(rows[0].availability_updated_at).not.toBeNull();
    await as(db, user(adminId), insert, [BUILDING_ID, "Hidden Person", null, false]);

    const names = async (actor: Parameters<typeof as>[1]) =>
      (
        await as<{ full_name: string }>(
          db,
          actor,
          `select full_name from public.incubator_staff order by full_name`,
        )
      ).rows.map((r) => r.full_name);
    expect(await names(anon)).toEqual(["Priya Nair"]);
    expect(await names(user(adminId))).toEqual(["Hidden Person", "Priya Nair"]);

    await expect(as(db, user(visitorId), insert, [BUILDING_ID, "Intruder", null, true])).rejects.toThrow(
      /row-level security/,
    );

    // Clearing availability (Unknown) clears the timestamp too.
    const { rows: cleared } = await as<{ availability_updated_at: string | null }>(
      db,
      user(adminId),
      `update public.incubator_staff set availability = null where id = $1 returning availability_updated_at`,
      [rows[0].id],
    );
    expect(cleared[0].availability_updated_at).toBeNull();
  });
});

describe("announcements", () => {
  it("shows visitors only running announcements and stamps the author", async () => {
    const insert = `insert into public.announcements (floor_id, title, starts_at, ends_at)
                    values ($1, $2, now() + $3::interval, now() + $4::interval) returning created_by`;
    const { rows } = await as<{ created_by: string }>(db, user(adminId), insert, [
      FLOOR_ID,
      "Demo day on Friday",
      "-1 hour",
      "2 days",
    ]);
    expect(rows[0].created_by).toBe(adminId);
    await as(db, user(adminId), insert, [null, "Building closed Sunday", "-1 hour", null]);
    await as(db, user(adminId), insert, [FLOOR_ID, "Scheduled", "1 day", "2 days"]);
    await as(db, user(adminId), insert, [FLOOR_ID, "Finished", "-3 days", "-1 day"]);

    const titles = async (actor: Parameters<typeof as>[1]) =>
      (
        await as<{ title: string }>(db, actor, `select title from public.announcements order by title`)
      ).rows.map((r) => r.title);
    expect(await titles(anon)).toEqual(["Building closed Sunday", "Demo day on Friday"]);
    expect(await titles(user(adminId))).toHaveLength(4);

    await expect(as(db, user(visitorId), insert, [null, "Spam", "0", null])).rejects.toThrow(
      /row-level security/,
    );
    await expect(as(db, user(adminId), insert, [null, "Backwards", "1 day", "-1 day"])).rejects.toThrow(
      /period/,
    );
  });
});

describe("office requests", () => {
  it("lets an approved company without an office request one, privately", async () => {
    const { ownerId, companyId } = await newCompany("req@example.com", "Request Co");
    const other = await newCompany("other@example.com", "Other Co");
    await as(
      db,
      user(ownerId),
      `insert into public.office_requests (company_id, space_id, note) values ($1, $2, $3)`,
      [companyId, await spaceId("103"), "We are 6 people"],
    );

    const visible = async (actor: Parameters<typeof as>[1]) =>
      (
        await as(db, actor, `select company_id from public.office_requests where company_id = $1`, [
          companyId,
        ])
      ).rows.length;
    expect(await visible(user(ownerId))).toBe(1);
    expect(await visible(user(adminId))).toBe(1);
    expect(await visible(user(other.ownerId))).toBe(0);
    // Guests have no access to the table at all.
    await expect(visible(anon)).rejects.toThrow(/permission denied/);

    // Only offices, and one request per company (updating it is fine).
    await expect(
      as(db, user(ownerId), `update public.office_requests set space_id = $2 where company_id = $1`, [
        companyId,
        await spaceId("BR-1"),
      ]),
    ).rejects.toThrow(/only offices/);
    await as(db, user(ownerId), `update public.office_requests set space_id = null where company_id = $1`, [
      companyId,
    ]);

    // Nobody can file a request for someone else's company.
    await expect(
      as(db, user(other.ownerId), `insert into public.office_requests (company_id) values ($1)`, [companyId]),
    ).rejects.toThrow();
  });

  it("is only for approved companies that have no office yet", async () => {
    const pending = await newCompany("pending@example.com", "Pending Co", "pending");
    await expect(
      as(db, user(pending.ownerId), `insert into public.office_requests (company_id) values ($1)`, [
        pending.companyId,
      ]),
    ).rejects.toThrow(/only approved companies/);

    const placed = await newCompany("placed@example.com", "Placed Co");
    await db.query(`update public.companies set floor_id = $2, space_id = $3 where id = $1`, [
      placed.companyId,
      FLOOR_ID,
      await spaceId("104"),
    ]);
    await expect(
      as(db, user(placed.ownerId), `insert into public.office_requests (company_id) values ($1)`, [
        placed.companyId,
      ]),
    ).rejects.toThrow(/already has an office/);
  });

  it("is fulfilled by placement, and the company hears when the admin closes it instead", async () => {
    const placedNow = await newCompany("fulfil@example.com", "Fulfil Co");
    await as(db, user(placedNow.ownerId), `insert into public.office_requests (company_id) values ($1)`, [
      placedNow.companyId,
    ]);
    await as(db, user(adminId), `update public.companies set floor_id = $2, space_id = $3 where id = $1`, [
      placedNow.companyId,
      FLOOR_ID,
      await spaceId("102"),
    ]);
    const left = await db.query(`select 1 from public.office_requests where company_id = $1`, [
      placedNow.companyId,
    ]);
    expect(left.rows).toHaveLength(0);
    expect(await notifications(placedNow.ownerId)).toEqual(["office_updated"]);

    const closed = await newCompany("closed@example.com", "Closed Co");
    await as(db, user(closed.ownerId), `insert into public.office_requests (company_id) values ($1)`, [
      closed.companyId,
    ]);
    await as(db, user(adminId), `delete from public.office_requests where company_id = $1`, [
      closed.companyId,
    ]);
    expect(await notifications(closed.ownerId)).toEqual(["office_request_closed"]);

    // Withdrawing your own request sends nothing.
    const withdrawn = await newCompany("withdraw@example.com", "Withdraw Co");
    await as(db, user(withdrawn.ownerId), `insert into public.office_requests (company_id) values ($1)`, [
      withdrawn.companyId,
    ]);
    await as(db, user(withdrawn.ownerId), `delete from public.office_requests where company_id = $1`, [
      withdrawn.companyId,
    ]);
    expect(await notifications(withdrawn.ownerId)).toEqual([]);
  });
});
