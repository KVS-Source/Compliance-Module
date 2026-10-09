/**
 * Mocked dashboard UI tests.
 *
 * Every number asserted here comes only from the intercepted API response.
 * The page is not allowed to compute, pad or default a figure it was not
 * given, so a section the API withheld must read as restricted rather than 0.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "GEN",
  name: "GenBioCa",
};

const analytics = {
  cards: {
    kpiDefinitions: 91,
    activeKpiConfigurations: 24,
    measuredKpis: 29,
    kpisMeetingTarget: 9,
    kpisMissingTarget: 20,
    pendingEvidence: 3,
    openRisks: 32,
    openGaps: 4,
    openCapas: 5,
    policiesDueForReview: 2,
  },
  kpiTrend: [
    {
      period: "FY26-27 Q1",
      periodStart: "2026-04-01",
      measured: 29,
      meetingTarget: 9,
      targetTotal: 1200,
      actualTotal: 940,
    },
  ],
  evidenceStatus: [
    { status: "DRAFT", count: 18 },
    { status: "APPROVED", count: 2 },
  ],
  frameworkCompliance: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      code: "ISO27001",
      name: "Information Security",
      version: "2022",
      scopeStatus: "Active – In Scope",
      ruleCount: 93,
      mappedControls: 0,
      implementedControls: 0,
      openGaps: 3,
      compliancePercentage: null,
    },
    {
      id: "60000000-0000-4000-8000-000000000002",
      code: "ISO9001",
      name: "Quality Management",
      version: "2015",
      scopeStatus: "Certified",
      ruleCount: 40,
      mappedControls: 8,
      implementedControls: 6,
      openGaps: 1,
      compliancePercentage: 75,
    },
  ],
  riskHeatMap: {
    cells: [
      { likelihood: 3, impact: 4, count: 7 },
      { likelihood: 5, impact: 5, count: 2 },
    ],
    maxLikelihood: 5,
    maxImpact: 5,
    total: 9,
  },
  capaAging: [
    { key: "OVERDUE_90_PLUS", label: "Overdue 90+ days", count: 1 },
    { key: "DUE_SOON", label: "Due within 30 days", count: 4 },
  ],
  recentKpiRisks: [
    {
      id: "90000000-0000-4000-8000-000000000001",
      code: "RSK-001",
      title: "Training completion below target",
      kpiRiskClass: "MAJOR",
      status: "OPEN",
      inherentScore: 12,
      raisedAt: "2026-07-14T09:00:00.000Z",
      kpi: {
        actualCode: "ACT-001",
        period: "FY26-27 Q1",
        ragStatus: "RED",
        definitionCode: "KPI-001",
        definitionName: "Training completion",
      },
    },
  ],
  capasDueSoon: [
    {
      id: "a0000000-0000-4000-8000-000000000001",
      code: "CAPA-001",
      title: "Refresh supplier assessments",
      priority: "HIGH",
      status: "OPEN",
      dueDate: "2026-08-20",
      completionPercentage: 40,
      ownerName: "User 001",
    },
  ],
  policiesDueForReview: {
    total: 2,
    overdue: 1,
    horizonDays: 90,
    items: [
      {
        policyId: "b0000000-0000-4000-8000-000000000001",
        code: "POL-001",
        title: "Information Security Policy",
        lifecycleStatus: "ACTIVE",
        version: "2.0",
        reviewDate: "2026-07-01",
        ownerName: "User 001",
      },
    ],
  },
  actionQueue: [
    {
      key: "gap-open",
      label: "Open Gaps",
      description: "Compliance gaps still awaiting remediation.",
      count: 4,
      to: "/compliance/gaps",
      tone: "amber",
    },
    {
      key: "evidence-review",
      label: "Evidence awaiting review",
      description: "Submitted Evidence with no review decision recorded.",
      count: 3,
      to: "/evidence/review",
      tone: "blue",
    },
  ],
  genrac: {
    configured: false,
    status: "NOT_CONFIGURED",
    systemCode: null,
    displayName: null,
    connectorType: null,
    lastTestedAt: null,
    lastAttemptedSyncAt: null,
    lastSuccessfulSyncAt: null,
    mappingCount: 0,
    lastSyncRun: null,
    liveAccess: false,
  },
};

const summary = {
  generatedAt: "2026-08-02T12:00:00.000Z",
  compliance: { overallPercentage: 31, measuredKpis: 29, kpisMeetingTarget: 9 },
  kpis: {
    activeConfigurations: 24,
    meetingTarget: 9,
    amberActuals: 11,
    redActuals: 9,
    pendingApprovals: 0,
    definitions: 91,
    configured: 24,
    enabled: 24,
    measured: 29,
    green: 9,
    amber: 11,
    red: 9,
    pendingApproval: 0,
  },
  risks: {
    openRisks: 20,
    minorRisks: 11,
    majorRisks: 9,
    risksUnderTreatment: 0,
    closedRisks: 0,
    openMajor: 9,
    openMinor: 11,
    openEnterprise: 12,
    openTotal: 32,
    treated: 0,
    closed: 0,
  },
  organisation: { departments: 10, locations: 2, organisationUnits: 3 },
  frameworks: { activeFrameworks: 9, active: 9, total: 12, breakdown: [] },
  gaps: { open: 4, overdue: 2, closed: 6, critical: 0, major: 3, needsReview: 0 },
  capas: {
    open: 5,
    overdue: 1,
    closed: 5,
    pendingVerification: 2,
    needsReview: 0,
  },
  evidence: {
    total: 20,
    pendingReview: 3,
    approved: 2,
    expiringSoon: 1,
    expired: 0,
    withoutFile: 20,
  },
  registers: [{ code: "AUDIT", name: "Audit Schedule", recordCount: 106 }],
  recentActivity: [
    {
      id: "c0000000-0000-4000-8000-000000000001",
      action: "EVIDENCE_APPROVED",
      entityType: "Evidence",
      entityId: "EVD-001",
      at: "2026-08-01T10:00:00.000Z",
      actor: {
        id: "20000000-0000-4000-8000-000000000001",
        code: "USR-001",
        name: "User 001",
      },
    },
  ],
  latestImport: {
    id: "d0000000-0000-4000-8000-000000000001",
    originalFilename: "GenBioCa_Compliance_Platform.xlsx",
    status: "COMMITTED",
    createdCount: 640,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    startedAt: "2026-08-01T09:00:00.000Z",
    completedAt: "2026-08-01T09:04:00.000Z",
  },
  analytics,
};

/** Every analytics section withheld, as the API does for a restricted role. */
const restrictedAnalytics = {
  ...analytics,
  cards: {
    ...analytics.cards,
    openRisks: null,
    openCapas: null,
  },
  riskHeatMap: null,
  capaAging: null,
  recentKpiRisks: null,
  capasDueSoon: null,
  actionQueue: [],
};

const emptyAnalytics = {
  ...analytics,
  cards: {
    kpiDefinitions: 0,
    activeKpiConfigurations: 0,
    measuredKpis: 0,
    kpisMeetingTarget: 0,
    kpisMissingTarget: 0,
    pendingEvidence: 0,
    openRisks: 0,
    openGaps: 0,
    openCapas: 0,
    policiesDueForReview: 0,
  },
  kpiTrend: [],
  evidenceStatus: [],
  frameworkCompliance: [],
  riskHeatMap: { cells: [], maxLikelihood: 0, maxImpact: 0, total: 0 },
  capaAging: [],
  recentKpiRisks: [],
  capasDueSoon: [],
  policiesDueForReview: { total: 0, overdue: 0, horizonDays: 90, items: [] },
  actionQueue: [],
};

const success = (data: unknown) => ({ success: true, data });

type Mode = "data" | "zero" | "error" | "restricted";

async function mockDashboard(
  page: Page,
  mode: Mode = "data",
  permissions: string[] = ["*"],
  onSummaryRequest: () => void = () => undefined,
) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/refresh")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            accessToken: "token",
            user: {
              id: "20000000-0000-4000-8000-000000000001",
              code: "USR-001",
              name: "UAT Admin",
              email: "uat@example.test",
              phone: null,
              status: "ACTIVE",
              lastLogin: null,
              permissions,
              activeCompany: company,
              companies: [company],
            },
          }),
        ),
      });
    if (path === "/api/v1/dashboard/summary") {
      onSummaryRequest();
      if (mode === "error")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "INTERNAL", message: "Summary unavailable" },
          }),
        });
      const payload =
        mode === "zero"
          ? {
              ...summary,
              compliance: {
                overallPercentage: 0,
                measuredKpis: 0,
                kpisMeetingTarget: 0,
              },
              registers: [],
              recentActivity: [],
              latestImport: null,
              analytics: emptyAnalytics,
            }
          : mode === "restricted"
            ? {
                ...summary,
                compliance: null,
                analytics: restrictedAnalytics,
              }
            : summary;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(payload)),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Not mocked" },
      }),
    });
  });
}

test("Dashboard renders every required summary card from the API", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  for (const [label, value] of [
    ["Overall Compliance", "31%"],
    ["Company KPI Definitions", "91"],
    ["Active KPI Configurations", "24"],
    ["Measured KPIs", "29"],
    ["KPIs Meeting Target", "9"],
    ["KPIs Missing Target", "20"],
    ["Pending Evidence", "3"],
    ["Open Risks", "32"],
    ["Open Gaps", "4"],
    ["Open CAPAs", "5"],
    ["Policies Due for Review", "2"],
    ["Evidence expiring", "—"],
  ] as const) {
    await expect(
      page.getByLabel(new RegExp(`${label}: ${value}`)),
      label,
    ).toBeVisible();
  }
  await expect(page.getByTestId("dashboard-cards").locator("a")).toHaveCount(12);
  await expect(
    page.getByLabel("Overall Compliance: 31%. Open Overall Compliance"),
  ).toContainText("9 of 29 measured KPIs met target");
  await expect(page.getByTestId("dashboard-data-scope")).toContainText(
    "GenBioCa",
  );
  await expect(page.getByTestId("dashboard-data-scope")).toContainText(
    "31% compliance",
  );
  await expect(page.locator("#company-switcher")).toContainText(
    "GenBioCa (GEN)",
  );
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Dashboard help" })).toContainText(
    "Compliance, performance and outstanding work.",
  );
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("href", "/dashboard");
});

test("Dashboard renders every required visualisation section", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  for (const testId of [
    "dashboard-action-queue",
    "dashboard-kpi-trend",
    "dashboard-evidence-status",
    "dashboard-framework-compliance",
    "dashboard-risk-heatmap",
    "dashboard-capa-aging",
    "dashboard-capas-due-soon",
    "dashboard-recent-kpi-risks",
    "dashboard-policies-due",
    "dashboard-recent-activity",
    "dashboard-genrac",
    "dashboard-registers",
    "dashboard-latest-import",
  ]) {
    await expect(page.getByTestId(testId), testId).toBeVisible();
  }
  await expect(page.getByTestId("kpi-trend-chart")).toBeVisible();
  await expect(page.getByTestId("evidence-status-donut")).toBeVisible();
  await expect(page.getByTestId("framework-compliance-bars")).toBeVisible();
  await expect(page.getByTestId("risk-heatmap")).toBeVisible();
  await expect(page.getByTestId("capa-aging-bars")).toBeVisible();
});

test("Action Queue lists only work that exists and links to its register", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  const queue = page.getByTestId("dashboard-action-queue");
  await expect(queue.locator(".action-queue-item")).toHaveCount(2);
  await expect(page.getByTestId("action-queue-gap-open")).toContainText("4");
  await page.getByTestId("action-queue-evidence-review").click();
  await expect(page).toHaveURL(/\/evidence\/review$/);
});

test("GenRAC reads Not configured and never claims live access", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-genrac-state")).toHaveText(
    "Not configured",
  );
  const liveAccess = page.getByTestId("dashboard-genrac-body").locator("div").filter({
    has: page.locator("dt", { hasText: /^Live access$/ }),
  });
  await expect(liveAccess.locator("dd")).toHaveText("No");
});

test("An unmapped framework reports no percentage rather than zero", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  const bars = page.getByTestId("framework-compliance-bars");
  await expect(bars).toContainText("No mapped Control");
  await expect(bars).toContainText("75%");
});

test("Dashboard shows truthful empty states rather than zeroed charts", async ({
  page,
}) => {
  await mockDashboard(page, "zero");
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-kpi-trend-empty")).toContainText(
    "No KPI actuals recorded.",
  );
  await expect(
    page.getByTestId("dashboard-evidence-status-empty"),
  ).toContainText("No Evidence records yet");
  await expect(page.getByTestId("dashboard-risk-heatmap-empty")).toContainText(
    "No open risks recorded",
  );
  await expect(page.getByTestId("dashboard-action-queue-empty")).toContainText(
    "No outstanding actions",
  );
  await expect(page.getByLabel(/Open Gaps: 0/)).toBeVisible();
  await expect(page.getByTestId("dashboard-data-scope")).toContainText(
    "No measured KPI actuals in this Company",
  );
});

test("A withheld section reads as restricted, not as zero", async ({ page }) => {
  await mockDashboard(page, "restricted");
  await page.goto("/dashboard");
  await expect(
    page.getByTestId("dashboard-risk-heatmap-restricted"),
  ).toContainText("does not include permission");
  await expect(
    page.getByTestId("dashboard-capa-aging-restricted"),
  ).toBeVisible();
  // The card must print an em dash, never a 0 that reads as "none".
  await expect(page.getByLabel(/Overall Compliance: —/)).toContainText(
    "permission restricted",
  );
  await expect(page.getByLabel(/Open Risks: —/)).toBeVisible();
});

test("Dashboard shows its API failure state", async ({ page }) => {
  await mockDashboard(page, "error");
  await page.goto("/dashboard");
  await expect(page.getByRole("alert")).toContainText("Summary unavailable");
});

test("Dashboard cards collapse to one mobile column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto("/dashboard");
  const columns = await page
    .locator(".dashboard-cards")
    .evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
  expect(columns).toBe(1);
  await expect(page.getByLabel(/Open Gaps: 4/)).toBeVisible();
});

test("Dashboard has no horizontal overflow on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-cards")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Dashboard links use a calm hover state", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  const card = page.getByLabel(/Open Gaps: 4/);
  await card.hover();
  const hoverStyle = await card.evaluate((element) => {
    const label = element.querySelector(".card-label");
    return {
      background: getComputedStyle(element).backgroundImage,
      backgroundColor: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderColor,
      boxShadow: getComputedStyle(element).boxShadow,
      label: label ? getComputedStyle(label).color : "",
    };
  });
  // Calm enterprise hover: no blue fill gradient; border + light shadow only.
  expect(hoverStyle.background === "none" || hoverStyle.background === "initial").toBeTruthy();
  expect(hoverStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(hoverStyle.border).not.toBe("rgb(37, 99, 235)");
  expect(hoverStyle.boxShadow).not.toBe("none");
  expect(hoverStyle.label).not.toBe("rgb(255, 255, 255)");
});

test("Summary cards stay full-width and interactive on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 424, height: 731 });
  await mockDashboard(page);
  await page.goto("/dashboard");
  const card = page.getByLabel(/Open CAPAs: 5/);
  await expect(card).toHaveAttribute("href", "/compliance/capa");
  const cardWidth = await card.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const gridWidth = await page
    .locator(".dashboard-cards")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(cardWidth).toBeGreaterThan(gridWidth * 0.9);
  await card.hover();
  await expect(card).toHaveCSS("background-image", "none");
  const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
  expect(border).not.toBe("rgb(37, 99, 235)");
});

test("Dashboard permission boundary prevents an unauthorised summary request", async ({
  page,
}) => {
  let summaryRequests = 0;
  await mockDashboard(page, "data", ["kpis:read"], () => {
    summaryRequests += 1;
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Permission required" }),
  ).toBeVisible();
  expect(summaryRequests).toBe(0);
});
