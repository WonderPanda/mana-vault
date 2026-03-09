import { test, expect } from "./fixtures";

test.describe("Authentication", () => {
  test("signup form renders with required fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("can toggle between signup and signin forms", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await page.getByRole("link", { name: /sign up/i }).click();
    await page.waitForURL("**/signup");
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();

    await page.getByRole("link", { name: /sign in/i }).click();
    await page.waitForURL("**/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("can sign in with seeded account", async ({ authedPage }) => {
    // authedPage fixture handles login and waits for /cards
    await expect(authedPage).toHaveURL(/\/cards/);
  });
});
