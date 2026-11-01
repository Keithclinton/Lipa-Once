import { expect, test } from "@playwright/test";

// Assumes a seeded database (npm run db:seed).

test("landing page leads to the demo invoices", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pay the bill");
  await page.getByRole("link", { name: "Try the demo invoices" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("button", { name: "Check this invoice" })).toHaveCount(4);
});

test("upload form asks for a file", async ({ page }) => {
  await page.goto("/pay");
  await page.getByRole("button", { name: "Check this invoice" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "choose a photo or PDF" })).toBeVisible();
});

test("a settled payment has a bilingual receipt", async ({ page }) => {
  await page.goto("/r/LM-H7K2P");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paid in full");
  // The receipt message is written on first view if it's missing.
  await expect(page.locator("[lang=sw]").filter({ hasText: "LM-H7K2P" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/KES 19,800/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy for WhatsApp" })).toBeVisible();
});

test("the bursar dashboard lists payments in AG Grid", async ({ page }) => {
  await page.goto("/institution/mlima-girls-eldoret");
  await expect(page.getByRole("heading", { name: "Mlima Girls National School, Eldoret" })).toBeVisible();
  // Deployments with DASHBOARD_PASSCODE set show a passcode form first.
  const unlock = page.getByRole("button", { name: "Open dashboard" });
  if (await unlock.isVisible()) {
    await page.getByLabel("Passcode").fill(process.env.E2E_DASHBOARD_PASSCODE ?? "");
    await unlock.click();
  }
  const grid = page.getByRole("treegrid").or(page.getByRole("grid"));
  await expect(grid.getByText("Mercy Jepkoech")).toBeVisible();
  await expect(page.locator(".lm-row-block").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask Lipa Once" })).toBeVisible();
});

test.describe("full AI check", () => {
  // The server needs ANTHROPIC_API_KEY; set E2E_LIVE_AI=1 to run these.
  test.skip(!process.env.E2E_LIVE_AI, "set E2E_LIVE_AI=1 to run the live AI checks");

  test("the genuine invoice is approved", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("article").filter({ hasText: "Genuine invoice" }).getByRole("button").click();
    await expect(page).toHaveURL(/\/pay\/[a-z0-9]+$/, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: "Safe to pay" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Achieng Otieno" })).toBeVisible();
  });

  test("the doctored invoice is blocked", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("article").filter({ hasText: "Doctored invoice" }).getByRole("button").click();
    await expect(page).toHaveURL(/\/pay\/[a-z0-9]+$/, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: "We can't pay this bill" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: /Payment details don.t match/ })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: /2\.3× the usual Form 3/ })).toBeVisible();
    await expect(page.getByText("Payment is disabled for this invoice.")).toBeVisible();
  });
});
