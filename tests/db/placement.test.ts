import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

const FLOOR_ID = "00000000-0000-4000-8000-000000000101";

let db: Db;
let adminId: string;
let ownerA: string;
let ownerB: string;
let companyA: string;
let companyB: string;

const space = async (code: string) =>
  (await db.query<{ id: string }>(`select id from public.floor_spaces where code = $1`, [code])).rows[0].id;

async function place(companyId: string, code: string | null) {
  return as(db, user(adminId), `update public.companies set floor_id = $2, space_id = $3 where id = $1`, [
    companyId,
    code ? FLOOR_ID : null,
    code ? await space(code) : null,
  ]);
}

async function notificationsFor(ownerId: string) {
  const { rows } = await as<{ type: string; title: string; body: string }>(
    db,
    user(ownerId),
    `select type, title, body from public.notifications where type = 'office_updated' order by created_at`,
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com");
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  const meta = (name: string) => ({
    account_type: "company",
    company: { name, description: "Placement test company description." },
  });
  ownerA = await createAuthUser(db, "a@example.com", meta("Alpha"));
  ownerB = await createAuthUser(db, "b@example.com", meta("Beta"));
  const { rows } = await db.query<{ id: string; owner_id: string }>(
    `select id, owner_id from public.companies`,
  );
  companyA = rows.find((r) => r.owner_id === ownerA)!.id;
  companyB = rows.find((r) => r.owner_id === ownerB)!.id;
  await db.query(`update public.companies set status = 'approved'`);
});

describe("office placement", () => {
  it("notifies the company when an office is assigned", async () => {
    await place(companyA, "101");
    expect(await notificationsFor(ownerA)).toEqual([
      {
        type: "office_updated",
        title: "Your office has been assigned",
        body: "Alpha is now in Office 101 on Floor 1.",
      },
    ]);
  });

  it("only allows moves into vacant offices", async () => {
    await place(companyB, "102");
    await expect(place(companyB, "101")).rejects.toThrow(/duplicate key/);
  });

  it("notifies on a move", async () => {
    await place(companyA, "103");
    expect((await notificationsFor(ownerA)).at(-1)).toMatchObject({
      title: "Your office has changed",
      body: "Alpha has moved from Office 101 to Office 103 on Floor 1.",
    });
  });

  it("notifies when the assignment is removed", async () => {
    await place(companyA, null);
    expect((await notificationsFor(ownerA)).at(-1)).toMatchObject({
      title: "Your office assignment was removed",
      body: "Alpha is no longer assigned to Office 103.",
    });
  });

  it("does not notify for unrelated edits", async () => {
    const before = (await notificationsFor(ownerB)).length;
    await as(db, user(adminId), `update public.companies set tagline = 'x' where id = $1`, [companyB]);
    expect(await notificationsFor(ownerB)).toHaveLength(before);
  });

  it("is admin-only", async () => {
    await expect(
      as(db, user(ownerB), `update public.companies set space_id = null, floor_id = null where id = $1`, [
        companyB,
      ]),
    ).rejects.toThrow(/only a super admin/);
  });

  it("lets admins rename an office and set its capacity", async () => {
    const id = await space("104");
    await as(
      db,
      user(adminId),
      `update public.floor_spaces set label = 'Office 104A', capacity = 8 where id = $1`,
      [id],
    );
    const { rows } = await db.query(`select label, capacity from public.floor_spaces where id = $1`, [id]);
    expect(rows[0]).toEqual({ label: "Office 104A", capacity: 8 });
  });
});
