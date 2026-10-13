import { expect, test } from "@playwright/test";
import { adminClient, readAccounts } from "./support";

const accounts = readAccounts();

/**
 * Successful sign-ups send a confirmation email, so these tests cover
 * validation and the duplicate-email path (which sends nothing). A fresh
 * sign-up through the UI needs a configured email provider and is part of the
 * manual test checklist.
 */
test.describe("visitor registration", () => {
  test("validates input and keeps non-secret values @mobile", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Nina New");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("Abcdefg1");
    await page.getByLabel("Confirm password").fill("Abcdefg2");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Nina New");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("does not reveal whether an email is already registered", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(accounts.visitor.email);
    await page.getByLabel("Password", { exact: true }).fill("Another-Passw0rd");
    await page.getByLabel("Confirm password").fill("Another-Passw0rd");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/check-email");
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });
});

test.describe("company registration", () => {
  test("lists industries and validates every section", async ({ page }) => {
    await page.goto("/register/company");
    const industry = page.getByLabel("Industry");
    await expect(industry.locator("option")).toHaveCount(12); // placeholder + 11 industries

    await page.getByLabel("Representative's full name").fill("Rita Rep");
    await page.getByLabel("Business email").fill("rita@startup.dev");
    await page.getByLabel("Password", { exact: true }).fill("Abcdefg1");
    await page.getByLabel("Confirm password").fill("Abcdefg1");
    await page.getByLabel("Company name").fill("Nimbus Labs");
    await industry.selectOption("saas");
    await page.getByLabel("Description").fill("Too short");
    await page.getByLabel("Website").fill("nimbus.dev");
    await page.getByLabel("Founded year").fill("1700");
    await page.getByRole("button", { name: "Submit registration" }).click();

    await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeFocused(); // first invalid field
    await expect(page.getByText("Describe the company in at least 20 characters.")).toBeVisible();
    await expect(page.getByText("Enter a full URL starting with https://")).toBeVisible();
    await expect(page.getByText(/Enter a year between 1800/)).toBeVisible();
    await expect(page.getByLabel("Company name")).toHaveValue("Nimbus Labs");
    await expect(industry).toHaveValue("saas");
  });

  test("rejects a disguised logo file before creating anything", async ({ page }) => {
    await page.goto("/register/company");
    const email = `sfc-e2e-logo-${accounts.runId}@e2e-test.dev`;
    await page.getByLabel("Representative's full name").fill("Lara Logo");
    await page.getByLabel("Business email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Abcdefg1");
    await page.getByLabel("Confirm password").fill("Abcdefg1");
    await page.getByLabel("Company name").fill("Logo Test Co");
    await page.getByLabel("Industry").selectOption("saas");
    await page.getByLabel("Description").fill("A company that tests logo validation thoroughly.");
    await page.getByLabel("Logo").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await page.getByRole("button", { name: "Submit registration" }).click();
    await expect(page.getByText("Upload a PNG, JPEG or WebP image.")).toBeVisible();

    const { data } = await adminClient().from("profiles").select("id").eq("email", email);
    expect(data).toEqual([]);
  });
});
