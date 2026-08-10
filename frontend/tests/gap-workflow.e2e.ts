/**
 * Mocked browser tests for the deadline Gap UI. These tests verify the React
 * workflow against HTTP envelopes; they are not browser-to-database E2E tests.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const gapId = "91000000-0000-4000-8000-000000000001";
const company = { id: "10000000-0000-4000-8000-000000000001", code: "GEN", name: "GenBioCa" };

const makeGap = (status: "OPEN" | "IN_PROGRESS" | "CANCELLED" = "OPEN") => ({
  id: gapId,
  code: "GAP-001",
  title: "Missing quarterly review",
  description: "The required review was not recorded.",
  severity: "MAJOR",
  status,
  source: "Internal audit",
  clauseRef: "ISO-9.3",
  recommendedAction: "Complete and evidence the review.",
  owner: null,
  sourceOwnerRef: "Compliance Lead",
  department: { id: "30000000-0000-4000-8000-000000000001", code: "DEP-001", name: "Compliance" },
  framework: { id: "40000000-0000-4000-8000-000000000001", code: "ISO9001", name: "ISO 9001" },
  frameworkRule: null,
  control: { id: "50000000-0000-4000-8000-000000000001", code: "CTL-001", title: "Management review" },
  checkpoint: null,
  identifiedOn: "2026-07-01",
  dueDate: "2026-07-20",
  overdue: true,
  closedAt: null,
  closureNote: null,
  needsReview: false,
  reviewReason: null,
  capas: [],
  evidence: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const success = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });

async function installMock(
  page: Page,
  closeMode: "success" | "evidence-error" = "success",
  initialStatus: "OPEN" | "IN_PROGRESS" | "CANCELLED" = "OPEN",
) {
  let gap = makeGap(initialStatus);
  const calls: string[] = [];
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    // Record comments render on every detail page; the mock answers with an
    // empty conversation so the panel shows its empty state rather than an
    // error that would collide with the page's own alerts.
    if (/\/api\/v1\/records\/[A-Z]+\/[^/]+\/comments$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
    }
    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "token", user: { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", name: "UAT Admin", email: "uat@example.test", phone: null, status: "ACTIVE", lastLogin: null, permissions: ["gaps:read", "gaps:write", "gaps:close", "capa:write", "users:read", "organisation:read", "exports:read"], activeCompany: company, companies: [company] } })) });
    }
    if (path === "/api/v1/gaps" && method === "GET") {
      calls.push(`${method} ${request.url()}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([gap], { page: 1, pageSize: 20, total: 1, totalPages: 1 })) });
    }
    if (path === "/api/v1/gaps" && method === "POST") {
      calls.push("POST /api/v1/gaps");
      const input = request.postDataJSON() as { title: string; severity: string };
      gap = { ...gap, title: input.title, severity: input.severity };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(success(gap)) });
    }
    if (path === `/api/v1/gaps/${gapId}` && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(gap)) });
    }
    if (path === `/api/v1/gaps/${gapId}` && method === "PATCH") {
      const input = request.postDataJSON() as Partial<typeof gap>;
      gap = { ...gap, ...input };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(gap)) });
    }
    if (path === `/api/v1/gaps/${gapId}/close` && method === "POST") {
      calls.push("POST close");
      if (closeMode === "evidence-error") {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "EVIDENCE_REQUIRED", message: "Evidence is required", details: { reason: "EVIDENCE_GAP_LINK_REQUIRED" } } }) });
      }
      gap = { ...gap, status: "CLOSED", closureNote: "Reviewed approved evidence.", closedAt: "2026-08-02T00:00:00.000Z", overdue: false };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(gap)) });
    }
    if (path === "/api/v1/exports/gaps.csv") {
      calls.push(`EXPORT ${request.headers()["authorization"] ?? "no-auth"}`);
      return route.fulfill({ status: 200, contentType: "text/csv", headers: { "Content-Disposition": "attachment; filename=\"gaps-2026-08-02.csv\"" }, body: "code,title\nGAP-001,Missing quarterly review\n" });
    }
    if (path === "/api/v1/users") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([])) });
    }
    if (path === "/api/v1/organisation/departments") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success([])) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not mocked" } }) });
  });
  return calls;
}

test("Gap list loads with filters and responsive surfaces", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto("/compliance/gaps");
  await expect(page.getByRole("heading", { name: "Gap Register" })).toBeVisible();
  await expect(page.getByTestId("gap-register-table")).toContainText("Missing quarterly review");
  await page.getByLabel("Gap status").selectOption("OPEN");
  await expect.poll(() => calls.some((call) => call.includes("status=OPEN"))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("gap-register-cards")).toBeVisible();
});

test("Gap can be created and opens its detail", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto("/compliance/gaps");
  await page.getByRole("button", { name: "Create Gap" }).click();
  await page.getByLabel("Title").fill("New audit Gap");
  await page.getByRole("button", { name: "Create Gap", exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/compliance/gaps/${gapId}$`));
  await expect(page.getByRole("heading", { name: "New audit Gap" })).toBeVisible();
  expect(calls).toContain("POST /api/v1/gaps");
});

test("Gap detail displays returned source context", async ({ page }) => {
  await installMock(page);
  await page.goto(`/compliance/gaps/${gapId}`);
  await expect(page.getByText("ISO 9001 (ISO9001)")).toBeVisible();
  await expect(page.getByText("Management review (CTL-001)")).toBeVisible();
});

test("Gap edit offers only valid transitions from CANCELLED", async ({ page }) => {
  await installMock(page, "success", "CANCELLED");
  await page.goto(`/compliance/gaps/${gapId}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Status").locator("option")).toHaveText([
    "CANCELLED",
    "OPEN",
  ]);
});

test("Gap closes through the backend action", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto(`/compliance/gaps/${gapId}`);
  await page.getByRole("button", { name: "Close Gap" }).click();
  await page.getByLabel("Closure note").fill("Reviewed approved evidence.");
  await page.getByRole("button", { name: "Close Gap", exact: true }).last().click();
  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
  expect(calls).toContain("POST close");
});

test("Evidence-required Gap close conflict is explained safely", async ({ page }) => {
  await installMock(page, "evidence-error");
  await page.goto(`/compliance/gaps/${gapId}`);
  await page.getByRole("button", { name: "Close Gap" }).click();
  await page.getByLabel("Closure note").fill("Attempt closure with a full note.");
  await page.getByRole("button", { name: "Close Gap", exact: true }).last().click();
  await expect(page.getByRole("alert")).toContainText("approved Evidence with an available physical file");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Gap CSV export uses authenticated Blob download and server filename", async ({ page }) => {
  const calls = await installMock(page);
  await page.goto("/compliance/gaps");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("gaps-2026-08-02.csv");
  expect(calls).toContain("EXPORT Bearer token");
});
