import { expect, test } from "@playwright/test";

test("writes a structured draft on the signed-in desk", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "函箋" })).toBeVisible();
  await expect(page.getByText("writer@example.com")).toBeVisible();
  await expect(page.getByText("存進 Supabase 的信會列在這裡。")).toBeVisible();

  await page.getByRole("button", { name: "載入範例" }).click();
  await expect(page.getByLabel("履歷")).toContainText("Chloe Chan");
  await expect(page.getByLabel("職缺說明")).toContainText("Kubernetes");

  await page.getByRole("button", { name: "撰寫並儲存" }).click();
  await expect(page.getByText("結構草稿", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未連接 Grok")).toBeVisible();

  const letter = page.locator("#letter");
  await expect(letter).toContainText("1,200 teams");
  await expect(letter).not.toContainText(/kubernetes/i);
  await expect(
    page.getByText("Kubernetes experience running production clusters", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Operations Manager/ })).toBeVisible();
});
