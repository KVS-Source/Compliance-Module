/** Mocked dashboard UI tests; values come only from the intercepted API response. */
import { expect, test, type Page, type Route } from "@playwright/test";
const company = { id: "10000000-0000-4000-8000-000000000001", code: "GEN", name: "GenBioCa" };
const summary = {
  generatedAt: "2026-08-02T12:00:00.000Z",
  compliance: { overallPercentage: 31, measuredKpis: 29, kpisMeetingTarget: 9 },
  kpis: { activeConfigurations: 24, meetingTarget: 9, amberActuals: 11, redActuals: 9, pendingApprovals: 0, definitions: 91, configured: 24, enabled: 24, measured: 29, green: 9, amber: 11, red: 9, pendingApproval: 0 },
  risks: { openRisks: 20, minorRisks: 11, majorRisks: 9, risksUnderTreatment: 0, closedRisks: 0, openMajor: 9, openMinor: 11, openEnterprise: 12, openTotal: 32, treated: 0, closed: 0 },
  organisation: { departments: 10, locations: 2, organisationUnits: 3 },
  frameworks: { activeFrameworks: 9, active: 9, total: 12, breakdown: [] },
  gaps: { open: 4, overdue: 2, closed: 6, critical: 0, major: 3, needsReview: 0 },
  capas: { open: 5, overdue: 1, closed: 5, pendingVerification: 2, needsReview: 0 },
  evidence: { total: 20, pendingReview: 3, approved: 2, expiringSoon: 1, expired: 0, withoutFile: 20 },
  registers: [{ code: "AUDIT", name: "Audit Schedule", recordCount: 106 }],
};
const success = (data: unknown) => ({ success: true, data });
async function mockDashboard(
  page: Page,
  mode: "data" | "zero" | "error" = "data",
  permissions: string[] = ["*"],
  onSummaryRequest: () => void = () => undefined,
) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/refresh") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "token", user: { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", name: "UAT Admin", email: "uat@example.test", phone: null, status: "ACTIVE", lastLogin: null, permissions, activeCompany: company, companies: [company] } })) });
    if (path === "/api/v1/dashboard/summary") {
      onSummaryRequest();
      if (mode === "error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "INTERNAL", message: "Summary unavailable" } }) });
      const payload = mode === "zero" ? { ...summary, compliance: { overallPercentage: 0, measuredKpis: 0, kpisMeetingTarget: 0 }, kpis: { ...summary.kpis, activeConfigurations: 0, meetingTarget: 0, amberActuals: 0, redActuals: 0 }, risks: { ...summary.risks, openRisks: 0, risksUnderTreatment: 0, closedRisks: 0 }, gaps: { ...summary.gaps, open: 0, overdue: 0 }, capas: { ...summary.capas, open: 0, overdue: 0 }, evidence: { ...summary.evidence, pendingReview: 0 }, registers: [] } : summary;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(payload)) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not mocked" } }) });
  });
}
test("Dashboard renders deadline aggregates from the API", async ({ page }) => { await mockDashboard(page); await page.goto("/dashboard"); await expect(page.getByLabel(/Overall Compliance: 31%/)).toBeVisible(); await expect(page.getByLabel(/Open Gaps: 4/)).toBeVisible(); await expect(page.getByLabel(/Overdue CAPAs: 1/)).toBeVisible(); await expect(page.getByLabel(/Pending Evidence Reviews: 3/)).toBeVisible(); await expect(page.getByText("106", { exact: true })).toBeVisible(); });
test("Dashboard gives stable zero-data values", async ({ page }) => { await mockDashboard(page, "zero"); await page.goto("/dashboard"); await expect(page.getByText("No compliance activity yet")).toBeVisible(); await expect(page.getByLabel(/Open Gaps: 0/)).toBeVisible(); await expect(page.getByLabel(/Open CAPAs: 0/)).toBeVisible(); });
test("Dashboard shows its API failure state", async ({ page }) => { await mockDashboard(page, "error"); await page.goto("/dashboard"); await expect(page.getByRole("alert")).toContainText("Summary unavailable"); });
test("Dashboard deadline cards collapse to one mobile column", async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await mockDashboard(page); await page.goto("/dashboard"); const columns = await page.locator(".dashboard-cards").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length); expect(columns).toBe(1); await expect(page.getByLabel(/Open Gaps: 4/)).toBeVisible(); });
test("Dashboard links use a full blue hover state", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  const card = page.getByLabel(/Overall Compliance: 31%/);
  await card.hover();
  const hoverStyle = await card.evaluate((element) => {
    const label = element.querySelector(".card-label");
    return {
      background: getComputedStyle(element).backgroundImage,
      border: getComputedStyle(element).borderColor,
      label: label ? getComputedStyle(label).color : "",
    };
  });
  expect(hoverStyle.background).toContain("linear-gradient");
  expect(hoverStyle.border).toBe("rgb(37, 99, 235)");
  expect(hoverStyle.label).toBe("rgb(255, 255, 255)");
});
test("Operational Records is a full-width interactive card on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 731 });
  await mockDashboard(page);
  await page.goto("/dashboard");
  const card = page.getByLabel(/Operational Records: 106/);
  await expect(card).toHaveAttribute("href", "/compliance/operational-registers");
  const cardWidth = await card.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const gridWidth = await page
    .locator(".dashboard-cards")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(cardWidth).toBeGreaterThan(gridWidth * 0.9);
  await card.hover();
  await expect(card).toHaveCSS(
    "background-image",
    /linear-gradient.*rgb\(37, 99, 235\)/,
  );
});
test("Dashboard permission boundary prevents an unauthorised summary request", async ({ page }) => {
  let summaryRequests = 0;
  await mockDashboard(page, "data", ["kpis:read"], () => { summaryRequests += 1; });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Permission required" })).toBeVisible();
  expect(summaryRequests).toBe(0);
});
