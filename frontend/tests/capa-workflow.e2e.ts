/** Mocked React workflow tests; these do not exercise Express or PostgreSQL. */
import { expect, test, type Page, type Route } from "@playwright/test";

const capaId = "92000000-0000-4000-8000-000000000001";
const gapId = "91000000-0000-4000-8000-000000000001";
const company = { id: "10000000-0000-4000-8000-000000000001", code: "GEN", name: "GenBioCa" };
const linkedGap = { id: gapId, code: "GAP-001", title: "Missing review", severity: "MAJOR", status: "OPEN" };
const makeCapa = (status: "OPEN" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "CANCELLED" = "IN_PROGRESS") => ({ id: capaId, code: "CAPA-001", title: "Complete management review", description: "Complete the missing review cycle.", priority: "HIGH", status, gap: linkedGap, source: "Internal audit", sourceRef: "AUD-001", framework: { id: "40000000-0000-4000-8000-000000000001", code: "ISO9001", name: "ISO 9001" }, rootCause: "Calendar control failed.", correctiveAction: "Complete the review.", preventiveAction: "Add automated reminders.", owner: null, sourceOwnerRef: "Compliance Lead", department: { id: "30000000-0000-4000-8000-000000000001", code: "DEP-001", name: "Compliance" }, raisedOn: "2026-07-01", dueDate: "2026-07-20", overdue: true, completionPercentage: 40, closedAt: null, closureNote: null, needsReview: false, reviewReason: null, evidence: [], createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" });
const gapDto = { ...linkedGap, description: null, source: null, clauseRef: null, recommendedAction: null, owner: null, sourceOwnerRef: null, department: null, framework: null, frameworkRule: null, control: null, checkpoint: null, identifiedOn: null, dueDate: null, overdue: false, closedAt: null, closureNote: null, needsReview: false, reviewReason: null, capas: [], evidence: [], createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };
const success = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });

async function installMock(
  page: Page,
  closeMode: "success" | "evidence-error" = "success",
  initialStatus: "OPEN" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "CANCELLED" = "IN_PROGRESS",
) {
  let capa = makeCapa(initialStatus);
  const calls: string[] = [];
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === "/api/v1/auth/refresh") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "token", user: { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", name: "UAT Admin", email: "uat@example.test", phone: null, status: "ACTIVE", lastLogin: null, permissions: ["capa:read", "capa:write", "capa:close", "gaps:read", "users:read", "organisation:read"], activeCompany: company, companies: [company] } })) });
    if (path === "/api/v1/capas" && method === "GET") { calls.push(request.url()); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([capa], { page: 1, pageSize: 20, total: 1, totalPages: 1 })) }); }
    if (path === "/api/v1/capas" && method === "POST") { calls.push("POST capa"); const input = request.postDataJSON() as { title: string }; capa = { ...capa, title: input.title }; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(success(capa)) }); }
    if (path === `/api/v1/capas/${capaId}` && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(capa)) });
    if (path === `/api/v1/capas/${capaId}` && method === "PATCH") { calls.push("PATCH capa"); const input = request.postDataJSON() as { completionPercentage: number }; capa = { ...capa, ...input }; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(capa)) }); }
    if (path === `/api/v1/capas/${capaId}/close` && method === "POST") { calls.push("POST close"); if (closeMode === "evidence-error") return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "EVIDENCE_REQUIRED", message: "Evidence is required", details: { reason: "EVIDENCE_CAPA_LINK_REQUIRED" } } }) }); capa = { ...capa, status: "CLOSED", completionPercentage: 100, closedAt: "2026-08-02T00:00:00.000Z", closureNote: "Reviewed approved evidence.", overdue: false }; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(capa)) }); }
    if (path === "/api/v1/gaps" && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([gapDto], { page: 1, pageSize: 100, total: 1, totalPages: 1 })) });
    if (path === "/api/v1/users" || path === "/api/v1/organisation/departments") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([])) });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not mocked" } }) });
  });
  return calls;
}

test("CAPA list loads and switches to mobile cards", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto("/compliance/capa");
  await expect(page.getByTestId("capa-register-table")).toContainText("Complete management review");
  await page.getByLabel("CAPA status").selectOption("IN_PROGRESS");
  await expect.poll(() => calls.some((call) => call.includes("status=IN_PROGRESS"))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("capa-register-cards")).toBeVisible();
});

test("CAPA can be created with a linked Gap", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto(`/compliance/capa?gapId=${gapId}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Title").fill("New corrective action");
  await expect(page.getByLabel("Linked Gap")).toHaveValue(gapId);
  await page.getByRole("button", { name: "Create CAPA", exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/compliance/capa/${capaId}$`));
  expect(calls).toContain("POST capa");
});

test("CAPA edit saves progress through PATCH", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto(`/compliance/capa/${capaId}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Progress percentage").fill("65");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("65%", { exact: true })).toBeVisible();
  expect(calls).toContain("PATCH capa");
});

test("CAPA edit offers only valid transitions from PENDING_VERIFICATION", async ({ page }) => {
  await installMock(page, "success", "PENDING_VERIFICATION");
  await page.goto(`/compliance/capa/${capaId}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Status").locator("option")).toHaveText([
    "PENDING VERIFICATION",
    "IN PROGRESS",
    "CANCELLED",
  ]);
});

test("CAPA closes and refreshes authoritative 100 percent", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto(`/compliance/capa/${capaId}`);
  await page.getByRole("button", { name: "Close CAPA" }).click();
  await page.getByLabel("Closure note").fill("Reviewed approved evidence.");
  await page.getByRole("button", { name: "Close CAPA", exact: true }).last().click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  expect(calls).toContain("POST close");
});

test("Evidence-required CAPA close conflict remains actionable", async ({ page }) => {
  await installMock(page, "evidence-error");
  await page.goto(`/compliance/capa/${capaId}`);
  await page.getByRole("button", { name: "Close CAPA" }).click();
  await page.getByLabel("Closure note").fill("Attempt closure with a full note.");
  await page.getByRole("button", { name: "Close CAPA", exact: true }).last().click();
  await expect(page.getByRole("alert")).toContainText("approved Evidence with an available physical file");
});
