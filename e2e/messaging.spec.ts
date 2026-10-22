import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, login, readAccounts } from "./support";

/**
 * Phase 7: a visitor messages a company, the company replies, both see it
 * live; unread counts, read receipts, merged notifications; the email
 * contact form. Accounts (and with them conversations, messages and contact
 * messages) are removed by global teardown.
 */
const accounts = readAccounts();
const alpha = () => accounts.placed[0];
const beta = () => accounts.placed[1];

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, email: string, landing: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await login(page, email);
  await expect(page).toHaveURL(landing);
  return page;
}

/** The visitor's current display name (another spec renames the shared visitor account). */
async function visitorName() {
  const { data } = await adminClient()
    .from("profiles")
    .select("full_name")
    .eq("id", accounts.visitor.id)
    .single();
  return data!.full_name;
}

const bubbles = (page: Page) => page.getByRole("list", { name: /^Messages with / }).getByRole("listitem");

test("guests are asked to sign in before messaging or emailing a company", async ({ page }) => {
  await page.goto(`/companies/${alpha().slug}`);
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(`/companies/${alpha().slug}`)}`,
  );
  await page.getByRole("button", { name: `Message ${alpha().name}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/login\\?next=${encodeURIComponent(`/companies/${alpha().slug}`)}`),
  );
});

test("a visitor and a company chat live, with unread counts and read receipts", async ({ browser }) => {
  const name = await visitorName();
  const visitor = await signedIn(browser, accounts.visitor.email, "/account");
  await visitor.goto(`/companies/${alpha().slug}`);
  await visitor.getByRole("button", { name: `Message ${alpha().name}` }).click();
  await expect(visitor).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  const conversationUrl = visitor.url();
  await expect(visitor.getByRole("heading", { name: alpha().name, level: 1 })).toBeVisible();
  await expect(visitor.getByText("Messages arrive live.")).toBeVisible();

  const first = `Hello from the suite ${accounts.runId}`;
  await visitor.getByLabel(`Message ${alpha().name}`).fill(first);
  await visitor.keyboard.press("Enter");
  await expect(bubbles(visitor).filter({ hasText: first })).toBeVisible();

  // The company sees one unread conversation from the visitor, and one merged notification.
  const company = await signedIn(browser, alpha().email, "/company");
  await company.goto("/messages");
  const row = company
    .getByRole("list", { name: "Conversations" })
    .getByRole("link")
    .filter({ hasText: name });
  await expect(row).toContainText("1 unread");
  const { data: notes } = await adminClient()
    .from("notifications")
    .select("title")
    .eq("recipient_id", alpha().ownerId)
    .eq("type", "message_received");
  expect(notes?.map((n) => n.title)).toEqual([`New message from ${name}`]);

  // Opening it reads it: the visitor sees "Seen" without reloading.
  await row.click();
  await expect(bubbles(company).filter({ hasText: first })).toBeVisible();
  await expect(visitor.getByText("Seen", { exact: true })).toBeVisible();

  // The reply arrives on the visitor's open page, live.
  const reply = `Thanks for writing, ${accounts.runId}`;
  await company.getByLabel(`Message ${name}`).fill(reply);
  await company.getByRole("button", { name: "Send" }).click();
  await expect(bubbles(visitor).filter({ hasText: reply })).toBeVisible();

  // Starting again reuses the same conversation.
  await visitor.goto(`/companies/${alpha().slug}`);
  await visitor.getByRole("button", { name: `Message ${alpha().name}` }).click();
  await expect(visitor).toHaveURL(conversationUrl);

  await visitor.context().close();
  await company.context().close();
});

test("a company can't message itself from its own profile", async ({ browser }) => {
  const company = await signedIn(browser, alpha().email, "/company");
  await company.goto(`/companies/${alpha().slug}`);
  await expect(company.getByRole("button", { name: `Message ${alpha().name}` })).toHaveCount(0);
  await expect(company.getByRole("heading", { name: `Email ${alpha().name}` })).toHaveCount(0);
  await company.context().close();
});

test("the contact form reaches the company, in the app when email isn't set up", async ({ browser }) => {
  const name = await visitorName();
  const visitor = await signedIn(browser, accounts.visitor.email, "/account");
  await visitor.goto(`/companies/${beta().slug}`);
  const subject = `Pilot project ${accounts.runId}`;
  await visitor.getByLabel("Subject").fill(subject);
  await visitor.getByLabel("Message", { exact: true }).fill("Could we run a pilot together next month?");
  await visitor.getByRole("button", { name: "Send email" }).click();
  await expect(visitor.getByRole("status").filter({ hasText: /^Sent/ })).toBeVisible();

  const company = await signedIn(browser, beta().email, "/company");
  await company.getByRole("link", { name: "Contact form" }).click();
  await expect(company.getByText(subject)).toBeVisible();
  await expect(company.getByText(`From ${name}`)).toBeVisible();

  await visitor.context().close();
  await company.context().close();
});
