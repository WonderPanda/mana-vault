import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ authedPage: typeof base }>({
  authedPage: async ({ page }, use) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("jesse@thecarters.cloud");
    await page.getByLabel("Password").fill("Password1!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/cards");
    await use(page as any);
  },
});

export { expect };
