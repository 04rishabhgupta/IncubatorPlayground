import { beforeAll, describe, expect, it } from "vitest";
import { addDays, utcToWallTime, wallTimeToUtc } from "@/lib/appointments/time";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

const IST = "Asia/Kolkata";

let db: Db;
let owner: string;
let otherOwner: string;
let visitor: string;
let companyId: string;
let otherCompanyId: string;
let rahul: string;
let hidden: string;

/** A slot `days` from today (building time) at `time`, lasting `minutes`. */
function slot(days: number, time: string, minutes = 30) {
  const today = utcToWallTime(new Date(), IST).date;
  const start = wallTimeToUtc({ date: addDays(today, days), time }, IST)!;
  return [start.toISOString(), new Date(start.getTime() + minutes * 60_000).toISOString()] as const;
}

async function book(
  asUser: string,
  [start, end]: readonly [string, string],
  opts: { member?: string | null; company?: string } = {},
) {
  const { rows } = await as<{ id: string; status: string; timezone: string }>(
    db,
    user(asUser),
    `insert into public.appointments (company_id, requester_id, member_id, starts_at, ends_at, meeting_type, purpose, timezone)
     values ($1, $2, $3, $4, $5, 'online', 'Discuss a partnership', 'UTC')
     returning id, status, timezone`,
    [opts.company ?? companyId, asUser, opts.member === undefined ? rahul : opts.member, start, end],
  );
  return rows[0];
}

async function setStatus(asUser: string, id: string, status: string, note?: string) {
  await as(
    db,
    user(asUser),
    `update public.appointments set status = $2, decision_note = coalesce($3, decision_note) where id = $1`,
    [id, status, note ?? null],
  );
}

async function lastNotification(recipient: string) {
  const { rows } = await as<{ type: string; title: string; body: string; link: string }>(
    db,
    user(recipient),
    `select type, title, body, link from public.notifications order by created_at desc limit 1`,
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDatabase();
  const meta = (name: string) => ({
    account_type: "company",
    company: { name, description: "Booking test company description." },
  });
  owner = await createAuthUser(db, "owner@acme.dev", meta("Acme"));
  otherOwner = await createAuthUser(db, "owner@globex.dev", meta("Globex"));
  visitor = await createAuthUser(db, "vera@example.dev", { full_name: "Vera Visitor" });
  const { rows } = await db.query<{ id: string; owner_id: string }>(
    `select id, owner_id from public.companies`,
  );
  companyId = rows.find((r) => r.owner_id === owner)!.id;
  otherCompanyId = rows.find((r) => r.owner_id === otherOwner)!.id;
  await db.query(`update public.companies set status = 'approved'`);
  const member = async (name: string, isPublic: boolean) =>
    (
      await db.query<{ id: string }>(
        `insert into public.company_team_members (company_id, full_name, is_public) values ($1, $2, $3) returning id`,
        [companyId, name, isPublic],
      )
    ).rows[0].id;
  rahul = await member("Rahul", true);
  hidden = await member("Hidden Hari", false);
});

describe("booking rules", () => {
  it("accepts a valid request and records the building's time zone, not the client's", async () => {
    const created = await book(visitor, slot(2, "10:30", 60));
    expect(created).toMatchObject({ status: "pending", timezone: IST });
  });

  it.each([
    ["before 08:00", slot(3, "07:45"), /between 08:00 and 20:00/],
    ["ending after 20:00", slot(3, "19:30", 60), /between 08:00 and 20:00/],
    ["off the 15-minute grid", slot(3, "10:10"), /15-minute intervals/],
    ["with an unsupported duration", slot(3, "10:00", 20), /duration must be/],
    ["more than 60 days ahead", slot(61, "10:00"), /at most 60 days/],
  ])("rejects a request %s", async (_label, times, error) => {
    await expect(book(visitor, times)).rejects.toThrow(error);
  });

  it("requires at least an hour's notice", async () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    await expect(
      book(visitor, [soon.toISOString(), new Date(soon.getTime() + 30 * 60_000).toISOString()]),
    ).rejects.toThrow(/at least 1 hour/);
  });

  it("allows a meeting ending exactly at 20:00 and one exactly 60 days ahead", async () => {
    await book(visitor, slot(4, "19:00", 60), { member: null, company: otherCompanyId });
    await book(visitor, slot(60, "10:00"), { member: null, company: otherCompanyId });
  });

  it("refuses duplicate pending requests for the same time", async () => {
    await book(visitor, slot(5, "11:00"), { member: null });
    await expect(book(visitor, slot(5, "11:00"), { member: null })).rejects.toThrow(
      /already have a pending request/,
    );
  });

  it("limits a user to 3 pending requests per company", async () => {
    // Visitor already has 2 pending requests with Acme (10:30 day 2, 11:00 day 5).
    await book(visitor, slot(6, "09:00"));
    await expect(book(visitor, slot(7, "09:00"))).rejects.toThrow(/at most 3 pending requests/);
    // Other companies are unaffected.
    await book(visitor, slot(7, "09:00"), { member: null, company: otherCompanyId });
  });

  it("lets company accounts book other companies but not themselves", async () => {
    const created = await book(otherOwner, slot(8, "15:00"));
    expect(created.status).toBe("pending");
    await expect(book(owner, slot(8, "16:00"))).rejects.toThrow(/themselves/);
  });

  it("refuses representatives who don't take appointments", async () => {
    await db.query(`update public.company_team_members set is_bookable = false where id = $1`, [rahul]);
    await expect(book(otherOwner, slot(9, "10:00"))).rejects.toThrow(/not accepting appointment requests/);
    await db.query(`update public.company_team_members set is_bookable = true where id = $1`, [rahul]);
  });
});

describe("notifications", () => {
  let appointmentId: string;

  it("tells the company about a new request", async () => {
    appointmentId = (await book(otherOwner, slot(10, "14:00"))).id;
    expect(await lastNotification(owner)).toMatchObject({
      type: "appointment_requested",
      title: "New appointment request",
      link: "/company/appointments",
    });
    expect((await lastNotification(owner)).body).toMatch(/requested .* 02:00 PM with Rahul\./);
  });

  it("tells the requester when it is accepted, with the company's note", async () => {
    await setStatus(owner, appointmentId, "accepted", "Join via the meeting link.");
    expect(await lastNotification(otherOwner)).toMatchObject({
      type: "appointment_accepted",
      title: "Acme accepted your appointment",
      link: "/account/appointments",
    });
    expect((await lastNotification(otherOwner)).body).toMatch(/Join via the meeting link\.$/);
  });

  it("tells the requester when the company cancels", async () => {
    await setStatus(owner, appointmentId, "cancelled");
    expect(await lastNotification(otherOwner)).toMatchObject({
      type: "appointment_cancelled",
      title: "Acme cancelled your appointment",
    });
  });

  it("tells the company when the requester cancels", async () => {
    const id = (await book(otherOwner, slot(11, "14:00"))).id;
    await setStatus(otherOwner, id, "cancelled");
    expect(await lastNotification(owner)).toMatchObject({
      type: "appointment_cancelled",
      title: "owner@globex.dev cancelled an appointment",
    });
  });

  it("includes either side's cancellation reason, set only while cancelling", async () => {
    const id = (await book(otherOwner, slot(13, "14:00"))).id;
    await expect(
      as(db, user(otherOwner), `update public.appointments set cancellation_reason = 'early' where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/only be given when cancelling/);
    await as(
      db,
      user(otherOwner),
      `update public.appointments set status = 'cancelled', cancellation_reason = 'Plans changed.' where id = $1`,
      [id],
    );
    expect((await lastNotification(owner)).body).toMatch(/Reason: Plans changed.$/);
    await expect(
      as(db, user(owner), `update public.appointments set cancellation_reason = 'edited' where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/only be given when cancelling/);
  });

  it("lets the company give a reason when it cancels", async () => {
    const id = (await book(otherOwner, slot(14, "14:00"))).id;
    await setStatus(owner, id, "accepted");
    await as(
      db,
      user(owner),
      `update public.appointments set status = 'cancelled', cancellation_reason = 'Office closed that day.' where id = $1`,
      [id],
    );
    expect((await lastNotification(otherOwner)).body).toMatch(/Reason: Office closed that day.$/);
  });

  it("tells the requester when a request is declined", async () => {
    const id = (await book(otherOwner, slot(12, "14:00"), { member: null })).id;
    await setStatus(owner, id, "rejected", "We're fully booked that week.");
    expect(await lastNotification(otherOwner)).toMatchObject({
      type: "appointment_rejected",
      title: "Acme declined your appointment request",
    });
  });
});

describe("get_busy_times", () => {
  beforeAll(async () => {
    const [start, end] = slot(20, "10:00", 60);
    // Accepted meeting for Rahul, created in a trusted context.
    await db.query(
      `insert into public.appointments (company_id, requester_id, member_id, starts_at, ends_at, meeting_type, purpose, status)
       values ($1, $2, $3, $4, $5, 'in_person', 'Private purpose', 'accepted')`,
      [companyId, visitor, rahul, start, end],
    );
  });

  const range = () => [slot(19, "08:00")[0], slot(22, "08:00")[0]];

  it("returns only start and end times of accepted meetings", async () => {
    const { rows, fields } = await as(
      db,
      user(otherOwner),
      `select * from public.get_busy_times($1, $2, $3)`,
      [rahul, ...range()],
    );
    expect(rows).toHaveLength(1);
    expect(fields.map((f) => f.name)).toEqual(["starts_at", "ends_at"]);
  });

  it("returns nothing for hidden members or oversized ranges, and is not available to guests", async () => {
    const hiddenRows = await as(db, user(otherOwner), `select * from public.get_busy_times($1, $2, $3)`, [
      hidden,
      ...range(),
    ]);
    expect(hiddenRows.rows).toHaveLength(0);
    const huge = await as(db, user(otherOwner), `select * from public.get_busy_times($1, $2, $3)`, [
      rahul,
      slot(0, "08:00")[0],
      slot(70, "08:00")[0],
    ]);
    expect(huge.rows).toHaveLength(0);
    await expect(
      as(db, anon, `select * from public.get_busy_times($1, $2, $3)`, [rahul, ...range()]),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let other users read the appointment itself", async () => {
    const { rows } = await as(
      db,
      user(otherOwner),
      `select purpose from public.appointments where purpose = 'Private purpose'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("realtime", () => {
  it("publishes appointment changes", async () => {
    const { rows } = await db.query(
      `select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments'`,
    );
    expect(rows).toHaveLength(1);
  });
});
