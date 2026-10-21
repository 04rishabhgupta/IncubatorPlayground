import { expect, test, type Page } from "@playwright/test";
import { adminClient, login, PASSWORD, readAccounts } from "./support";

/**
 * Phases 4R.4–4R.6 in the real app: floor settings, announcements, the FITT
 * team, startup profile, office requests, the layout editor and occupancy.
 * Everything created here carries the run id and is removed in afterAll (or by
 * global teardown, for accounts), so the shared project is left as it was.
 */
const accounts = readAccounts();
const alpha = () => accounts.placed[0];
const map = (page: Page) => page.getByRole("group", { name: "Floor 1 floor plan" });

test.describe.configure({ mode: "serial" });

/** Sign in as the admin and wait until the redirect lands, before navigating anywhere else. */
async function loginAsAdmin(page: Page) {
  await login(page, accounts.admin.email);
  await expect(page).toHaveURL("/admin");
}

/** An approved company without an office, created for this file (removed by global teardown). */
let startup: { ownerId: string; email: string; name: string; slug: string };

test.beforeAll(async () => {
  const admin = adminClient();
  const email = `sfc-e2e-startup-${accounts.runId}@e2e-test.dev`;
  const name = `E2E Startup ${accounts.runId}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      account_type: "company",
      full_name: "Sam E2E",
      company: { name, industry_slug: "saas", description: "Office request test company for the suite." },
    },
  });
  if (error || !data.user) throw new Error(`Could not create startup: ${error?.message}`);
  const { data: company } = await admin
    .from("companies")
    .update({ status: "approved" })
    .eq("owner_id", data.user.id)
    .select("slug")
    .single();
  startup = { ownerId: data.user.id, email, name, slug: company!.slug };
});

test.afterAll(async () => {
  const admin = adminClient();
  await admin.from("announcements").delete().like("title", `%${accounts.runId}%`);
  await admin.from("incubator_staff").delete().like("full_name", `%${accounts.runId}%`);
});

test("admin posts an announcement that visitors see above the map", async ({ page }) => {
  const title = `Demo day ${accounts.runId}`;
  await loginAsAdmin(page);
  await page.getByRole("link", { name: "Announcements" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Message").fill("Startups present in the boardroom.");
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByText("Announcement posted on the floor map.")).toBeVisible();

  const visitor = await page.context().newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("list", { name: "Announcements" }).getByText(title)).toBeVisible();

  // Ending it takes it off the map.
  const item = page.getByRole("listitem").filter({ hasText: title });
  await item.getByRole("button", { name: "End now" }).click();
  await expect(item.getByText("ended", { exact: true })).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByText(title)).toHaveCount(0);
  await visitor.close();
});

test("admin adds a FITT team member who is shown at reception", async ({ page }) => {
  const name = `Priya ${accounts.runId}`;
  await loginAsAdmin(page);
  await page.getByRole("link", { name: "FITT team" }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add to the FITT team" }) });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Role").fill("Programme manager");
  await form.getByLabel("Availability").selectOption("available");
  await form.getByRole("button", { name: "Add to the FITT team" }).click();
  await expect(page.getByText(`${name} added to the FITT team.`)).toBeVisible();

  await page.goto("/");
  await map(page)
    .getByRole("button", { name: /^Reception/ })
    .click();
  const panel = page.getByRole("complementary", { name: "Companies on this floor" });
  await expect(panel.getByRole("heading", { name: "FITT Incubation Team" })).toBeVisible();
  await expect(panel.getByText(name)).toBeVisible();
  await expect(panel.getByText("Programme manager")).toBeVisible();
});

test("a startup fills in its stage and tech stack and requests an office", async ({ page }) => {
  await login(page, startup.email);
  await expect(page).toHaveURL("/company");

  // Startup profile
  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.getByLabel("Stage").selectOption("mvp");
  await page.getByLabel("Team size").fill("6");
  await page.getByLabel("Tech stack").fill("Python, ROS");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();
  await page.goto(`/companies/${startup.slug}`);
  await expect(page.getByText("MVP")).toBeVisible();
  await expect(page.getByText("6 people")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "ROS" })).toBeVisible();

  // Office request
  await page.goto("/company");
  await expect(page.getByRole("heading", { name: "Request an office" })).toBeVisible();
  await page.getByLabel("Note for the admin").fill(`We are 6 people ${accounts.runId}`);
  await page.getByRole("button", { name: "Request office" }).click();
  await expect(page.getByText("Request sent. The platform admin will be in touch.")).toBeVisible();
  await expect(page.getByText("any office")).toBeVisible();
  await expect(page.getByText(`“We are 6 people ${accounts.runId}”`)).toBeVisible();

  // Every label points at its own field: no id is used twice on the dashboard.
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(duplicates).toEqual([]);
});

test("admin sees the request in the placement tool and closes it; the company is told", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/floor");
  const panel = page.getByRole("complementary", { name: "Placement" });
  const entry = panel.getByRole("listitem").filter({ hasText: startup.name });
  await expect(entry.getByText("Requested any office")).toBeVisible();
  await expect(entry.getByText(`We are 6 people ${accounts.runId}`)).toBeVisible();
  await entry.getByRole("button", { name: "Close request" }).click();
  await expect(panel.getByText("Request closed. The company has been notified.")).toBeVisible();

  const { data } = await adminClient()
    .from("notifications")
    .select("type")
    .eq("recipient_id", startup.ownerId)
    .eq("type", "office_request_closed");
  expect(data).toHaveLength(1);
});

test("admin opens the layout editor without changing the live layout", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/floor");
  await page.getByRole("link", { name: "Edit layout" }).click();
  await expect(page.getByRole("heading", { name: "Layout editor · Floor 1" })).toBeVisible();
  await expect(page.getByText("No problems found.")).toBeVisible();
  const save = page.getByRole("button", { name: "Save layout" });
  await expect(save).toBeDisabled();

  // A syntax error is pointed out and blocks saving; nothing is saved.
  const editor = page.getByLabel(/Layout JSON/);
  const text = await editor.inputValue();
  await editor.fill(text.replace(/"width": (\d+)/, '"width": ,'));
  await expect(page.getByRole("button", { name: /^line 2, column \d+$/ })).toBeVisible();
  await expect(save).toBeDisabled();
  // Discarding asks first, because it throws away the edits.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Replace your unsaved changes");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByText("No problems found.")).toBeVisible();
});

test("admin sees occupancy per floor, and floor settings open and close cleanly", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("link", { name: "Occupancy" }).click();
  await expect(page.getByRole("heading", { name: "Occupancy", level: 1 })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: alpha().name });
  await expect(row).toContainText(alpha().spaceCode);

  await page.goto("/admin/floor");
  const opener = page.getByRole("button", { name: "Floor settings" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: /Floor settings/ });
  await expect(dialog.getByLabel("Floor is active and visible on the public map")).toBeChecked();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("the building overview lists floors and closes with Escape", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "View building overview" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Floor 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Currently viewing")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
