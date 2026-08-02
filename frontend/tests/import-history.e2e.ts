/** Mocked import read-API tests; no workbook bytes or confidential rows are used. */
import { expect, test, type Page, type Route } from "@playwright/test";
const importId = "93000000-0000-4000-8000-000000000001";
const company = { id: "10000000-0000-4000-8000-000000000001", code: "GEN", name: "GenBioCa" };
const batch = { id: importId, originalFilename: "synthetic-uat.xlsx", fileChecksum: "a".repeat(64), idempotencyKey: "uat:a", status: "PARTIAL", createdCount: 12, updatedCount: 2, skippedCount: 1, errorCount: 1, startedAt: "2026-08-02T10:00:00.000Z", completedAt: "2026-08-02T10:01:00.000Z", uploadedBy: { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", fullName: "UAT Admin" }, report: { workbook: { filename: "synthetic-uat.xlsx", checksum: "a".repeat(64), byteSize: 1024, sheetCount: 1 }, sheets: [{ key: "gaps", sheetName: "Gaps", target: "normalised", present: true, totalRows: 16, validRows: 15, errorRows: 1, flaggedRows: 2, missingHeaders: [] }], perSheetOutcomes: [{ sheet: "Gaps", created: 12, updated: 2, unchanged: 0, skipped: 1 }], alreadyImported: false } };
const success = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
async function installMock(page: Page, failList = false) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/refresh") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "token", user: { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", name: "UAT Admin", email: "uat@example.test", phone: null, status: "ACTIVE", lastLogin: null, permissions: ["imports:read"], activeCompany: company, companies: [company] } })) });
    if (path === "/api/v1/imports") return route.fulfill({ status: failList ? 500 : 200, contentType: "application/json", body: JSON.stringify(failList ? { success: false, error: { code: "INTERNAL", message: "Import history unavailable" } } : success([batch], { page: 1, pageSize: 20, total: 1, totalPages: 1 })) });
    if (path === `/api/v1/imports/${importId}`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(batch)) });
    if (path === `/api/v1/imports/${importId}/errors`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([{ id: "94000000-0000-4000-8000-000000000001", sheet: "Gaps", rowNumber: 7, businessKey: "GAP-007", validationErrors: [{ field: "owner", message: "Owner reference was not resolved" }], importResult: "FAILED" }], { page: 1, pageSize: 50, total: 1, totalPages: 1 })) });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not mocked" } }) });
  });
}
test("Import History lists CLI-created batches", async ({ page }) => { await installMock(page); await page.goto("/data/import-history"); await expect(page.getByTestId("import-history-table")).toContainText("synthetic-uat.xlsx"); });
test("Import detail shows sheet outcomes and row-level errors", async ({ page }) => { await installMock(page); await page.goto(`/data/import-history/${importId}`); await expect(page.getByTestId("import-sheet-results")).toContainText("Gaps"); await expect(page.getByTestId("import-row-errors")).toContainText("Owner reference was not resolved"); });
test("Import History exposes an API failure state", async ({ page }) => { await installMock(page, true); await page.goto("/data/import-history"); await expect(page.getByRole("alert")).toContainText("Import history unavailable"); });
