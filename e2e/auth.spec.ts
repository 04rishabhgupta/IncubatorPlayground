import { expect, test } from "@playwright/test";
import { login, readAccounts, signOut } from "./support";

const accounts = readAccounts();

test.describe("guest", () => {
  test("sees sign-in and register links @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  });

  test("can open the directory from the header @mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Directory" }).click();
    await expect(page.getByRole("heading", { name: "Company directory" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search companies by name" })).toBeVisible();
    // No horizontal scrolling on small screens.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const path of ["/account", "/company", "/admin", "/settings"]) {
    test(`is sent to login from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    });
  }

  test("gets a generic error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(accounts.visitor.email);
    await page.getByLabel("Password").fill("Wrong-Passw0rd");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Incorrect email or password.",
    );
    await expect(page.getByLabel("Email")).toHaveValue(accounts.visitor.email);
  });
});

test.describe("visitor", () => {
  test("signs in to their account and cannot open other dashboards", async ({ page }) => {
    await login(page, accounts.visitor.email);
    await expect(page).toHaveURL("/account");
    await expect(page.getByRole("heading", { name: "Hi, Vera" })).toBeVisible();
    await expect(page.getByRole("link", { name: "My account" })).toBeVisible();

    await page.goto("/company");
    await expect(page).toHaveURL("/account");
    await page.goto("/admin");
    await expect(page).toHaveURL("/account");
    await page.goto("/login");
    await expect(page).toHaveURL("/account");
  });

  test("returns to the requested page after login, but never off-site", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Email").fill(accounts.visitor.email);
    await page.getByLabel("Password").fill("E2eTest-Passw0rd");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/settings");
    await signOut(page);

    await login(page, accounts.visitor.email, "/login?next=https://evil.example/steal");
    await expect(page).toHaveURL("/account");
  });

  test("updates their profile and signs out @mobile", async ({ page }) => {
    await login(page, accounts.visitor.email);
    await expect(page).toHaveURL("/account");
    await page.goto("/settings");

    await page.getByLabel("Full name").fill("x");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();

    await page.getByLabel("Full name").fill("Vera Updated");
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Vera Updated");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98765 43210");

    await signOut(page);
    await page.goto("/account");
    await expect(page).toHaveURL("/login?next=%2Faccount");
  });

  test("password change enforces the policy", async ({ page }) => {
    await login(page, accounts.visitor.email);
    await expect(page).toHaveURL("/account");
    await page.goto("/settings/password");
    await page.getByLabel("New password").fill("weakpass");
    await page.getByLabel("Confirm password").fill("weakpass");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Include an uppercase letter.")).toBeVisible();
  });
});

test.describe("company account", () => {
  test("sees its pending registration", async ({ page }) => {
    await login(page, accounts.company.email);
    await expect(page).toHaveURL("/company");
    await expect(page.getByRole("heading", { name: accounts.company.companyName })).toBeVisible();
    await expect(page.getByText("Pending review")).toBeVisible();
    await expect(page.getByText("Your registration is under review")).toBeVisible();
    await expect(page.getByText("Deep Tech & Hardware")).toBeVisible();
    await expect(page.getByText("Requested: Office 101 please")).toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL("/company");
  });
});

test.describe("super admin", () => {
  test("sees platform stats and the pending company", async ({ page }) => {
    await login(page, accounts.admin.email);
    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
    await expect(page.getByText("Pending registrations")).toBeVisible();
    await expect(page.getByText(accounts.company.companyName)).toBeVisible();
  });
});
