import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

let db: Db;
let owner: string;
let otherOwner: string;
let visitor: string;
let companyId: string;
let otherCompanyId: string;
let publicMember: string;
let hiddenMember: string;

const meta = (name: string) => ({
  account_type: "company",
  company: { name, description: "Availability test company description." },
});

beforeAll(async () => {
  db = await createTestDatabase();
  owner = await createAuthUser(db, "owner@example.com", meta("Acme"));
  otherOwner = await createAuthUser(db, "other@example.com", meta("Globex"));
  visitor = await createAuthUser(db, "visitor@example.com");
  const { rows } = await db.query<{ id: string; owner_id: string }>(
    `select id, owner_id from public.companies`,
  );
  companyId = rows.find((r) => r.owner_id === owner)!.id;
  otherCompanyId = rows.find((r) => r.owner_id === otherOwner)!.id;
  // Acme is approved; Globex stays pending.
  await db.query(`update public.companies set status = 'approved' where id = $1`, [companyId]);

  const insert = async (name: string, isPublic: boolean) =>
    (
      await as<{ id: string }>(
        db,
        user(owner),
        `insert into public.company_team_members (company_id, full_name, is_public) values ($1, $2, $3) returning id`,
        [companyId, name, isPublic],
      )
    ).rows[0].id;
  publicMember = await insert("Rahul", true);
  hiddenMember = await insert("Priya", false);
  for (const id of [publicMember, hiddenMember]) {
    await as(
      db,
      user(owner),
      `insert into public.member_availability (member_id, status) values ($1, 'busy')`,
      [id],
    );
  }
});

describe("visibility", () => {
  it("hides members marked not public, and their availability, from everyone but the owner", async () => {
    for (const actor of [anon, user(visitor)]) {
      const members = await as<{ full_name: string }>(
        db,
        actor,
        `select full_name from public.company_team_members`,
      );
      expect(members.rows.map((m) => m.full_name)).toEqual(["Rahul"]);
      const avail = await as<{ member_id: string }>(
        db,
        actor,
        `select member_id from public.member_availability`,
      );
      expect(avail.rows.map((a) => a.member_id)).toEqual([publicMember]);
    }
    const own = await as(db, user(owner), `select id from public.company_team_members`);
    expect(own.rows).toHaveLength(2);
  });

  it("keeps a pending company's availability private", async () => {
    await as(
      db,
      user(otherOwner),
      `insert into public.company_availability (company_id, status) values ($1, 'available')`,
      [otherCompanyId],
    );
    const pub = await as(db, anon, `select company_id from public.company_availability`);
    expect(pub.rows).toEqual([]);
    const own = await as(db, user(otherOwner), `select status from public.company_availability`);
    expect(own.rows).toEqual([{ status: "available" }]);
  });
});

describe("updates", () => {
  it("stamps who changed availability and when, ignoring forged values", async () => {
    await as(
      db,
      user(owner),
      `insert into public.company_availability (company_id, status, note, updated_by, updated_at)
       values ($1, 'available', 'In until 5 pm', $2, '2000-01-01')`,
      [companyId, visitor],
    );
    const { rows } = await db.query<{ updated_by: string; updated_at: Date }>(
      `select updated_by, updated_at from public.company_availability where company_id = $1`,
      [companyId],
    );
    expect(rows[0].updated_by).toBe(owner);
    expect(rows[0].updated_at.getFullYear()).toBeGreaterThan(2000);
  });

  it("supports upserts so the status can be changed repeatedly", async () => {
    await as(
      db,
      user(owner),
      `insert into public.company_availability (company_id, status) values ($1, 'busy')
       on conflict (company_id) do update set status = excluded.status, note = null`,
      [companyId],
    );
    const { rows } = await as(db, anon, `select status, note from public.company_availability`);
    expect(rows).toEqual([{ status: "busy", note: null }]);
  });

  it("clearing availability (Unknown) deletes the row", async () => {
    await as(db, user(owner), `delete from public.member_availability where member_id = $1`, [publicMember]);
    const { rows } = await as(db, anon, `select member_id from public.member_availability`);
    expect(rows).toEqual([]);
  });

  it("rejects notes longer than 280 characters", async () => {
    await expect(
      as(
        db,
        user(owner),
        `update public.company_availability set note = repeat('x', 281) where company_id = $1`,
        [companyId],
      ),
    ).rejects.toThrow(/company_availability_note_check/);
  });

  it("stops owners from moving a team member into another company", async () => {
    await expect(
      as(db, user(owner), `update public.company_team_members set company_id = $2 where id = $1`, [
        publicMember,
        otherCompanyId,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("stops other companies from deleting someone else's team or availability", async () => {
    const team = await as(
      db,
      user(otherOwner),
      `delete from public.company_team_members where id = $1 returning id`,
      [publicMember],
    );
    expect(team.rows).toHaveLength(0);
    const avail = await as(
      db,
      user(otherOwner),
      `delete from public.company_availability where company_id = $1 returning company_id`,
      [companyId],
    );
    expect(avail.rows).toHaveLength(0);
  });

  it("deleting a team member removes their availability too", async () => {
    await as(db, user(owner), `delete from public.company_team_members where id = $1`, [hiddenMember]);
    const { rows } = await db.query(`select 1 from public.member_availability where member_id = $1`, [
      hiddenMember,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("realtime", () => {
  it("publishes availability changes", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining(["company_availability", "member_availability"]),
    );
  });
});
