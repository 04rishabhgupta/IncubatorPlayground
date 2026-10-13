import { expect, test, type Page } from "@playwright/test";
import { readAccounts } from "./support";

/** Interactive floor map on the homepage (stage 3: selection, keyboard, zoom/pan). */
const accounts = readAccounts();
const alpha = () => accounts.placed[0];
const beta = () => accounts.placed[1];

const map = (page: Page) => page.getByRole("group", { name: "Floor 1 floor plan" });
const office = (page: Page, code: string) => map(page).locator(`[data-space-code="${code}"]`);
const panel = (page: Page) => page.getByRole("complementary", { name: "Companies on this floor" });

async function viewBox(page: Page) {
  const value = await map(page).getAttribute("viewBox");
  const [x, y, width, height] = value!.split(" ").map(Number);
  return { x, y, width, height };
}

async function openMap(page: Page, path = "/") {
  await page.goto(path);
  await expect(map(page)).toBeVisible();
  await expect(map(page)).toHaveCSS("opacity", "1"); // fitted to the container
}

test("renders the floor with placed companies, vacant offices and shared rooms", async ({ page }) => {
  await openMap(page);
  await expect(page.getByRole("heading", { name: "Floor 1", level: 1 })).toBeVisible();
  await expect(
    map(page).getByRole("button", { name: new RegExp(`${alpha().name}.*Available`) }),
  ).toBeVisible();
  await expect(map(page).getByRole("button", { name: new RegExp(`${beta().name}.*Busy`) })).toBeVisible();
  await expect(map(page).getByRole("button", { name: /Boardroom, seats 10/ })).toBeVisible();
  await expect(
    map(page)
      .getByRole("button", { name: /vacant office/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Availability legend" })).toBeVisible();
});

test("clicking an office shows its company and updates the URL", async ({ page }) => {
  await openMap(page);
  await office(page, alpha().spaceCode).click();
  await expect(page).toHaveURL(`/?company=${alpha().slug}`);
  await expect(office(page, alpha().spaceCode)).toHaveAttribute("aria-pressed", "true");

  const details = panel(page);
  await expect(details.getByRole("heading", { name: alpha().name })).toBeVisible();
  await expect(details.getByText("Asha Rao")).toBeVisible();
  await expect(details.getByText("Kiran Das")).toBeVisible();
  await expect(details.getByText("Unknown")).toBeVisible(); // Kiran's availability was never set
  await expect(details.getByRole("link", { name: "View full profile" })).toHaveAttribute(
    "href",
    `/companies/${alpha().slug}`,
  );

  // The map zoomed in towards the selection.
  expect((await viewBox(page)).width).toBeLessThan(1200);

  // Back button clears the selection without a page reload.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(details.getByRole("heading", { name: "Companies on Floor 1" })).toBeVisible();
});

test("deep links open the selected company", async ({ page }) => {
  await openMap(page, `/?company=${beta().slug}`);
  await expect(panel(page).getByRole("heading", { name: beta().name })).toBeVisible();
  await expect(office(page, beta().spaceCode)).toHaveAttribute("data-selected", "true");
});

test("vacant offices and rooms show space details", async ({ page }) => {
  await openMap(page);
  await map(page)
    .getByRole("button", { name: /Boardroom/ })
    .click();
  await expect(page).toHaveURL("/?space=BR-1");
  await expect(panel(page).getByRole("heading", { name: "Boardroom" })).toBeVisible();
  await expect(panel(page).getByText("Meeting room · seats 10")).toBeVisible();

  // Selecting the boardroom zoomed in; zoom back out so the other offices are visible.
  await page.getByRole("button", { name: "Show whole floor" }).click();
  await expect(page.getByRole("button", { name: "Show whole floor" })).toBeDisabled();
  await map(page)
    .getByRole("button", { name: /vacant office/ })
    .first()
    .click();
  await expect(panel(page).getByText("This office is currently vacant.", { exact: false })).toBeVisible();
});

test("works with the keyboard", async ({ page }) => {
  await openMap(page);
  const fit = await viewBox(page);
  await office(page, alpha().spaceCode).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/?company=${alpha().slug}`);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/");

  const before = await viewBox(page);
  await office(page, beta().spaceCode).focus();
  await page.keyboard.press("+");
  await expect.poll(async () => (await viewBox(page)).width).toBeLessThan(before.width);
  await page.keyboard.press("0");
  await expect.poll(async () => (await viewBox(page)).width).toBeCloseTo(fit.width, 0);
});

test("list and map stay in sync, and search dims non-matching offices", async ({ page }) => {
  await openMap(page);
  const list = panel(page);
  await list.getByRole("searchbox", { name: "Search companies on this floor" }).fill("Map Beta");
  await expect(list.getByRole("button", { name: new RegExp(beta().name) })).toBeVisible();
  await expect(list.getByRole("button", { name: new RegExp(alpha().name) })).toHaveCount(0);
  await expect(office(page, alpha().spaceCode)).toHaveAttribute("data-dimmed", "true");
  await expect(office(page, beta().spaceCode)).not.toHaveAttribute("data-dimmed", "true");

  await list.getByRole("button", { name: new RegExp(beta().name) }).click();
  await expect(page).toHaveURL(`/?company=${beta().slug}`);
  await expect(office(page, beta().spaceCode)).toHaveAttribute("aria-pressed", "true");

  await list.getByRole("button", { name: "All companies" }).click();
  await list.getByRole("searchbox", { name: "Search companies on this floor" }).fill("");
  await list.getByLabel("Filter by industry").selectOption("artificial-intelligence");
  await expect(list.getByRole("button", { name: new RegExp(alpha().name) })).toBeVisible();
  await expect(office(page, beta().spaceCode)).toHaveAttribute("data-dimmed", "true");
});

test("zoom buttons, wheel and drag move the view without selecting anything", async ({ page }) => {
  await openMap(page);
  const fit = await viewBox(page);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => (await viewBox(page)).width).toBeLessThan(fit.width);
  await page.getByRole("button", { name: "Show whole floor" }).click();
  await expect.poll(async () => (await viewBox(page)).width).toBeCloseTo(fit.width, 0);

  const box = (await map(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await viewBox(page)).width).toBeLessThan(fit.width);

  // Dragging (even when it starts on a room) pans the map and selects nothing.
  const zoomed = await viewBox(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 150, start.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await viewBox(page)).x).not.toBeCloseTo(zoomed.x, 0);
  await expect(page).toHaveURL("/");
});

test("is usable on a phone @mobile", async ({ page }) => {
  await openMap(page);
  await office(page, alpha().spaceCode).click();
  await expect(panel(page).getByRole("heading", { name: alpha().name })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the directory and profiles still work alongside the map", async ({ page }) => {
  await page.goto(`/directory?q=${encodeURIComponent(alpha().name)}`);
  await expect(page.getByText("1 company match your search")).toBeVisible();
  await page.goto(`/companies/${alpha().slug}`);
  await expect(page.getByRole("heading", { name: alpha().name })).toBeVisible();
  await expect(page.getByText(`Floor 1 · ${alpha().spaceLabel}`)).toBeVisible();

  await page.getByRole("link", { name: "View on floor map" }).click();
  await expect(page).toHaveURL(`/?company=${alpha().slug}`);
  await expect(panel(page).getByRole("heading", { name: alpha().name })).toBeVisible();
  await expect(office(page, alpha().spaceCode)).toHaveAttribute("aria-pressed", "true");
});
