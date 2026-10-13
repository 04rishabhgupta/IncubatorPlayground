import { expect, test, type Page } from "@playwright/test";
import { adminClient, login, PASSWORD, readAccounts } from "./support";

/**
 * Phase 5: company availability, team records and live updates. Uses its own
 * company ("Delta") placed in a vacant office, and frees the office afterwards
 * so later specs see the floor as global setup left it.
 */
const accounts = readAccounts();
test.describe.configure({ mode: "serial" });

let delta: { email: string; name: string; slug: string; companyId: string; spaceCode: string };

test.beforeAll(async () => {
  const admin = adminClient();
  const name = `Team Delta ${accounts.runId}`;
  const email = `sfc-e2e-delta-${accounts.runId}@e2e-test.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      account_type: "company",
      company: {
        name,
        industry_slug: "education",
        description: "Availability test company for the E2E suite.",
      },
    },
  });
  if (error || !data.user) throw error;

  const [{ data: offices }, { data: taken }] = await Promise.all([
    admin.from("floor_spaces").select("id, code, floor_id").eq("kind", "office").order("sort_order"),
    admin.from("companies").select("space_id").not("space_id", "is", null),
  ]);
  const office = offices!.find((o) => !taken!.some((t) => t.space_id === o.id))!;
  const { data: company } = await admin
    .from("companies")
    .update({ status: "approved", floor_id: office.floor_id, space_id: office.id })
    .eq("owner_id", data.user.id)
    .select("id, slug")
    .single();
  delta = { email, name, slug: company!.slug, companyId: company!.id, spaceCode: office.code };
});

test.afterAll(async () => {
  await adminClient().from("companies").update({ space_id: null, floor_id: null }).eq("id", delta.companyId);
});

async function asDelta(page: Page, path = "/company") {
  await login(page, delta.email);
  await expect(page).toHaveURL("/company");
  if (path !== "/company") await page.goto(path);
}

test("a company sets its availability and note, shown publicly with the update time", async ({ page }) => {
  await asDelta(page);
  await expect(page.getByText("Not set — visitors see Unknown.")).toBeVisible();

  await page.getByRole("radio", { name: "Busy" }).check({ force: true });
  await page.getByLabel("Note for visitors").fill("In a workshop until 3 pm");
  await page.getByRole("button", { name: "Update availability" }).click();
  await expect(page.getByText("Availability updated.")).toBeVisible();
  await expect(page.getByText(/^Last updated /)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Busy" })).toBeChecked();

  await page.goto(`/companies/${delta.slug}`);
  await expect(page.getByText("Busy").first()).toBeVisible();
  await expect(page.getByText(/updated \d/)).toBeVisible();
  await expect(page.getByText("In a workshop until 3 pm")).toBeVisible();
});

test("choosing Unknown clears the status", async ({ page }) => {
  await asDelta(page);
  await page.getByRole("radio", { name: "Unknown" }).check({ force: true });
  await page.getByRole("button", { name: "Update availability" }).click();
  await expect(page.getByText("Availability cleared.")).toBeVisible();

  await page.goto(`/companies/${delta.slug}`);
  await expect(page.getByText("Unknown").first()).toBeVisible();
  await expect(page.getByText("In a workshop until 3 pm")).toHaveCount(0);
});

test("the company manages team records, including hidden members", async ({ page }) => {
  await asDelta(page, "/company/team");
  const add = page.getByRole("region").or(page.locator("form")).filter({ hasText: "Add team member" }).last();

  await add.getByLabel("Full name").fill("Meera Iyer");
  await add.getByLabel("Role or job title").fill("Founder");
  await add.getByLabel("Public contact email").fill("not-an-email");
  await add.getByRole("button", { name: "Add team member" }).click();
  await expect(add.getByText("Enter a valid email address.")).toBeVisible();

  await add.getByLabel("Public contact email").fill("meera@delta.dev");
  await add.getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByText("Meera Iyer added to the team.")).toBeVisible();

  await add.getByLabel("Full name").fill("Hari Hidden");
  await add.getByLabel("Show on public profile").uncheck();
  await add.getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByText("Hari Hidden added to the team.")).toBeVisible();

  const list = page.getByRole("list").filter({ has: page.getByRole("listitem", { name: "Meera Iyer" }) });
  await expect(
    list.getByRole("listitem", { name: "Hari Hidden" }).getByText("Hidden from public"),
  ).toBeVisible();

  await page.goto(`/companies/${delta.slug}`);
  await expect(page.getByText("Meera Iyer")).toBeVisible();
  await expect(page.getByRole("link", { name: "meera@delta.dev" })).toHaveAttribute(
    "href",
    "mailto:meera@delta.dev",
  );
  await expect(page.getByText("Hari Hidden")).toHaveCount(0);
});

test("team member availability, editing, ordering and removal", async ({ page }) => {
  await asDelta(page, "/company/team");
  const meera = page.getByRole("listitem", { name: "Meera Iyer" });
  await expect(meera.getByText("Not set")).toBeVisible();
  await meera.getByLabel("Availability of Meera Iyer").selectOption("available");
  await expect(meera.getByText(/^Updated /)).toBeVisible();

  await meera.getByRole("button", { name: "Edit" }).click();
  await meera.getByLabel("Role or job title").fill("CEO & Founder");
  await meera.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("listitem", { name: "Meera Iyer" }).getByText("CEO & Founder")).toBeVisible();

  // Hari was added second; move him above Meera.
  await page.getByRole("button", { name: "Move Hari Hidden up" }).click();
  await expect(page.getByRole("listitem").first()).toHaveAccessibleName("Hari Hidden");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("listitem", { name: "Hari Hidden" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("listitem", { name: "Hari Hidden" })).toHaveCount(0);

  await page.goto(`/companies/${delta.slug}`);
  await expect(page.getByText("CEO & Founder")).toBeVisible();
  await expect(page.getByText("Available").first()).toBeVisible();
});

test("availability changes reach an open floor map without reloading", async ({ page, browser }) => {
  const visitorContext = await browser.newContext();
  const guest = await visitorContext.newPage();
  await guest.goto("/");
  const office = guest
    .getByRole("group", { name: "Floor 1 floor plan" })
    .locator(`[data-space-code="${delta.spaceCode}"]`);
  await expect(office).toHaveAccessibleName(new RegExp(`${delta.name}, Education, Availability unknown`));
  await guest.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await guest.waitForTimeout(1500); // let the Realtime subscription connect

  await asDelta(page);
  await page.getByRole("radio", { name: "Unavailable" }).check({ force: true });
  await page.getByRole("button", { name: "Update availability" }).click();
  await expect(page.getByText("Availability updated.")).toBeVisible();

  await expect(office).toHaveAccessibleName(new RegExp(`${delta.name}.*Unavailable`), { timeout: 15_000 });
  expect(await guest.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await visitorContext.close();
});

test("other accounts cannot change this company's availability", async ({ page }) => {
  await login(page, accounts.placed[0].email);
  await expect(page).toHaveURL("/company");
  // Alpha's own dashboard only ever targets Alpha's company; the team page lists Alpha's team.
  await page.goto("/company/team");
  await expect(page.getByText("Meera Iyer")).toHaveCount(0);
});
