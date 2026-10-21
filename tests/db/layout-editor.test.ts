import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

/** Phase 4R.6: saving editor documents with history. */

const FLOOR_ID = "00000000-0000-4000-8000-000000000101";

let db: Db;
let adminId: string;
let visitorId: string;

type Doc = {
  width: number;
  height: number;
  geometry: Record<string, unknown>;
  spaces: Record<string, unknown>;
};

async function currentDocument() {
  const { rows } = await as<{ doc: Doc }>(
    db,
    user(adminId),
    `select public.floor_layout_document($1) as doc`,
    [FLOOR_ID],
  );
  return rows[0].doc;
}

async function updatedAt() {
  const { rows } = await db.query<{ updated_at: string }>(
    `select updated_at::text from public.floor_layouts where floor_id = $1`,
    [FLOOR_ID],
  );
  return rows[0].updated_at;
}

const save = (actor: string, doc: Doc, note: string | null, expected: string | null) =>
  as<{ saved: string }>(db, user(actor), `select public.save_floor_layout($1, $2, $3, $4) as saved`, [
    FLOOR_ID,
    JSON.stringify(doc),
    note,
    expected,
  ]);

const versions = async () =>
  (
    await as<{ note: string | null; created_by: string | null }>(
      db,
      user(adminId),
      `select note, created_by from public.floor_layout_versions where floor_id = $1 order by created_at, id`,
      [FLOOR_ID],
    )
  ).rows;

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com");
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  visitorId = await createAuthUser(db, "visitor@example.com");
});

describe("save_floor_layout", () => {
  it("saves layout and space shapes in place, keeping the original as the first version", async () => {
    const ids = (
      await db.query<{ code: string; id: string }>(`select code, id from public.floor_spaces order by code`)
    ).rows;
    const doc = await currentDocument();
    expect(Object.keys(doc.spaces).sort()).toEqual(["101", "102", "103", "104", "BR-1", "REC"]);

    const moved = { type: "rect", x: 40, y: 40, width: 300, height: 286 };
    const next: Doc = {
      ...doc,
      width: 1300,
      geometry: { ...doc.geometry, areas: [] },
      spaces: { ...doc.spaces, "101": moved },
    };
    await save(adminId, next, "Narrower 101", await updatedAt());

    const after = await currentDocument();
    expect(after.width).toBe(1300);
    expect(after.geometry.areas).toEqual([]);
    expect(after.spaces["101"]).toEqual(moved);
    // Same rows: placements and appointments that point at space ids are untouched.
    expect(
      (await db.query<{ code: string; id: string }>(`select code, id from public.floor_spaces order by code`))
        .rows,
    ).toEqual(ids);
    expect(await versions()).toEqual([
      { note: "Layout before the first edit", created_by: null },
      { note: "Narrower 101", created_by: adminId },
    ]);
  });

  it("refuses a save based on an outdated copy", async () => {
    const doc = await currentDocument();
    const stale = await updatedAt();
    await save(adminId, doc, "First", stale);
    await expect(save(adminId, doc, "Second", stale)).rejects.toThrow(/changed by someone else/);
  });

  it("requires exactly the floor's existing space codes", async () => {
    const doc = await currentDocument();
    const without104 = { ...doc.spaces };
    delete without104["104"];
    await expect(save(adminId, { ...doc, spaces: without104 }, null, null)).rejects.toThrow(/existing codes/);
    await expect(
      save(adminId, { ...doc, spaces: { ...doc.spaces, "999": doc.spaces["101"] } }, null, null),
    ).rejects.toThrow(/existing codes/);
  });

  it("is for super admins only, and history can't be rewritten", async () => {
    const doc = await currentDocument();
    await expect(save(visitorId, doc, null, null)).rejects.toThrow(/only a super admin/);
    expect((await as(db, user(visitorId), `select id from public.floor_layout_versions`)).rows).toHaveLength(
      0,
    );

    const count = (await versions()).length;
    // Not even the admin can change or remove a version.
    await expect(
      as(db, user(adminId), `update public.floor_layout_versions set note = 'rewritten'`),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, user(adminId), `delete from public.floor_layout_versions`)).rejects.toThrow(
      /permission denied/,
    );
    const after = await versions();
    expect(after).toHaveLength(count);
    expect(after.some((v) => v.note === "rewritten")).toBe(false);
  });
});
