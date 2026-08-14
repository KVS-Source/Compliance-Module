import { expect, test } from "@playwright/test";

/**
 * Real-stack critical path — the browser talks to a live API and real
 * PostgreSQL with no request intercepts. A failure here means the product is
 * broken, not that a mock drifted.
 *
 * Brought up by `frontend/scripts/run-real-stack-e2e.mjs`, which starts the
 * API and the app itself. Do not add `page.route` intercepts to this file.
 *
 * Scope note: this covers the **refusal** half of the evidence gate — closure
 * is rejected when no qualifying approved evidence is linked. The successful
 * half is not covered here, because approving evidence requires a second
 * account: maker-checker forbids the creator, uploader or submitter from
 * deciding on their own evidence, so a single signed-in administrator cannot
 * drive it end to end. Closing that gap needs a two-account fixture and is
 * tracked as follow-up work. The test name says only what it proves.
 */

const API_URL = process.env.REAL_STACK_API_URL ?? "http://127.0.0.1:8000";
const ADMIN_EMAIL = process.env.REAL_STACK_EMAIL ?? "admin001@example.test";
const ADMIN_PASSWORD = process.env.REAL_STACK_PASSWORD ?? "Admin001!Secure";

test.describe("real-stack gap evidence gate", () => {
  test("refuses to close a gap that has no approved evidence linked", async ({
    page,
    request,
  }) => {
    const health = await request.get(`${API_URL}/api/v1/health`);
    expect(health.ok(), "the real API must be reachable").toBeTruthy();

    await page.goto("/login");
    // `getByLabel(/password/i)` also matches the "Show password" toggle, which
    // makes the locator ambiguous under strict mode. Target the input itself.
    await page.locator("#email, input[type='email']").first().fill(ADMIN_EMAIL);
    await page.locator("input[type='password']").first().fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    /**
     * Take a token from the API directly rather than reading it out of the
     * page. The client deliberately keeps the access token in a module
     * variable — never in local or session storage — so there is nothing in
     * the browser to read. Both sessions are real; only this one is scriptable.
     */
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.ok(), "API login for test setup failed").toBeTruthy();
    const token = (await login.json()).data.accessToken as string;

    // Create the gap through the API so the test starts from a known record
    // rather than whichever row happens to be first in the register.
    const created = await request.post(`${API_URL}/api/v1/gaps`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: `Real-stack gate probe ${Date.now()}`,
        description: "Raised by the real-stack suite to exercise the gate.",
        severity: "MINOR",
        source: "Internal Audit",
        dueDate: "2026-12-31",
      },
    });

    // If the API refuses to create, the test must fail rather than quietly
    // skip. A conditional here is how a suite ends up green while asserting
    // nothing.
    expect(
      created.ok(),
      `gap creation failed: ${created.status()} ${await created.text()}`,
    ).toBeTruthy();
    const gapId = (await created.json()).data.id as string;

    await page.goto(`/compliance/gaps/${gapId}`);
    await expect(
      page.getByRole("heading", { name: /gap|GAP-/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: /close gap/i })
      .first()
      .click();
    await page
      .getByLabel(/closure note/i)
      .fill("Closure attempted with no evidence; the gate must refuse this.");
    await page
      .getByRole("button", { name: /close gap/i })
      .last()
      .click();

    // The gate is enforced by the backend against real data — this is the
    // assertion the whole real-stack suite exists for.
    await expect(page.getByRole("alert").first()).toContainText(/evidence/i, {
      timeout: 30_000,
    });

    // And the record must still be open afterwards.
    const after = await request.get(`${API_URL}/api/v1/gaps/${gapId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.ok()).toBeTruthy();
    expect((await after.json()).data.status).not.toBe("CLOSED");
  });
});
