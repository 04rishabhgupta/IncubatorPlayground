import { describe, expect, it } from "vitest";
import { appointmentEmail, contactEmail, escapeHtml } from "@/lib/email/templates";
import { contactFormSchema, messageBodySchema } from "@/lib/validation/messages";

const COMPANY_ID = "00000000-0000-4000-8000-0000000000aa";

describe("contact email", () => {
  const email = contactEmail({
    companyName: "Acme Robotics",
    senderName: "Vera <script>",
    senderEmail: "vera@example.com",
    subject: "Pilot\r\nBcc: everyone@example.com",
    body: 'Hello <b>team</b> & "friends"\nSecond line',
  });

  it("keeps the subject on one line, so it can't inject headers", () => {
    expect(email.subject).toBe("Pilot Bcc: everyone@example.com — via Startup Floor Connect");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("escapes everything the sender typed in the HTML version", () => {
    expect(email.html).toContain("Vera &lt;script&gt;");
    expect(email.html).toContain("Hello &lt;b&gt;team&lt;/b&gt; &amp; &quot;friends&quot;<br>Second line");
    expect(email.html).not.toMatch(/<script|<b>/);
  });

  it("explains who wrote and how to reply in the text version", () => {
    expect(email.text).toContain("Vera <script> (vera@example.com) sent Acme Robotics a message");
    expect(email.text).toContain("Reply to this email to answer them directly.");
  });

  it("escapes the five HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("appointment emails", () => {
  const base = {
    companyName: "Acme",
    requesterName: "Vera",
    when: "Wed 14 Oct 2026, 10:30 am – 11:00 am IST",
    url: "http://localhost:3001/account/appointments",
  };

  it.each([
    ["requested", "New appointment request from Vera", "Vera asked to meet Acme"],
    ["accepted", "Acme accepted your appointment", "Acme accepted your appointment on Wed 14 Oct"],
    ["rejected", "Acme declined your appointment", "Acme declined your appointment request"],
    ["cancelled", "Appointment cancelled: Wed 14 Oct 2026", "between Vera and Acme"],
  ] as const)("%s", (event, subject, lead) => {
    const email = appointmentEmail({ ...base, event, reason: event === "cancelled" ? "Travelling" : null });
    expect(email.subject).toContain(subject);
    expect(email.text).toContain(lead);
    expect(email.text).toContain(base.url);
    if (event === "cancelled") expect(email.text).toContain("Reason: Travelling");
    else expect(email.text).not.toContain("Reason:");
  });
});

describe("message and contact validation", () => {
  it("trims messages and rejects empty or overlong ones", () => {
    expect(messageBodySchema.parse("  hi  ")).toBe("hi");
    expect(messageBodySchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(4001)).success).toBe(false);
  });

  const form = {
    companyId: COMPANY_ID,
    name: "Vera",
    subject: "Pilot",
    body: "Could we run a pilot together?",
  };

  it("accepts a normal contact message", () => {
    expect(contactFormSchema.parse(form)).toMatchObject({ name: "Vera", website: "" });
  });

  it.each([
    ["a very short message", { body: "Hi" }],
    ["a missing subject", { subject: " " }],
    ["a filled-in spam trap", { website: "http://spam.example" }],
    ["a bad company id", { companyId: "nope" }],
  ])("rejects %s", (_label, change) => {
    expect(contactFormSchema.safeParse({ ...form, ...change }).success).toBe(false);
  });
});
