import { beforeAll, describe, expect, it } from "vitest";
import { floorGeometrySchema, shapeSchema } from "@/lib/floor/geometry";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

const FLOOR_ID = "00000000-0000-4000-8000-000000000101";

let db: Db;
let adminId: string;
let visitorId: string;
let otherVisitorId: string;
let companyUserId: string;
let otherCompanyUserId: string;
let companyId: string;
let otherCompanyId: string;
let memberId: string;

async function createCompany(ownerId: string, name: string, slug: string) {
  const { rows } = await as<{ id: string; status: string }>(
    db,
    user(ownerId),
    `insert into public.companies (owner_id, name, slug, business_email, status)
     values ($1, $2, $3, 'hello@example.com', 'approved')
     returning id, status`,
    [ownerId, name, slug],
  );
  return rows[0];
}

function futureSlot(daysAhead: number, hour = 10, minutes = 60) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysAhead);
  start.setUTCHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return [start.toISOString(), end.toISOString()] as const;
}

beforeAll(async () => {
  db = await createTestDatabase();

  adminId = await createAuthUser(db, "admin@example.com", { full_name: "Admin" });
  // Promotion happens in a trusted context (SQL editor / service role).
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);

  visitorId = await createAuthUser(db, "visitor@example.com", { full_name: "Vera Visitor" });
  otherVisitorId = await createAuthUser(db, "other@example.com", { full_name: "Otto Other" });
  companyUserId = await createAuthUser(db, "acme@example.com", { account_type: "company" });
  otherCompanyUserId = await createAuthUser(db, "globex@example.com", { account_type: "company" });
});

describe("seed data", () => {
  it("stores floor geometry that the app schema accepts", async () => {
    const layout = await db.query<{ geometry: unknown }>(
      `select geometry from public.floor_layouts where floor_id = $1`,
      [FLOOR_ID],
    );
    expect(floorGeometrySchema.safeParse(layout.rows[0].geometry).success).toBe(true);

    const spaces = await db.query<{ shape: unknown }>(`select shape from public.floor_spaces`);
    expect(spaces.rows).toHaveLength(6);
    for (const { shape } of spaces.rows) {
      expect(shapeSchema.safeParse(shape).success).toBe(true);
    }
  });
});

describe("signup and profiles", () => {
  it("assigns roles from metadata but never super_admin", async () => {
    const sneaky = await createAuthUser(db, "sneaky@example.com", { account_type: "super_admin" });
    const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
      sneaky,
    ]);
    expect(rows[0].role).toBe("visitor");

    const company = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
      companyUserId,
    ]);
    expect(company.rows[0].role).toBe("company");
  });

  it("hides profiles from anonymous users", async () => {
    await expect(as(db, anon, `select * from public.profiles`)).rejects.toThrow(/permission denied/);
  });

  it("lets users read only their own profile", async () => {
    const { rows } = await as<{ id: string }>(db, user(visitorId), `select id from public.profiles`);
    expect(rows.map((r) => r.id)).toEqual([visitorId]);
  });

  it("blocks self-promotion and email changes", async () => {
    await expect(
      as(db, user(visitorId), `update public.profiles set role = 'super_admin' where id = $1`, [visitorId]),
    ).rejects.toThrow(/super admin can change roles/);
    await expect(
      as(db, user(visitorId), `update public.profiles set email = 'x@y.z' where id = $1`, [visitorId]),
    ).rejects.toThrow(/permission denied/);
    await as(db, user(visitorId), `update public.profiles set full_name = 'Vera V.' where id = $1`, [
      visitorId,
    ]);
  });

  it("lets a super admin change another user's role", async () => {
    const tmp = await createAuthUser(db, "tmp@example.com");
    await as(db, user(adminId), `update public.profiles set role = 'company' where id = $1`, [tmp]);
    const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
      tmp,
    ]);
    expect(rows[0].role).toBe("company");
  });
});

describe("floor reference data", () => {
  it("is publicly readable", async () => {
    const { rows } = await as(db, anon, `select code from public.floor_spaces order by sort_order`);
    expect(rows).toHaveLength(6);
  });

  it("can only be changed by a super admin", async () => {
    const res = await as(
      db,
      user(companyUserId),
      `update public.floor_spaces set label = 'Mine' returning id`,
    );
    expect(res.rows).toHaveLength(0);
    await expect(as(db, anon, `update public.floor_spaces set label = 'Mine'`)).rejects.toThrow(
      /permission denied/,
    );
    const ok = await as(
      db,
      user(adminId),
      `update public.floor_spaces set capacity = 14 where code = '101' returning id`,
    );
    expect(ok.rows).toHaveLength(1);
  });
});

describe("company registration and approval", () => {
  it("forces new companies to pending and hides them publicly", async () => {
    const created = await createCompany(companyUserId, "Acme Robotics", "acme-robotics");
    companyId = created.id;
    expect(created.status).toBe("pending");

    const publicView = await as(db, anon, `select id from public.companies`);
    expect(publicView.rows).toHaveLength(0);

    const ownerView = await as(db, user(companyUserId), `select id from public.companies`);
    expect(ownerView.rows).toHaveLength(1);
  });

  it("allows only one company per account", async () => {
    await expect(createCompany(companyUserId, "Acme Two", "acme-two")).rejects.toThrow(/duplicate key/);
  });

  it("rejects company creation by visitor accounts", async () => {
    await expect(createCompany(visitorId, "Not A Company", "not-a-company")).rejects.toThrow(
      /row-level security/,
    );
  });

  it("records a pending registration request for review", async () => {
    await as(
      db,
      user(companyUserId),
      `insert into public.company_registration_requests (company_id, submitted_by, status)
       values ($1, $2, 'approved')`,
      [companyId, companyUserId],
    );
    const { rows } = await db.query<{ status: string }>(
      `select status from public.company_registration_requests where company_id = $1`,
      [companyId],
    );
    expect(rows.map((r) => r.status)).toEqual(["pending"]);
  });

  it("prevents owners from approving themselves or choosing an office", async () => {
    await expect(
      as(db, user(companyUserId), `update public.companies set status = 'approved' where id = $1`, [
        companyId,
      ]),
    ).rejects.toThrow(/only a super admin/);
    await expect(
      as(
        db,
        user(companyUserId),
        `update public.companies set floor_id = $2,
           space_id = (select id from public.floor_spaces where code = '101')
         where id = $1`,
        [companyId, FLOOR_ID],
      ),
    ).rejects.toThrow(/only a super admin/);
  });

  it("lets owners edit their own profile fields", async () => {
    const res = await as(
      db,
      user(companyUserId),
      `update public.companies set tagline = 'Robots for labs' where id = $1 returning tagline`,
      [companyId],
    );
    expect(res.rows).toEqual([{ tagline: "Robots for labs" }]);
  });

  it("lets a super admin approve and place a company on an office", async () => {
    await as(
      db,
      user(adminId),
      `update public.companies set status = 'approved', floor_id = $2,
         space_id = (select id from public.floor_spaces where code = '101')
       where id = $1`,
      [companyId, FLOOR_ID],
    );
    const { rows } = await as<{ id: string }>(db, anon, `select id from public.companies`);
    expect(rows.map((r) => r.id)).toEqual([companyId]);

    const reviewed = await db.query<{ reviewed_by: string }>(
      `select reviewed_by from public.companies where id = $1`,
      [companyId],
    );
    expect(reviewed.rows[0].reviewed_by).toBe(adminId);
  });

  it("refuses to assign a company to a non-office space or an occupied office", async () => {
    otherCompanyId = (await createCompany(otherCompanyUserId, "Globex", "globex")).id;
    await expect(
      as(
        db,
        user(adminId),
        `update public.companies set floor_id = $2,
           space_id = (select id from public.floor_spaces where code = 'BR-1')
         where id = $1`,
        [otherCompanyId, FLOOR_ID],
      ),
    ).rejects.toThrow(/office spaces/);
    await expect(
      as(
        db,
        user(adminId),
        `update public.companies set floor_id = $2,
           space_id = (select id from public.floor_spaces where code = '101')
         where id = $1`,
        [otherCompanyId, FLOOR_ID],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("availability and team members", () => {
  it("lets the owner manage team records and availability", async () => {
    const { rows } = await as<{ id: string }>(
      db,
      user(companyUserId),
      `insert into public.company_team_members (company_id, full_name, job_title)
       values ($1, 'Rahul', 'Founder') returning id`,
      [companyId],
    );
    memberId = rows[0].id;

    await as(
      db,
      user(companyUserId),
      `insert into public.member_availability (member_id, status) values ($1, 'available')`,
      [memberId],
    );
    await as(
      db,
      user(companyUserId),
      `insert into public.company_availability (company_id, status) values ($1, 'busy')`,
      [companyId],
    );

    const stamp = await db.query<{ updated_by: string }>(
      `select updated_by from public.member_availability where member_id = $1`,
      [memberId],
    );
    expect(stamp.rows[0].updated_by).toBe(companyUserId);
  });

  it("exposes approved companies' availability publicly", async () => {
    const { rows } = await as(db, anon, `select status from public.member_availability`);
    expect(rows).toEqual([{ status: "available" }]);
  });

  it("stops other accounts from editing a company's team or availability", async () => {
    await expect(
      as(
        db,
        user(otherCompanyUserId),
        `insert into public.company_team_members (company_id, full_name) values ($1, 'Mallory')`,
        [companyId],
      ),
    ).rejects.toThrow(/row-level security/);
    const res = await as(
      db,
      user(otherCompanyUserId),
      `update public.member_availability set status = 'unavailable' where member_id = $1 returning member_id`,
      [memberId],
    );
    expect(res.rows).toHaveLength(0);
  });
});

describe("appointments", () => {
  let appointmentId: string;

  async function request(asUser: string, slot: readonly [string, string], member: string | null = memberId) {
    const { rows } = await as<{ id: string; status: string }>(
      db,
      user(asUser),
      `insert into public.appointments
         (company_id, requester_id, member_id, starts_at, ends_at, meeting_type, purpose, status)
       values ($1, $2, $3, $4, $5, 'in_person', 'Discuss a pilot', 'accepted')
       returning id, status`,
      [companyId, asUser, member, slot[0], slot[1]],
    );
    return rows[0];
  }

  it("creates requests as pending regardless of input", async () => {
    const created = await request(visitorId, futureSlot(3));
    appointmentId = created.id;
    expect(created.status).toBe("pending");
  });

  it("rejects past slots, self-booking and requests for another user", async () => {
    const past = futureSlot(-2);
    await expect(request(visitorId, past)).rejects.toThrow(/future/);
    await expect(request(companyUserId, futureSlot(4))).rejects.toThrow(/themselves/);
    await expect(
      as(
        db,
        user(visitorId),
        `insert into public.appointments (company_id, requester_id, starts_at, ends_at, meeting_type, purpose)
         values ($1, $2, $3, $4, 'online', 'Spoofed')`,
        [companyId, otherVisitorId, ...futureSlot(5)],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps appointments private to participants and admins", async () => {
    const outsider = await as(db, user(otherVisitorId), `select id from public.appointments`);
    expect(outsider.rows).toHaveLength(0);
    const company = await as(db, user(companyUserId), `select id from public.appointments`);
    expect(company.rows).toHaveLength(1);
    const admin = await as(db, user(adminId), `select id from public.appointments`);
    expect(admin.rows).toHaveLength(1);
  });

  it("lets a company see the requester's profile once contacted", async () => {
    const { rows } = await as<{ full_name: string }>(
      db,
      user(companyUserId),
      `select full_name from public.profiles where id = $1`,
      [visitorId],
    );
    expect(rows).toEqual([{ full_name: "Vera V." }]);
  });

  it("does not let the requester accept their own request", async () => {
    await expect(
      as(db, user(visitorId), `update public.appointments set status = 'accepted' where id = $1`, [
        appointmentId,
      ]),
    ).rejects.toThrow(/invalid appointment status change/);
  });

  it("lets the company accept and records the decision", async () => {
    await as(db, user(companyUserId), `update public.appointments set status = 'accepted' where id = $1`, [
      appointmentId,
    ]);
    const { rows } = await db.query<{ status: string; decided_by: string }>(
      `select status, decided_by from public.appointments where id = $1`,
      [appointmentId],
    );
    expect(rows[0]).toEqual({ status: "accepted", decided_by: companyUserId });
  });

  it("prevents overlapping accepted appointments for the same representative", async () => {
    const [start] = futureSlot(3);
    const overlapStart = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    const overlapEnd = new Date(new Date(start).getTime() + 90 * 60_000).toISOString();
    const second = await request(otherVisitorId, [overlapStart, overlapEnd]);
    await expect(
      as(db, user(companyUserId), `update public.appointments set status = 'accepted' where id = $1`, [
        second.id,
      ]),
    ).rejects.toThrow(/appointments_no_overlap/);

    // Back-to-back slots do not conflict.
    const end = new Date(new Date(start).getTime() + 60 * 60_000);
    const adjacent = await request(otherVisitorId, [
      end.toISOString(),
      new Date(end.getTime() + 30 * 60_000).toISOString(),
    ]);
    await as(db, user(companyUserId), `update public.appointments set status = 'accepted' where id = $1`, [
      adjacent.id,
    ]);
  });

  it("refuses to complete a meeting that has not started", async () => {
    await expect(
      as(db, user(companyUserId), `update public.appointments set status = 'completed' where id = $1`, [
        appointmentId,
      ]),
    ).rejects.toThrow(/invalid appointment status change/);
  });

  it("lets the requester cancel but not edit details", async () => {
    await expect(
      as(db, user(visitorId), `update public.appointments set purpose = 'Changed' where id = $1`, [
        appointmentId,
      ]),
    ).rejects.toThrow(/cannot be changed/);
    await as(db, user(visitorId), `update public.appointments set status = 'cancelled' where id = $1`, [
      appointmentId,
    ]);
    const { rows } = await db.query<{ cancelled_by: string }>(
      `select cancelled_by from public.appointments where id = $1`,
      [appointmentId],
    );
    expect(rows[0].cancelled_by).toBe(visitorId);
  });
});

describe("chat", () => {
  let conversationId: string;

  beforeAll(async () => {
    // Conversations are opened by trusted server code (RPC added in the chat phase).
    const { rows } = await db.query<{ id: string }>(
      `insert into public.conversations (company_id, visitor_id) values ($1, $2) returning id`,
      [companyId, visitorId],
    );
    conversationId = rows[0].id;
    await db.query(
      `insert into public.conversation_members (conversation_id, profile_id, member_role)
       values ($1, $2, 'visitor'), ($1, $3, 'company')`,
      [conversationId, visitorId, companyUserId],
    );
  });

  it("does not let end users open conversations directly", async () => {
    await expect(
      as(
        db,
        user(otherVisitorId),
        `insert into public.conversations (company_id, visitor_id) values ($1, $2)`,
        [companyId, otherVisitorId],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("delivers messages between members only", async () => {
    await as(
      db,
      user(visitorId),
      `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello Acme!')`,
      [conversationId, visitorId],
    );
    const company = await as(db, user(companyUserId), `select body from public.messages`);
    expect(company.rows).toEqual([{ body: "Hello Acme!" }]);

    for (const outsider of [otherVisitorId, adminId]) {
      const { rows } = await as(db, user(outsider), `select body from public.messages`);
      expect(rows).toHaveLength(0);
    }
  });

  it("rejects spoofed senders and non-members", async () => {
    await expect(
      as(
        db,
        user(visitorId),
        `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Spoof')`,
        [conversationId, companyUserId],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(
        db,
        user(otherVisitorId),
        `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Intrude')`,
        [conversationId, otherVisitorId],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("updates conversation activity and the sender's read marker", async () => {
    const { rows } = await db.query<{ last_message_at: Date | null; last_read_at: Date | null }>(
      `select c.last_message_at, m.last_read_at
         from public.conversations c
         join public.conversation_members m on m.conversation_id = c.id and m.profile_id = $2
        where c.id = $1`,
      [conversationId, visitorId],
    );
    expect(rows[0].last_message_at).not.toBeNull();
    expect(rows[0].last_read_at).toEqual(rows[0].last_message_at);
  });
});

describe("notifications", () => {
  it("cannot be forged by end users", async () => {
    await expect(
      as(
        db,
        user(visitorId),
        `insert into public.notifications (recipient_id, type, title) values ($1, 'system', 'Hi')`,
        [otherVisitorId],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("are readable and markable only by their recipient", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.notifications (recipient_id, type, title) values ($1, 'system', 'Welcome') returning id`,
      [visitorId],
    );
    const id = rows[0].id;
    const others = await as(db, user(otherVisitorId), `select id from public.notifications`);
    expect(others.rows).toHaveLength(0);
    await expect(
      as(db, user(visitorId), `update public.notifications set title = 'Edited' where id = $1`, [id]),
    ).rejects.toThrow(/permission denied/);
    const marked = await as(
      db,
      user(visitorId),
      `update public.notifications set read_at = now() where id = $1 returning id`,
      [id],
    );
    expect(marked.rows).toHaveLength(1);
  });
});

describe("storage", () => {
  it("lets company accounts upload only into their own folder", async () => {
    await as(
      db,
      user(companyUserId),
      `insert into storage.objects (bucket_id, name) values ('company-logos', $1)`,
      [`${companyId}/logo.png`],
    );
    await expect(
      as(
        db,
        user(otherCompanyUserId),
        `insert into storage.objects (bucket_id, name) values ('company-logos', $1)`,
        [`${companyId}/hijack.png`],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(
        db,
        user(companyUserId),
        `insert into storage.objects (bucket_id, name) values ('company-logos', 'not-a-uuid/logo.png')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
