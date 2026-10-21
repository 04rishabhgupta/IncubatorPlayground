import { expect, test, type Page } from "@playwright/test";
import { floor1Geometry } from "../src/lib/floor/layouts/floor-1";
import { adminClient, login, PASSWORD, readAccounts } from "./support";

/**
 * Admin office placement. Runs before the public map tests, so it leaves the
 * floor exactly as global setup created it.
 */
const accounts = readAccounts();
const beta = () => accounts.placed[1];

test.describe.configure({ mode: "serial" });

let gamma: { ownerId: string; name: string };
let vacant: { id: string; code: string; label: string };

test.beforeAll(async () => {
  const admin = adminClient();
  const name = `Placement Gamma ${accounts.runId}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `sfc-e2e-gamma-${accounts.runId}@e2e-test.dev`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      account_type: "company",
      company: { name, industry_slug: "logistics", description: "Approved company waiting for an office." },
    },
  });
  if (error || !data.user) throw error;
  await admin.from("companies").update({ status: "approved" }).eq("owner_id", data.user.id);
  gamma = { ownerId: data.user.id, name };

  const [{ data: offices }, { data: taken }] = await Promise.all([
    admin.from("floor_spaces").select("id, code, label").eq("kind", "office").order("sort_order"),
    admin.from("companies").select("space_id").not("space_id", "is", null),
  ]);
  vacant = offices!.find((o) => !taken!.some((t) => t.space_id === o.id))!;
});

const officeOnMap = (page: Page, code: string) =>
  page.getByRole("group", { name: "Floor 1 floor plan" }).locator(`[data-space-code="${code}"]`);
const panel = (page: Page) => page.getByRole("complementary", { name: "Placement" });

async function lastOfficeNotification(ownerId: string) {
  const { data } = await adminClient()
    .from("notifications")
    .select("title, body")
    .eq("recipient_id", ownerId)
    .eq("type", "office_updated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function openTool(page: Page) {
  await login(page, accounts.admin.email);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "Floor layout" }).click();
  await expect(page.getByRole("heading", { name: "Floor layout · Floor 1" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Floor 1 floor plan" })).toHaveCSS("opacity", "1");
}

test("non-admins cannot open the floor tool", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await page.goto("/admin/floor");
  await expect(page).toHaveURL("/account");
});

test("admin assigns an approved company to a vacant office", async ({ page }) => {
  await openTool(page);
  await expect(panel(page).getByText(gamma.name)).toBeVisible(); // waiting for an office

  await officeOnMap(page, vacant.code).click();
  await expect(panel(page).getByRole("heading", { name: vacant.label })).toBeVisible();
  await panel(page).getByLabel("Assign company").selectOption({ label: gamma.name });
  await panel(page).getByRole("button", { name: "Assign to this office" }).click();
  await expect(panel(page).getByText(`${gamma.name} was assigned to ${vacant.label}.`)).toBeVisible();

  expect(await lastOfficeNotification(gamma.ownerId)).toMatchObject({
    title: "Your office has been assigned",
  });

  // Visible on the public map straight away.
  await page.goto("/");
  await expect(officeOnMap(page, vacant.code)).toHaveAccessibleName(new RegExp(gamma.name));
});

test("admin removes the company from the office", async ({ page }) => {
  await openTool(page);
  await officeOnMap(page, vacant.code).click();
  await panel(page).getByRole("button", { name: "Remove from office" }).click();
  await expect(panel(page).getByText(`${gamma.name} was removed from its office.`)).toBeVisible();
  expect(await lastOfficeNotification(gamma.ownerId)).toMatchObject({
    title: "Your office assignment was removed",
  });
  await expect(officeOnMap(page, vacant.code)).toHaveAccessibleName(/vacant office/);
});

test("admin moves a company only into vacant offices, then moves it back", async ({ page }) => {
  await openTool(page);
  await officeOnMap(page, beta().spaceCode).click();

  const moveTo = panel(page).getByLabel("Move to");
  const options = await moveTo.locator("option").allTextContents();
  expect(options).toContain(vacant.label);
  expect(options).not.toContain(accounts.placed[0].spaceLabel); // occupied by Alpha

  await moveTo.selectOption({ label: vacant.label });
  await panel(page).getByRole("button", { name: "Move company" }).click();
  await expect(panel(page).getByText(`${beta().name} moved to ${vacant.label}.`)).toBeVisible();
  expect(await lastOfficeNotification(beta().ownerId)).toMatchObject({ title: "Your office has changed" });

  // Move it back so the public map tests see the original layout.
  await officeOnMap(page, vacant.code).click();
  await panel(page).getByLabel("Move to").selectOption({ label: beta().spaceLabel });
  await panel(page).getByRole("button", { name: "Move company" }).click();
  await expect(panel(page).getByText(`${beta().name} moved to ${beta().spaceLabel}.`)).toBeVisible();
});

test("admin renames a space and sets its capacity", async ({ page }) => {
  await openTool(page);
  await officeOnMap(page, vacant.code).click();
  const name = panel(page).getByLabel("Name");
  await name.fill("");
  await panel(page).getByRole("button", { name: "Save details" }).click();
  await expect(panel(page).getByText("Enter a name.")).toBeVisible();

  await name.fill(`${vacant.label} (E2E)`);
  await panel(page).getByLabel("Capacity").fill("6");
  await panel(page).getByRole("button", { name: "Save details" }).click();
  await expect(panel(page).getByText("Space details saved.")).toBeVisible();
  await expect(officeOnMap(page, vacant.code)).toHaveAccessibleName(new RegExp(`${vacant.label} \\(E2E\\)`));

  // Restore the seed values.
  await adminClient().from("floor_spaces").update({ label: vacant.label, capacity: 12 }).eq("id", vacant.id);
});

test("admins can open the renderer preview; visitors cannot", async ({ page }) => {
  await openTool(page);
  await page.getByRole("link", { name: "Renderer preview" }).click();
  await expect(page.getByRole("heading", { name: "Floor renderer preview" })).toBeVisible();
  await expect(page.getByText("Sample data only")).toBeVisible();
  const map = page.getByRole("group", { name: "Sample floor floor plan" });
  await expect(map).toHaveCSS("opacity", "1");
  // The preview draws the real Floor 1 plan with sample companies.
  expect(await map.locator("[data-fixture]").count()).toBe(floor1Geometry.fixtures.length);
  expect(await map.locator("[data-door]").count()).toBe(floor1Geometry.doors.length);
  expect(await map.locator("[data-window]").count()).toBe(floor1Geometry.windows.length);
  // Rooms stay interactive above the furniture.
  await map.locator('[data-space-code="101"]').click();
  await expect(map.locator('[data-space-code="101"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /Furniture symbols \(26\)/ })).toBeVisible();

  const visitor = await page.context().browser()!.newPage();
  await login(visitor, accounts.visitor.email);
  await expect(visitor).toHaveURL("/account");
  await visitor.goto("/admin/floor/preview");
  await expect(visitor).toHaveURL("/account");
  await visitor.close();
});
