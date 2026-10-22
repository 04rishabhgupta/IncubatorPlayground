import { expect, test } from "@playwright/test";
import { login, readAccounts } from "./support";

/** Phase 8: admin user management. Changes only the run's own test accounts, and puts them back. */
const accounts = readAccounts();

test("admin finds users, promotes a visitor to admin and back; company accounts stay companies", async ({
  page,
}) => {
  await login(page, accounts.admin.email);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill(accounts.visitor.email);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("1 user match")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: accounts.visitor.email });

  page.on("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(row.getByText(`${accounts.visitor.email} is now a platform admin.`)).toBeVisible();
  await expect(row.getByText("Super admin")).toBeVisible();
  await row.getByRole("button", { name: "Remove admin" }).click();
  await expect(row.getByText(`${accounts.visitor.email} is now a visitor account.`)).toBeVisible();

  await search.fill(alpha());
  await page.getByRole("button", { name: "Search" }).click();
  const companyRow = page.getByRole("row").filter({ hasText: accounts.placed[0].email });
  await expect(companyRow.getByText("Company account")).toBeVisible();
  await expect(companyRow.getByRole("button")).toHaveCount(0);

  // Admins can't change themselves.
  await search.fill(accounts.admin.email);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: accounts.admin.email }).getByText("You"),
  ).toBeVisible();
});

function alpha() {
  return accounts.placed[0].email;
}
