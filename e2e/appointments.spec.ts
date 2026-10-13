import { expect, test, type Page } from "@playwright/test";
import { addDays, utcToWallTime, wallTimeToUtc } from "../src/lib/appointments/time";
import { adminClient, login, readAccounts } from "./support";

/**
 * Phase 6: the whole appointment loop between a visitor, two companies (Alpha
 * is booked; Beta's account also books Alpha) and the admin.
 */
const accounts = readAccounts();
const alpha = () => accounts.placed[0];
const beta = () => accounts.placed[1];
const IST = "Asia/Kolkata";
const day = (offset: number) => addDays(utcToWallTime(new Date(), IST).date, offset);

test.describe.configure({ mode: "serial" });

async function openBooking(page: Page, slug = alpha().slug) {
  await page.goto(`/companies/${slug}/book`);
  await expect(page.getByRole("button", { name: "Send appointment request" })).toBeVisible();
}

async function fillBooking(
  page: Page,
  opts: {
    member?: string;
    date: string;
    duration?: string;
    time: string;
    online?: boolean;
    purpose?: string;
  },
) {
  if (opts.member) await page.getByLabel("Representative").selectOption({ label: opts.member });
  await page.getByLabel("Date").fill(opts.date);
  if (opts.duration) await page.getByLabel("Duration").selectOption({ label: opts.duration });
  await page.getByLabel(/Start time/).selectOption(opts.time);
  if (opts.online) await page.getByLabel("Online (they'll send a link)").check();
  if (opts.purpose !== undefined) await page.getByLabel("What would you like to discuss?").fill(opts.purpose);
}

const card = (page: Page, name: RegExp | string) => page.getByRole("listitem").filter({ hasText: name });

test("guests are asked to sign in and come back to the booking form", async ({ page }) => {
  await page.goto(`/companies/${alpha().slug}`);
  await page.getByRole("link", { name: "Request an appointment" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/companies/${alpha().slug}/book`)}`);
  await page.getByLabel("Email").fill(accounts.visitor.email);
  await page.getByLabel("Password").fill("E2eTest-Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`/companies/${alpha().slug}/book`);
});

test("a visitor requests an online meeting with a representative", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await openBooking(page);

  await fillBooking(page, {
    member: "Asha Rao — Founder",
    date: day(1),
    duration: "1 hour",
    time: "10:00",
    online: true,
    purpose: "short",
  });
  await expect(page.getByText(/10:00 am – 11:00 am IST/)).toBeVisible();
  await page.getByRole("button", { name: "Send appointment request" }).click();
  await expect(page.getByText("at least 10 characters")).toBeVisible();
  // Controlled fields survive the validation error.
  await expect(page.getByLabel(/Start time/)).toHaveValue("10:00");

  await page.getByLabel("What would you like to discuss?").fill("Exploring an AI pilot for our lab.");
  await page.getByRole("button", { name: "Send appointment request" }).click();
  await expect(page).toHaveURL("/account/appointments?done=requested");
  await expect(page.getByText("Request sent")).toBeVisible();
  await expect(card(page, alpha().name).getByText("Pending")).toBeVisible();
});

test("the company is notified, rejects an online accept without a link, then accepts", async ({ page }) => {
  await login(page, alpha().email);
  await expect(page).toHaveURL("/company");
  await expect(page.getByRole("link", { name: /Appointments \(1 new\)/ })).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText("New appointment request")).toBeVisible();

  await page.goto("/company/appointments");
  const request = card(page, accounts.visitor.email);
  await expect(request.getByText("Exploring an AI pilot for our lab.")).toBeVisible();
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(request.getByText("Add the meeting link for an online appointment.")).toBeVisible();

  await request.getByLabel("Meeting link").fill("https://meet.example.dev/alpha-vera");
  await request.getByLabel("Message to the requester").fill("Looking forward to it!");
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Appointment accepted.")).toBeVisible();

  await page.getByRole("link", { name: /Upcoming/ }).click();
  await expect(card(page, accounts.visitor.email).getByText("Accepted")).toBeVisible();
});

test("the visitor sees the decision, link and note", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await page.goto("/notifications");
  await expect(page.getByText(`${alpha().name} accepted your appointment`)).toBeVisible();
  await page.goto("/account/appointments");
  const meeting = card(page, alpha().name);
  await expect(meeting.getByText("Accepted")).toBeVisible();
  await expect(meeting.getByRole("link", { name: "https://meet.example.dev/alpha-vera" })).toBeVisible();
  await expect(meeting.getByText("Looking forward to it!")).toBeVisible();
});

test("booked times are disabled for that representative; back-to-back is allowed", async ({ page }) => {
  // Beta's company account books Alpha (company-to-company networking).
  await login(page, beta().email);
  await expect(page).toHaveURL("/company");
  await openBooking(page);
  await page.getByLabel("Representative").selectOption({ label: "Asha Rao — Founder" });
  await page.getByLabel("Date").fill(day(1));
  await page.getByLabel("Duration").selectOption({ label: "30 minutes" });
  const time = page.getByLabel(/Start time/);
  await expect(time.locator('option[value="10:30"]')).toBeDisabled();
  await expect(time.locator('option[value="10:30"]')).toHaveText("10:30 (booked)");
  await expect(time.locator('option[value="11:00"]')).toBeEnabled();

  await time.selectOption("11:00");
  await page.getByLabel("What would you like to discuss?").fill("Back-to-back slot right after Vera.");
  await page.getByRole("button", { name: "Send appointment request" }).click();
  await expect(page).toHaveURL("/account/appointments?done=requested");
});

test("the inbox blocks accepting a request that clashes with an accepted meeting", async ({ page }) => {
  // A clashing request can't be made through the form (the time is disabled),
  // so create one directly to check the inbox and the database guard.
  const admin = adminClient();
  const { data: asha } = await admin
    .from("company_team_members")
    .select("id")
    .eq("company_id", alpha().companyId)
    .eq("full_name", "Asha Rao")
    .single();
  const start = wallTimeToUtc({ date: day(1), time: "10:30" }, IST)!;
  await admin.from("appointments").insert({
    company_id: alpha().companyId,
    requester_id: beta().ownerId,
    member_id: asha!.id,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
    meeting_type: "in_person",
    purpose: "Clashing request created by the test suite.",
  });

  await login(page, alpha().email);
  await expect(page).toHaveURL("/company");
  await page.goto("/company/appointments");
  const clash = card(page, "Clashing request created by the test suite.");
  await expect(clash.getByText(/Asha Rao already has an accepted meeting/)).toBeVisible();
  await expect(clash.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await clash.getByLabel("Message to the requester").fill("Asha is booked then.");
  await clash.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Request declined.")).toBeVisible();

  // Even bypassing the UI, the database refuses the overlap.
  const { data: other } = await admin
    .from("appointments")
    .insert({
      company_id: alpha().companyId,
      requester_id: beta().ownerId,
      member_id: asha!.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
      meeting_type: "in_person",
      purpose: "Second clash for the constraint check.",
    })
    .select("id")
    .single();
  const { error } = await admin.from("appointments").update({ status: "accepted" }).eq("id", other!.id);
  expect(error?.code).toBe("23P01");
});

test("visitors are warned about double-booking themselves, but can still send", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await openBooking(page, beta().slug);
  await fillBooking(page, { date: day(1), duration: "30 minutes", time: "10:30" });
  await expect(page.getByText("You already have a meeting at this time")).toBeVisible();
  await expect(page.getByText(`It overlaps your appointment with ${alpha().name}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send appointment request" })).toBeEnabled();
});

test("overlapping general meetings show a warning but can be accepted", async ({ page, browser }) => {
  // Two "anyone at the company" requests at overlapping times.
  const visitor = await browser.newPage();
  await login(visitor, accounts.visitor.email);
  await expect(visitor).toHaveURL("/account");
  await openBooking(visitor);
  await fillBooking(visitor, {
    date: day(2),
    duration: "1 hour",
    time: "14:00",
    purpose: "General intro meeting one.",
  });
  await visitor.getByRole("button", { name: "Send appointment request" }).click();
  await expect(visitor).toHaveURL("/account/appointments?done=requested");
  await visitor.close();

  const other = await browser.newPage();
  await login(other, beta().email);
  await expect(other).toHaveURL("/company");
  await openBooking(other);
  await fillBooking(other, {
    date: day(2),
    duration: "1 hour",
    time: "14:30",
    purpose: "General intro meeting two.",
  });
  await other.getByRole("button", { name: "Send appointment request" }).click();
  await expect(other).toHaveURL("/account/appointments?done=requested");
  await other.close();

  await login(page, alpha().email);
  await expect(page).toHaveURL("/company");
  await page.goto("/company/appointments");
  await card(page, "General intro meeting one.").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Appointment accepted.")).toBeVisible();
  await page.reload();
  const second = card(page, "General intro meeting two.");
  await expect(second.getByText(/Overlaps another accepted company meeting/)).toBeVisible();
  await second.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Appointment accepted.")).toBeVisible();
});

test("a company can't book itself", async ({ page }) => {
  await login(page, alpha().email);
  await expect(page).toHaveURL("/company");
  await page.goto(`/companies/${alpha().slug}/book`);
  await expect(page.getByText("This is your company")).toBeVisible();
});

test("the visitor cancels and the company is told", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await page.goto("/account/appointments");
  const meeting = card(page, "Exploring an AI pilot for our lab.");
  await meeting.getByRole("button", { name: "Cancel appointment" }).click();
  await meeting.getByLabel("Reason").fill("Plans changed, sorry!");
  await meeting.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText("Appointment cancelled.")).toBeVisible();
  await page.reload();
  await expect(card(page, "Exploring an AI pilot for our lab.").getByText("Cancelled")).toBeVisible();

  const { data } = await adminClient()
    .from("notifications")
    .select("title")
    .eq("recipient_id", alpha().ownerId)
    .eq("type", "appointment_cancelled")
    .limit(1)
    .single();
  expect(data?.title).toMatch(/cancelled an appointment/);
});

test("the company marks a meeting that has happened as completed", async ({ page }) => {
  const start = new Date(Date.now() - 2 * 60 * 60_000);
  await adminClient()
    .from("appointments")
    .insert({
      company_id: alpha().companyId,
      requester_id: accounts.visitor.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 60 * 60_000).toISOString(),
      meeting_type: "in_person",
      purpose: "Meeting that already took place.",
      status: "accepted",
    });
  await login(page, alpha().email);
  await expect(page).toHaveURL("/company");
  await page.goto("/company/appointments?tab=past");
  const past = card(page, "Meeting that already took place.");
  await past.getByRole("button", { name: "Mark as completed" }).click();
  await expect(page.getByText("Marked as completed.")).toBeVisible();
});

test("the admin can monitor appointments", async ({ page }) => {
  await login(page, accounts.admin.email);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("main").getByRole("link", { name: "Appointments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible();
  await expect(page.getByText("Latest 100 requests")).toBeVisible();
  await expect(card(page, "Meeting that already took place.").getByText("Completed")).toBeVisible();
});

test("the booking form works on a phone @mobile", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await openBooking(page, beta().slug);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
