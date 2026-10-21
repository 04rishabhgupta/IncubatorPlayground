import { describe, expect, it } from "vitest";
import { floorGeometrySchema } from "@/lib/floor/geometry";
import { FLOOR_1_SPACES, floor1Geometry } from "@/lib/floor/layouts/floor-1";
import { anon, applyMigration, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

/**
 * Phase 4R.2 data migration: Floor 1 becomes an architectural plan without
 * touching any space id, so companies keep their offices, teams and
 * appointments.
 */

const MIGRATION = "20261017090000_floor1_architectural_plan.sql";
const V1_SEED = "tests/db/fixtures/seed-floor-1-v1.sql";
const FLOOR_ID = "00000000-0000-4000-8000-000000000101";

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function layout(db: Db) {
  const { rows } = await db.query<{ width: number; height: number; geometry: unknown }>(
    `select width, height, geometry from public.floor_layouts where floor_id = $1`,
    [FLOOR_ID],
  );
  return rows[0];
}

async function spaces(db: Db) {
  const { rows } = await db.query<{
    id: string;
    code: string;
    label: string;
    capacity: number | null;
    shape: unknown;
  }>(
    `select id, code, label, capacity, shape from public.floor_spaces where floor_id = $1 order by sort_order`,
    [FLOOR_ID],
  );
  return rows;
}

/** A company placed in office 101 with two team members, as on a live database. */
async function occupyOffice101(db: Db) {
  const adminId = await createAuthUser(db, "admin@example.com");
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  const ownerId = await createAuthUser(db, "owner@example.com", {
    account_type: "company",
    company: { name: "Alpha", description: "Floor layout test company description." },
  });
  const { rows } = await db.query<{ id: string }>(`select id from public.companies where owner_id = $1`, [
    ownerId,
  ]);
  const companyId = rows[0].id;
  await db.query(`update public.companies set status = 'approved' where id = $1`, [companyId]);
  const office = (await spaces(db)).find((s) => s.code === "101")!;
  await as(db, user(adminId), `update public.companies set floor_id = $2, space_id = $3 where id = $1`, [
    companyId,
    FLOOR_ID,
    office.id,
  ]);
  for (const name of ["Asha Rao", "Kiran Das"]) {
    await db.query(`insert into public.company_team_members (company_id, full_name) values ($1, $2)`, [
      companyId,
      name,
    ]);
  }
  return { companyId, ownerId };
}

describe("Floor 1 architectural plan migration", () => {
  it("replaces the original drawing and reshapes spaces in place", async () => {
    const db = await createTestDatabase({ before: MIGRATION, seed: V1_SEED });
    const { companyId, ownerId } = await occupyOffice101(db);
    const spacesBefore = await spaces(db);
    const notificationsBefore = await db.query(
      `select id from public.notifications where recipient_id = $1`,
      [ownerId],
    );

    await applyMigration(db, MIGRATION);

    const after = await layout(db);
    expect(after.geometry).toEqual(plain(floor1Geometry));
    expect(floorGeometrySchema.safeParse(after.geometry).success).toBe(true);

    // Same rows, labels and capacities; only the shapes changed.
    const spacesAfter = await spaces(db);
    expect(spacesAfter.map(({ id, code, label, capacity }) => ({ id, code, label, capacity }))).toEqual(
      spacesBefore.map(({ id, code, label, capacity }) => ({ id, code, label, capacity })),
    );
    for (const s of spacesAfter) expect(s.shape).toEqual(FLOOR_1_SPACES[s.code]);

    // The company is still in office 101 with its team, and was not told its office changed.
    const { rows } = await db.query<{ space_id: string; team: number }>(
      `select c.space_id, (select count(*)::int from public.company_team_members t where t.company_id = c.id) as team
         from public.companies c where c.id = $1`,
      [companyId],
    );
    expect(rows[0]).toEqual({ space_id: spacesBefore.find((s) => s.code === "101")!.id, team: 2 });
    const notificationsAfter = await db.query(`select id from public.notifications where recipient_id = $1`, [
      ownerId,
    ]);
    expect(notificationsAfter.rows).toHaveLength(notificationsBefore.rows.length);

    // Running it again changes nothing.
    await applyMigration(db, MIGRATION);
    expect((await layout(db)).geometry).toEqual(plain(floor1Geometry));
  });

  it("leaves a drawing that was edited by hand alone", async () => {
    const db = await createTestDatabase({ before: MIGRATION, seed: V1_SEED });
    await db.query(
      `update public.floor_layouts
          set geometry = jsonb_set(geometry, '{areas,0,label}', '"Main corridor"')
        where floor_id = $1`,
      [FLOOR_ID],
    );
    const before = await layout(db);
    const spacesBefore = await spaces(db);

    await applyMigration(db, MIGRATION);

    expect(await layout(db)).toEqual(before);
    expect(await spaces(db)).toEqual(spacesBefore);
  });

  it("gives a fresh database the new plan through seed.sql", async () => {
    const db = await createTestDatabase();
    expect((await layout(db)).geometry).toEqual(plain(floor1Geometry));
    for (const s of await spaces(db)) expect(s.shape).toEqual(FLOOR_1_SPACES[s.code]);
  });

  it("adds tagline and description to floors and updates Floor 1 metadata", async () => {
    const db = await createTestDatabase({ before: "20261019120000_floor_metadata.sql", seed: V1_SEED });
    const { rows: beforeRows } = await db.query<{ id: string; name: string }>(
      `select id, name from public.floors where id = $1`,
      [FLOOR_ID],
    );
    expect(beforeRows).toHaveLength(1);

    await applyMigration(db, "20261019120000_floor_metadata.sql");

    const { rows: afterRows } = await db.query<{
      id: string;
      name: string;
      tagline: string | null;
      description: string | null;
    }>(`select id, name, tagline, description from public.floors where id = $1`, [FLOOR_ID]);
    expect(afterRows[0].tagline).toBe("Deep tech, robotics & AI incubation");
    expect(afterRows[0].description).toContain("Home to early-stage deep tech ventures");
  });
});

describe("floor settings (Phase 4R.4)", () => {
  it("lets the admin hide a floor from visitors and still manage it", async () => {
    const db = await createTestDatabase();
    const adminId = await createAuthUser(db, "admin@example.com");
    await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
    const visitorId = await createAuthUser(db, "visitor@example.com");
    const visibleTo = async (actor: Parameters<typeof as>[1]) =>
      (await as<{ slug: string }>(db, actor, `select slug from public.floors`)).rows.map((r) => r.slug);

    await as(
      db,
      user(adminId),
      `update public.floors set is_active = false, tagline = 'Closed for fit-out' where id = $1`,
      [FLOOR_ID],
    );

    expect(await visibleTo(anon)).toEqual([]);
    expect(await visibleTo(user(visitorId))).toEqual([]);
    // The admin tools load inactive floors too, so it can be switched back on.
    expect(await visibleTo(user(adminId))).toEqual(["floor-1"]);

    // Nobody else can change floor settings.
    await expect(
      as(db, user(visitorId), `update public.floors set is_active = true where id = $1 returning id`, [
        FLOOR_ID,
      ]),
    ).resolves.toMatchObject({ rows: [] });
  });
});
