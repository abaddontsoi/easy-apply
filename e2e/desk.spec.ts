import { expect, test } from "@playwright/test";

test("writes a structured draft on the signed-in desk", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("函箋").first()).toBeVisible();
  await expect(page.getByText("writer@example.com")).toBeVisible();
  await expect(page.getByText("存進 Supabase 的信會列在這裡。")).toBeVisible();

  await page.getByRole("navigation", { name: "主要" }).getByRole("link", { name: "設定", exact: true }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "載入範例", exact: true }).click();
  await expect(page.getByLabel("履歷文字")).toHaveValue(/Chloe Chan/);
  await expect(page.getByText("範例文字會存進 Supabase")).toBeVisible();
  await page.getByRole("navigation", { name: "主要" }).getByRole("link", { name: "寫作新信件", exact: true }).click();
  await expect(page.getByRole("heading", { name: "寫作新信件", exact: true })).toBeVisible();
  await expect(page.getByText("Chloe Chan").first()).toBeVisible();
  await page.getByRole("button", { name: "載入範例", exact: true }).click();
  await expect(page.getByLabel("職缺說明")).toContainText("Kubernetes");

  await page.getByRole("button", { name: "撰寫並儲存" }).click();
  await expect(page.getByText("結構草稿", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未連接 Grok")).toBeVisible();
  await expect(page.getByRole("button", { name: "按指示改寫" })).toBeDisabled();

  const letter = page.locator("#letter");
  await expect(letter).toContainText("1,200 teams");
  await expect(letter).not.toContainText(/kubernetes/i);
  await expect(
    page.getByText("Kubernetes experience running production clusters", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Operations Manager/ })).toBeVisible();
});
