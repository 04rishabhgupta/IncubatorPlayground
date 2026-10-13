import { expect, test, type Page } from "@playwright/test";
import { login, readAccounts } from "./support";

/**
 * Full company lifecycle, in order:
 * pending (hidden) → rejected → resubmitted → approved (listed) → edited →
 * suspended (hidden) → reinstated.
 */
const accounts = readAccounts();

// 1×1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "serial" });

async function openReview(page: Page, status: string) {
  await login(page, accounts.admin.email);
  await expect(page).toHaveURL("/admin");
  await page.goto(`/admin/companies?status=${status}`);
  await page.getByRole("link", { name: new RegExp(accounts.company.companyName) }).click();
  await expect(page.getByRole("heading", { name: accounts.company.companyName })).toBeVisible();
}

async function searchDirectory(page: Page, query: string) {
  await page.goto(`/directory?q=${encodeURIComponent(query)}`);
  await expect(page.getByRole("heading", { name: "Company directory" })).toBeVisible();
}

test("a pending company is not listed publicly", async ({ page }) => {
  await searchDirectory(page, accounts.company.companyName);
  await expect(page.getByText("No companies match your search.")).toBeVisible();
});

test("admin must give a reason to reject, then rejects", async ({ page }) => {
  await openReview(page, "pending");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Give the company a reason")).toBeVisible();

  await page.getByLabel(/Reason/).fill("Please add your website and a longer description.");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Registration rejected.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Note: Please add your website and a longer description.", { exact: true }),
  ).toBeVisible();
});

test("the company is notified, edits its profile and resubmits", async ({ page }) => {
  await login(page, accounts.company.email);
  await expect(page).toHaveURL("/company");
  await expect(page.getByRole("link", { name: /Notifications, 1 unread/ })).toBeVisible();
  await expect(page.getByText("Admin note: Please add your website")).toBeVisible();

  await page.goto("/company/profile");
  await page.getByLabel("Website").fill("https://e2e-robotics.dev");
  await page.getByLabel("Services").fill("Lab automation\nRobot arms\nLab automation");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();

  await page.goto("/company");
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Your registration is under review")).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByText("Your company registration was not approved")).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
});

test("admin sees the history and approves", async ({ page }) => {
  await openReview(page, "pending");
  await expect(page.getByText(/Resubmission · awaiting review/i)).toBeVisible();
  await expect(page.getByText(/Initial registration · rejected/i)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Company approved.")).toBeVisible();
});

test("the approved company is searchable, filterable and has a public profile", async ({ page }) => {
  await searchDirectory(page, accounts.company.companyName);
  await expect(page.getByText("1 company match your search")).toBeVisible();

  await page.getByLabel("Filter by industry").selectOption("saas");
  await expect(page.getByText("No companies match your search.")).toBeVisible();
  await page.getByLabel("Filter by industry").selectOption("deep-tech-hardware");
  const card = page.getByRole("link", { name: new RegExp(accounts.company.companyName) });
  await expect(card).toBeVisible();
  await expect(card.getByText("Unknown")).toBeVisible(); // availability never set

  await card.click();
  await expect(page.getByRole("heading", { name: accounts.company.companyName })).toBeVisible();
  await expect(page.getByText("Robot arms")).toBeVisible();
  await expect(page.getByRole("link", { name: "e2e-robotics.dev" })).toHaveAttribute(
    "href",
    "https://e2e-robotics.dev",
  );
  await expect(page.getByText("Not assigned yet")).toBeVisible();
  // Deduplicated services
  await expect(page.getByText("Lab automation")).toHaveCount(1);
});

test("search treats wildcard characters literally", async ({ page }) => {
  await searchDirectory(page, "%");
  await expect(page.getByRole("link", { name: new RegExp(accounts.company.companyName) })).toHaveCount(0);
});

test("the company uploads a logo that appears publicly", async ({ page }) => {
  await login(page, accounts.company.email);
  await expect(page).toHaveURL("/company");
  await page.goto("/company/profile");
  await page
    .getByLabel("Upload a new logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByText("Logo updated.")).toBeVisible();

  await searchDirectory(page, accounts.company.companyName);
  await expect(page.getByRole("img", { name: `${accounts.company.companyName} logo` })).toBeVisible();
});

test("a suspended company disappears and returns when reinstated", async ({ page, browser }) => {
  await openReview(page, "approved");
  await page.getByLabel(/Reason/).fill("Office lease under review.");
  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Company suspended.")).toBeVisible();

  const guest = await browser.newPage();
  await searchDirectory(guest, accounts.company.companyName);
  await expect(guest.getByText("No companies match your search.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Reinstate" }).click();
  await expect(page.getByText("Company reinstated.")).toBeVisible();

  await searchDirectory(guest, accounts.company.companyName);
  await expect(guest.getByText("1 company match your search")).toBeVisible();
  await guest.close();
});

test("visitors and companies cannot open admin review pages", async ({ page }) => {
  await login(page, accounts.visitor.email);
  await expect(page).toHaveURL("/account");
  await page.goto("/admin/companies");
  await expect(page).toHaveURL("/account");
});
