import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createAuthUser, createTestDatabase, user, type Db } from "./harness";

/** Phase 7: conversations, message notifications, limits and the contact form log. */

let db: Db;
let adminId: string;
let visitorId: string;
let otherVisitorId: string;

async function newCompany(email: string, name: string, status = "approved") {
  const ownerId = await createAuthUser(db, email, {
    account_type: "company",
    full_name: `${name} owner`,
    company: { name, description: "Communication test company description." },
  });
  const { rows } = await db.query<{ id: string }>(`select id from public.companies where owner_id = $1`, [
    ownerId,
  ]);
  await db.query(`update public.companies set status = $2 where id = $1`, [rows[0].id, status]);
  return { ownerId, companyId: rows[0].id };
}

const start = (uid: string, companyId: string) =>
  as<{ id: string }>(db, user(uid), `select public.start_conversation($1, 'Hello') as id`, [companyId]).then(
    (r) => r.rows[0].id,
  );
const send = (uid: string, conversationId: string, body: string) =>
  as(db, user(uid), `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)`, [
    conversationId,
    uid,
    body,
  ]);
const messageNotifications = async (uid: string) =>
  (
    await as<{ title: string; body: string; link: string; read_at: string | null }>(
      db,
      user(uid),
      `select title, body, link, read_at from public.notifications where type = 'message_received' order by created_at`,
    )
  ).rows;

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createAuthUser(db, "admin@example.com", { full_name: "Admin" });
  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [adminId]);
  visitorId = await createAuthUser(db, "vera@example.com", { full_name: "Vera Visitor" });
  otherVisitorId = await createAuthUser(db, "otto@example.com", { full_name: "Otto Other" });
});

describe("start_conversation", () => {
  it("opens one private conversation per visitor and company", async () => {
    const acme = await newCompany("acme@example.com", "Acme");
    const id = await start(visitorId, acme.companyId);
    expect(await start(visitorId, acme.companyId)).toBe(id); // same one again

    const members = await as<{ member_role: string }>(
      db,
      user(acme.ownerId),
      `select member_role from public.conversation_members where conversation_id = $1 order by member_role`,
      [id],
    );
    expect(members.rows.map((m) => m.member_role)).toEqual(["company", "visitor"]);

    await send(visitorId, id, "Hi Acme, are you hiring?");
    const read = (uid: string) =>
      as(db, user(uid), `select body from public.messages where conversation_id = $1`, [id]).then(
        (r) => r.rows.length,
      );
    expect(await read(visitorId)).toBe(1);
    expect(await read(acme.ownerId)).toBe(1);
    // Nobody else — not another visitor, not even the admin — can read it.
    expect(await read(otherVisitorId)).toBe(0);
    expect(await read(adminId)).toBe(0);
    await expect(as(db, anon, `select body from public.messages`)).rejects.toThrow(/permission denied/);
  });

  it("lets companies message other companies, but not themselves", async () => {
    const a = await newCompany("a@example.com", "Alpha Co");
    const b = await newCompany("b@example.com", "Beta Co");
    await expect(start(a.ownerId, b.companyId)).resolves.toBeTruthy();
    await expect(start(a.ownerId, a.companyId)).rejects.toThrow(/own company/);
  });

  it("refuses companies that aren't approved, and the admin account", async () => {
    const pending = await newCompany("pending@example.com", "Pending Co", "pending");
    await expect(start(visitorId, pending.companyId)).rejects.toThrow(/can't be contacted/);
    const ok = await newCompany("ok@example.com", "Ok Co");
    await expect(start(adminId, ok.companyId)).rejects.toThrow(/only visitor and company accounts/);
    await expect(as(db, anon, `select public.start_conversation($1)`, [ok.companyId])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("only lets members post, and only as themselves", async () => {
    const c = await newCompany("post@example.com", "Post Co");
    const id = await start(visitorId, c.companyId);
    await expect(send(otherVisitorId, id, "let me in")).rejects.toThrow(/row-level security/);
    await expect(
      as(
        db,
        user(visitorId),
        `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`,
        [id, c.ownerId],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("message notifications", () => {
  it("merge into one unread notification per conversation, named after the sender", async () => {
    const c = await newCompany("notify@example.com", "Notify Co");
    const id = await start(visitorId, c.companyId);
    await send(visitorId, id, "First");
    await send(visitorId, id, "Second");
    await send(visitorId, id, "Third");

    expect(await messageNotifications(c.ownerId)).toEqual([
      { title: "3 new messages from Vera Visitor", body: "Third", link: `/messages/${id}`, read_at: null },
    ]);
    // The sender isn't notified about their own messages.
    expect((await messageNotifications(visitorId)).filter((n) => n.link === `/messages/${id}`)).toEqual([]);

    // The company replies: the visitor sees it from the company's name.
    await send(c.ownerId, id, "Hello Vera");
    expect((await messageNotifications(visitorId)).find((n) => n.link === `/messages/${id}`)?.title).toBe(
      "New message from Notify Co",
    );

    // Once read, the next message starts a fresh notification.
    await as(
      db,
      user(c.ownerId),
      `update public.notifications set read_at = now() where type = 'message_received'`,
    );
    await send(visitorId, id, "Fourth");
    const after = await messageNotifications(c.ownerId);
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ title: "New message from Vera Visitor", read_at: null });
  });

  it("stamp the sender's read state, and the reader's when they mark it", async () => {
    const c = await newCompany("seen@example.com", "Seen Co");
    const id = await start(visitorId, c.companyId);
    await send(visitorId, id, "Ping");
    const readState = async () =>
      (
        await as<{ member_role: string; last_read_at: string | null }>(
          db,
          user(visitorId),
          `select member_role, last_read_at from public.conversation_members where conversation_id = $1 order by member_role`,
          [id],
        )
      ).rows;
    const [company, visitor] = await readState();
    expect(visitor.last_read_at).not.toBeNull();
    expect(company.last_read_at).toBeNull();

    await as(
      db,
      user(c.ownerId),
      `update public.conversation_members set last_read_at = now() where conversation_id = $1 and profile_id = $2`,
      [id, c.ownerId],
    );
    expect((await readState())[0].last_read_at).not.toBeNull();
  });
});

describe("send limit", () => {
  it("stops a sender after 20 messages in a minute", async () => {
    const c = await newCompany("flood@example.com", "Flood Co");
    const flooder = await createAuthUser(db, "flood-visitor@example.com");
    const id = await start(flooder, c.companyId);
    for (let i = 0; i < 20; i++) await send(flooder, id, `Message ${i}`);
    await expect(send(flooder, id, "One too many")).rejects.toThrow(/too quickly/);
  });
});

describe("contact form log", () => {
  it("takes the sender from the account, notifies the company and keeps it private", async () => {
    const c = await newCompany("contact@example.com", "Contact Co");
    const { rows } = await as<{ id: string; sender_email: string; sender_name: string; status: string }>(
      db,
      user(visitorId),
      `insert into public.contact_messages (company_id, sender_name, sender_email, subject, body)
       values ($1, '', 'forged@evil.test', 'Partnership', 'Can we talk about a pilot?')
       returning id, sender_email, sender_name, status`,
      [c.companyId],
    );
    expect(rows[0]).toMatchObject({
      sender_email: "vera@example.com",
      sender_name: "Vera Visitor",
      status: "pending",
    });

    const { rows: notes } = await as<{ title: string; link: string }>(
      db,
      user(c.ownerId),
      `select title, link from public.notifications where type = 'contact_message'`,
    );
    expect(notes).toEqual([{ title: "Message from Vera Visitor: Partnership", link: "/company/contact" }]);

    const visible = async (uid: string) =>
      (await as(db, user(uid), `select id from public.contact_messages where id = $1`, [rows[0].id])).rows
        .length;
    expect(await visible(visitorId)).toBe(1);
    expect(await visible(c.ownerId)).toBe(1);
    expect(await visible(adminId)).toBe(1);
    expect(await visible(otherVisitorId)).toBe(0);

    // The sender records delivery once; nobody can rewrite it afterwards.
    await as(db, user(visitorId), `select public.set_contact_delivery($1, 'not_configured')`, [rows[0].id]);
    await as(db, user(visitorId), `select public.set_contact_delivery($1, 'sent')`, [rows[0].id]);
    await as(db, user(otherVisitorId), `select public.set_contact_delivery($1, 'failed', 'x')`, [rows[0].id]);
    const { rows: final } = await db.query<{ status: string }>(
      `select status from public.contact_messages where id = $1`,
      [rows[0].id],
    );
    expect(final[0].status).toBe("not_configured");
    await expect(
      as(db, user(visitorId), `update public.contact_messages set status = 'sent' where id = $1`, [
        rows[0].id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("limits senders to 3 an hour and refuses unapproved or own companies", async () => {
    const c = await newCompany("limit@example.com", "Limit Co");
    const sender = await createAuthUser(db, "busy@example.com", { full_name: "Busy Bee" });
    const insert = (uid: string, companyId: string) =>
      as(
        db,
        user(uid),
        `insert into public.contact_messages (company_id, sender_name, sender_email, subject, body)
         values ($1, 'x', 'x', 'Hi', 'Hello there')`,
        [companyId],
      );
    for (let i = 0; i < 3; i++) await insert(sender, c.companyId);
    await expect(insert(sender, c.companyId)).rejects.toThrow(/3 messages in the last hour/);

    const pending = await newCompany("pending-contact@example.com", "Pending Contact", "pending");
    await expect(insert(visitorId, pending.companyId)).rejects.toThrow(/can't be contacted/);
    await expect(insert(c.ownerId, c.companyId)).rejects.toThrow(/own company/);
    // Guests can't use the form at all.
    await expect(
      as(
        db,
        anon,
        `insert into public.contact_messages (company_id, sender_name, sender_email, subject, body)
         values ($1, 'x', 'x', 'Hi', 'Hello there')`,
        [c.companyId],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("my_conversations", () => {
  it("lists the caller's conversations with the other side's name, last message and unread count", async () => {
    const c = await newCompany("inbox@example.com", "Inbox Co");
    const reader = await createAuthUser(db, "reader@example.com", { full_name: "Rita Reader" });
    const id = await start(reader, c.companyId);
    await send(reader, id, "One");
    await send(reader, id, "Two");

    type Row = {
      id: string;
      other_name: string;
      last_body: string;
      last_from_me: boolean;
      unread: number;
      my_role: string;
    };
    const inbox = async (uid: string) =>
      (await as<Row>(db, user(uid), `select * from public.my_conversations()`)).rows.find((r) => r.id === id);

    expect(await inbox(c.ownerId)).toMatchObject({
      my_role: "company",
      other_name: "Rita Reader",
      last_body: "Two",
      last_from_me: false,
      unread: 2,
    });
    expect(await inbox(reader)).toMatchObject({
      my_role: "visitor",
      other_name: "Inbox Co",
      last_from_me: true,
      unread: 0,
    });

    // Reading clears the count.
    await as(
      db,
      user(c.ownerId),
      `update public.conversation_members set last_read_at = now() where conversation_id = $1 and profile_id = $2`,
      [id, c.ownerId],
    );
    expect((await inbox(c.ownerId))?.unread).toBe(0);
    // Other people never see it.
    expect(await inbox(otherVisitorId)).toBeUndefined();
  });
});
