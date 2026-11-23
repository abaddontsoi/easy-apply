import { expect, test } from "@playwright/test";

test("shows the setup screen when Supabase is unset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "函箋" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "先接上 Supabase" })).toBeVisible();
  await expect(page.getByText("Grok 尚未連接")).toBeVisible();
  await expect(page.getByText("Gemini 尚未連接")).toBeVisible();
  await expect(page.getByRole("heading", { name: "登入" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撰寫並儲存" })).toHaveCount(0);
});
