import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, readAccounts } from "./support";

/**
 * Phase 8 accessibility and responsive pass. Every key page is checked with
 * axe-core (WCAG 2.1 A/AA rules) and for horizontal scrolling. Tests tagged
 * @mobile also run on the phone project (Pixel 7).
 */
const accounts = readAccounts();

// Each test audits several pages.
test.describe.configure({ timeout: 120_000 });
const alpha = () => accounts.placed[0];

async function audit(page: Page, path: string) {
  await page.goto(path);
  // Pages with live updates keep a connection open; don't wait on it forever.
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const problems = results.violations.map(
    (v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0]?.target.join(" ")})`,
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { problems, overflow };
}

const publicPages = () => [
  "/",
  "/directory",
  `/companies/${alpha().slug}`,
  "/login",
  "/register",
  "/register/company",
  "/forgot-password",
];

test("public pages pass the accessibility checks and fit the screen @mobile", async ({ page }) => {
  const report: string[] = [];
  for (const path of publicPages()) {
    const { problems, overflow } = await audit(page, path);
    report.push(...problems.map((p) => `${path}: ${p}`));
    if (overflow > 0) report.push(`${path}: scrolls sideways by ${overflow}px`);
  }
  expect(report, report.join("\n")).toEqual([]);
});

const signedInPages: Array<[string, () => string, string[]]> = [
  [
    "visitor",
    () => accounts.visitor.email,
    ["/account", "/account/appointments", "/messages", "/notifications", "/settings"],
  ],
  [
    "company",
    () => alpha().email,
    [
      "/company",
      "/company/profile",
      "/company/team",
      "/company/appointments",
      "/company/contact",
      "/messages",
    ],
  ],
  [
    "admin",
    () => accounts.admin.email,
    [
      "/admin",
      "/admin/companies",
      "/admin/floor",
      "/admin/floor/editor",
      "/admin/occupancy",
      "/admin/users",
      "/admin/announcements",
      "/admin/fitt-team",
      "/admin/appointments",
    ],
  ],
];

for (const [role, email, paths] of signedInPages) {
  test(`${role} pages pass the accessibility checks and fit the screen @mobile`, async ({ page }) => {
    await login(page, email());
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    const report: string[] = [];
    for (const path of paths) {
      const { problems, overflow } = await audit(page, path);
      report.push(...problems.map((p) => `${path}: ${p}`));
      if (overflow > 0) report.push(`${path}: scrolls sideways by ${overflow}px`);
    }
    expect(report, report.join("\n")).toEqual([]);
  });
}
