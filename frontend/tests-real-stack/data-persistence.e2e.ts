import { expect, test } from "@playwright/test";

// No request interception: these assertions require the real API and disposable
// PostgreSQL fixture supplied by run-real-stack-e2e.mjs.
test("dashboard uses API totals; a department persists and stays tenant-scoped", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[type='email']").fill(process.env.REAL_STACK_EMAIL ?? "admin001@example.test");
  await page.locator("input[type='password']").fill(process.env.REAL_STACK_PASSWORD ?? "Admin001!Secure");
  const summaryPromise = page.waitForResponse(response =>
    response.url().includes("/api/v1/dashboard/summary") && response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const summaryResponse = await summaryPromise;
  expect(summaryResponse.ok()).toBeTruthy();
  const summary = (await summaryResponse.json()).data;
  expect(summary.compliance).not.toBeNull();
  await expect(page.getByLabel(`Overall Compliance: ${summary.compliance.overallPercentage}%. Open Overall Compliance`)).toContainText(
    `${summary.compliance.kpisMeetingTarget} of ${summary.compliance.measuredKpis} measured KPIs met target`,
  );

  await page.goto("/admin/departments");
  await page.getByRole("button", { name: "Add Department", exact: true }).click();
  const code = `DEP-E2E-${Date.now()}`;
  const name = "Department browser verification";
  await page.getByLabel("Department code", { exact: true }).fill(code);
  await page.getByLabel("Department name", { exact: true }).fill(name);
  const savedPromise = page.waitForResponse(response =>
    response.url().endsWith("/api/v1/organisation/departments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await savedPromise).status()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: code })).toContainText(name);

  const switcher = page.locator("#company-switcher");
  const companyOptions = await switcher.locator("option").evaluateAll(elements =>
    elements.map(element => ({ value: (element as HTMLOptionElement).value, text: element.textContent ?? "" })),
  );
  const other = companyOptions.find(option => option.text.includes("Company 002"));
  expect(other).toBeDefined();
  const otherDepartments = page.waitForResponse(response =>
    response.url().includes("/api/v1/organisation/departments") && response.request().method() === "GET",
  );
  await switcher.selectOption(other!.value);
  const otherResponse = await otherDepartments;
  expect(otherResponse.ok()).toBeTruthy();
  expect((await otherResponse.json()).data.some((row: { code: string }) => row.code === code)).toBe(false);
  await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0);
  const original = companyOptions.find(option => option.text.includes("Company 001"));
  expect(original).toBeDefined();
  await switcher.selectOption(original!.value);
  await expect(page.getByRole("row").filter({ hasText: code })).toContainText(name);
});
