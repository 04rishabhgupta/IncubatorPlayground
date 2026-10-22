import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

/** Phase 8: which role changes an admin can make through the app. */

let db: Db;
let adminId: string;
let visitorId: string;

const setRole = (actor: string, target: string, role: string) =>
  as(db, user(actor), `update public.profiles set role = $2 where id = $1 returning role`, [target, role]);
const roleOf = async (id: string) =>
  (await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [id])).rows[0].role;

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com", { full_name: "Ada Admin" });
  // The first admin is made from a trusted context (SQL editor), as in the README.
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  visitorId = await createAuthUser(db, "vera@example.com", { full_name: "Vera" });
});

describe("role changes by a super admin", () => {
  it("promotes a visitor to admin and back, telling them each time", async () => {
    await setRole(adminId, visitorId, "super_admin");
    expect(await roleOf(visitorId)).toBe("super_admin");
    await setRole(adminId, visitorId, "visitor");
    expect(await roleOf(visitorId)).toBe("visitor");

    const { rows } = await as<{ title: string; link: string }>(
      db,
      user(visitorId),
      `select title, link from public.notifications where type = 'system' order by created_at`,
    );
    expect(rows).toEqual([
      { title: "You are now a platform admin", link: "/admin" },
      { title: "Your account role has changed", link: "/account" },
    ]);
  });

  it("keeps company owners as company accounts and never creates one by role", async () => {
    const ownerId = await createAuthUser(db, "owner@example.com", {
      account_type: "company",
      company: { name: "Owner Co", description: "User management test company description." },
    });
    await expect(setRole(adminId, ownerId, "visitor")).rejects.toThrow(/stays a company account/);
    await expect(setRole(adminId, ownerId, "super_admin")).rejects.toThrow(/stays a company account/);
    await expect(setRole(adminId, visitorId, "company")).rejects.toThrow(/registering a company/);
    expect(await roleOf(ownerId)).toBe("company");
  });

  it("never lets admins change their own role or demote the last admin", async () => {
    await expect(setRole(adminId, adminId, "visitor")).rejects.toThrow(/their own role/);

    // With a second admin, one can demote the other — but not the last one left.
    const second = await createAuthUser(db, "second@example.com");
    await setRole(adminId, second, "super_admin");
    await setRole(second, adminId, "visitor");
    expect(await roleOf(adminId)).toBe("visitor");
    await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]); // restore (trusted)
    await setRole(adminId, second, "visitor");
    // Now only one admin exists; nobody else is an admin to demote them, and they can't do it themselves.
    expect((await db.query(`select id from public.profiles where role = 'super_admin'`)).rows).toHaveLength(
      1,
    );
  });

  it("refuses role changes from anyone who isn't an admin", async () => {
    const other = await createAuthUser(db, "other@example.com");
    // Someone else's profile is not even visible to them, so nothing is updated.
    const { rows } = await setRole(visitorId, other, "super_admin");
    expect(rows).toEqual([]);
    expect(await roleOf(other)).toBe("visitor");
    await expect(setRole(visitorId, visitorId, "super_admin")).rejects.toThrow(/only a super admin/);
  });
});
