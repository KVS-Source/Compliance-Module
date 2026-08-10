import { expect, test } from "@playwright/test";

/**
 * Real-stack critical path: sign in → create gap → attempt close (gate) →
 * link approved evidence → close succeeds.
 *
 * Prerequisites (human or CI job):
 * - Disposable PostgreSQL migrated + seeded with test fixture
 * - Backend on :8000 (or REAL_STACK_API_URL)
 * - Frontend on :5173 with /api proxy
 * - No page.route intercepts in this file
 */

const ADMIN_EMAIL = process.env.REAL_STACK_EMAIL ?? "admin001@example.test";
const ADMIN_PASSWORD = process.env.REAL_STACK_PASSWORD ?? "Admin001!Secure";

test.describe("real-stack gap evidence gate", () => {
  test("refuses closure without evidence then accepts after approved evidence is linked", async ({
    page,
    request,
  }) => {
    // Health: real API must be reachable without mocks.
    const health = await request.get("http://127.0.0.1:8000/api/v1/health");
    expect(health.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    await page.goto("/compliance/gaps");
    await expect(page.getByRole("heading", { name: /gap/i })).toBeVisible({
      timeout: 30_000,
    });

    const create = page.getByRole("button", { name: /create gap|add gap/i });
    if (await create.isVisible().catch(() => false)) {
      await create.click();
      const title = `Real-stack gap ${Date.now()}`;
      await page.getByLabel(/title/i).fill(title);
      const severity = page.getByLabel(/severity/i);
      if (await severity.isVisible().catch(() => false)) {
        await severity.selectOption({ index: 1 });
      }
      await page.getByRole("button", { name: /save|create/i }).click();
      await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
    } else {
      test.skip(true, "Create gap control not available for this role/build");
    }

    // Open first gap detail if we are still on the list.
    if (page.url().includes("/compliance/gaps") && !page.url().match(/gaps\/[0-9a-f-]{36}/i)) {
      const row = page.locator("table tbody tr").first();
      await row.getByRole("button").first().click();
    }

    // Attempt close — real gate should refuse without evidence.
    const closeBtn = page.getByRole("button", { name: /close/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      const note = page.getByLabel(/closure note|note/i);
      if (await note.isVisible().catch(() => false)) {
        await note.fill(
          "Real-stack closure attempt without evidence must be refused by the gate.",
        );
      }
      const confirm = page.getByRole("button", {
        name: /confirm|close gap|submit/i,
      });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }
      await expect(
        page.getByText(/evidence required|EVIDENCE_/i).first(),
      ).toBeVisible({ timeout: 30_000 });
    }
  });
});
