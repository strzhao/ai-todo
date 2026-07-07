import { test, expect } from "@playwright/test";

test("homepage loads and shows title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Todo/);
  await page.screenshot({ path: "test-results/homepage.png" });
});
