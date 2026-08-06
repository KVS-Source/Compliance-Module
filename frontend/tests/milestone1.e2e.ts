import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * This suite uses browser-intercepted API responses. It verifies the React
 * experience and request contract, not Express/Prisma/PostgreSQL integration.
 */

const companies = [
  { id: "10000000-0000-4000-8000-000000000001", code: "COM-001", name: "Company 001", industry: "Life Sciences", country: "Country 001", status: "ACTIVE", created: "2026-07-01T00:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000002", code: "COM-002", name: "Company 002", industry: "Healthcare Operations", country: "Country 001", status: "ACTIVE", created: "2026-07-02T00:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000003", code: "COM-003", name: "Company 003", industry: "Biotechnology Research", country: "Country 001", status: "ACTIVE", created: "2026-07-03T00:00:00.000Z" },
];

const users = [
  { id: "20000000-0000-4000-8000-000000000001", code: "USR-001", name: "User 001", email: "admin001@example.test", phone: "+00 00000 00001", department: "Compliance", roles: ["Company Admin"], status: "ACTIVE", lastLogin: "2026-07-21T10:00:00.000Z" },
  { id: "20000000-0000-4000-8000-000000000002", code: "USR-002", name: "User 002", email: "user001@example.test", phone: "+00 00000 00002", department: "Compliance", roles: ["Company User"], status: "ACTIVE", lastLogin: null },
];

const departments = [{ id: "30000000-0000-4000-8000-000000000001", code: "DEP-001", name: "Compliance", headName: "User 002", status: "ACTIVE", createdAt: "2026-07-01T00:00:00.000Z" }];
const locations = [{ id: "40000000-0000-4000-8000-000000000001", code: "LOC-001", name: "Location 001", city: "City 001", state: "State 001", country: "Country 001", type: "Office", status: "ACTIVE", createdAt: "2026-07-01T00:00:00.000Z" }];
const units = [{ id: "50000000-0000-4000-8000-000000000001", code: "UNIT-001", name: "Organisation Unit 001", status: "ACTIVE", createdAt: "2026-07-01T00:00:00.000Z" }];
const frameworks = [{ id: "60000000-0000-4000-8000-000000000001", code: "FRM-001", name: "ISO 9001", version: "2025", description: "Quality management system", status: "ACTIVE" }];
const rules = [{ id: "70000000-0000-4000-8000-000000000001", frameworkId: frameworks[0]!.id, code: "RUL-001", title: "Documented information control", description: "Control documented information and retained evidence.", status: "ACTIVE" }];
const kpis = [{ id: "80000000-0000-4000-8000-000000000001", code: "KPI-001", name: "Customer Satisfaction Score", description: "Quarterly verified customer satisfaction.", unit: "%", direction: "HIGHER_IS_BETTER", frequency: "QUARTERLY", status: "ACTIVE" }];
const dashboardSummary = {
  kpis: {
    activeConfigurations: 9,
    meetingTarget: 3,
    amberActuals: 2,
    redActuals: 3,
    pendingApprovals: 1,
  },
  risks: {
    openRisks: 1,
    minorRisks: 2,
    majorRisks: 2,
    risksUnderTreatment: 1,
    closedRisks: 1,
  },
  organisation: {
    departments: 8,
    locations: 2,
    organisationUnits: 4,
  },
  frameworks: { activeFrameworks: 12 },
  registers: [{ code: "AUDIT", name: "Audit Schedule", recordCount: 12 }],
  recentActivity: [],
  latestImport: null,
  // The analytics section the submission dashboard renders. Values here are
  // the intercepted API response; the page must not compute them itself.
  analytics: {
    cards: {
      kpiDefinitions: 91,
      activeKpiConfigurations: 9,
      measuredKpis: 29,
      kpisMeetingTarget: 9,
      kpisMissingTarget: 20,
      pendingEvidence: 3,
      openRisks: 1,
      openGaps: 4,
      openCapas: 5,
      policiesDueForReview: 2,
    },
    kpiTrend: [
      { period: "FY26-27 Q1", periodStart: "2026-04-01", measured: 29, meetingTarget: 9, targetTotal: 100, actualTotal: 80 },
    ],
    evidenceStatus: [{ status: "APPROVED", count: 2 }, { status: "DRAFT", count: 18 }],
    frameworkCompliance: [
      { id: "60000000-0000-4000-8000-000000000001", code: "FRM-001", name: "ISO 9001", version: "2025", scopeStatus: "Active – In Scope", ruleCount: 12, mappedControls: 0, implementedControls: 0, openGaps: 1, compliancePercentage: null },
    ],
    riskHeatMap: { cells: [{ likelihood: 3, impact: 4, count: 1 }], maxLikelihood: 3, maxImpact: 4, total: 1 },
    capaAging: [{ key: "OVERDUE_1_30", label: "Overdue 1–30 days", count: 1 }],
    recentKpiRisks: [],
    capasDueSoon: [],
    policiesDueForReview: { total: 2, overdue: 1, horizonDays: 90, items: [] },
    actionQueue: [
      { key: "gap-open", label: "Open Gaps", description: "Compliance gaps still awaiting remediation.", count: 4, to: "/compliance/gaps", tone: "amber" },
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
  },
};

const identity = (activeCompany = companies[0]!) => ({
  id: users[0]!.id,
  code: users[0]!.code,
  name: users[0]!.name,
  email: users[0]!.email,
  phone: users[0]!.phone,
  status: "ACTIVE",
  lastLogin: users[0]!.lastLogin,
  permissions: ["*"],
  activeCompany: { id: activeCompany.id, code: activeCompany.code, name: activeCompany.name },
  companies: companies.map(({ id, code, name }) => ({ id, code, name })),
});

const success = (data: unknown) => ({ success: true, data });
const SERVICE_UNAVAILABLE_COPY =
  "The service is temporarily unavailable. Please retry when the connection is restored.";

async function installMockApi(
  page: Page,
  startAuthenticated: boolean,
  undeclaredWrites: string[] = [],
  summary: unknown = dashboardSummary,
) {
  let authenticated = startAuthenticated;
  let activeCompany = companies[0]!;
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      request.method() !== "GET" &&
      !path.startsWith("/api/v1/auth/")
    ) {
      undeclaredWrites.push(`${request.method()} ${path}`);
    }
    if (path === "/api/v1/auth/refresh") {
      if (!authenticated) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid refresh token" } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "mock-access-token", user: identity(activeCompany) })) });
    }
    if (path === "/api/v1/auth/login") {
      authenticated = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "mock-access-token", user: identity(activeCompany) })) });
    }
    if (path === "/api/v1/auth/logout") {
      authenticated = false;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ loggedOut: true })) });
    }
    if (path === "/api/v1/auth/tenant-context") {
      const payload = request.postDataJSON() as { companyId: string };
      activeCompany = companies.find((company) => company.id === payload.companyId) ?? activeCompany;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success({ accessToken: "switched-access-token", user: identity(activeCompany) })) });
    }
    const data = path === "/api/v1/tenants" ? companies
      : path === "/api/v1/dashboard/summary" ? summary
      : path === "/api/v1/users" ? users
        : path.startsWith("/api/v1/users/") ? users.find((user) => path.endsWith(user.id))
          : path === "/api/v1/organisation/departments" ? departments
            : path === "/api/v1/organisation/locations" ? locations
              : path === "/api/v1/organisation/units" ? units
                : path === "/api/v1/frameworks" ? frameworks
                  : path.endsWith("/rules") ? rules
                    : path.startsWith("/api/v1/frameworks/") ? frameworks[0]
                      : path === "/api/v1/kpi-definitions" ? kpis
                        : path === "/api/v1/kpis/catalogue" ? [{
                            id: "80000000-0000-4000-8000-000000000001",
                            code: "KPI-001",
                            name: "Customer Satisfaction Score",
                            description: "Quarterly verified customer satisfaction.",
                            unit: "%",
                            direction: "HIGHER_IS_BETTER",
                            frequency: "QUARTERLY",
                            status: "ACTIVE",
                            perspective: null,
                            framework: null,
                            configurationCount: 1,
                            activeConfigurationCount: 1,
                            configurationStatus: "ACTIVE",
                            owners: ["User One"],
                            departments: ["Quality"],
                          }]
                        : path === "/api/v1/kpis/frequencies" ? [{
                            code: "QUARTERLY",
                            definitionCount: 1,
                            configurationCount: 1,
                            activeConfigurationCount: 1,
                          }]
                          : path === "/api/v1/kpis/analytics" ? {
                              generatedAt: "2026-08-06T00:00:00.000Z",
                              filters: {
                                frequency: null,
                                ownerId: null,
                                departmentId: null,
                                period: null,
                              },
                              summary: {
                                measured: 29,
                                meetingTarget: 9,
                                missingTarget: 20,
                                achievementRate: 31,
                              },
                              ragDistribution: [
                                { status: "GREEN", count: 9 },
                                { status: "AMBER", count: 10 },
                                { status: "RED", count: 10 },
                              ],
                              trend: [
                                {
                                  period: "FY26-27 Q1",
                                  periodStart: "2026-04-01",
                                  measured: 29,
                                  meetingTarget: 9,
                                  achievementRate: 31,
                                },
                              ],
                              departmentDistribution: [
                                {
                                  id: "30000000-0000-4000-8000-000000000001",
                                  code: "QA",
                                  name: "Quality",
                                  measured: 10,
                                },
                              ],
                              missedKpis: [],
                            }
                            : path === "/api/v1/access/profiles" ? {
                                profiles: [
                                  {
                                    code: "COMPLIANCE_MANAGER",
                                    name: "Compliance Manager",
                                    description: "Compliance configuration and reporting",
                                    provisioned: true,
                                    enabled: true,
                                    userCount: 1,
                                    permissions: ["dashboard:read", "users:read"],
                                    permissionCount: 2,
                                  },
                                ],
                                additionalRoles: [],
                                permissions: [
                                  {
                                    code: "dashboard:read",
                                    description: "Read dashboard",
                                    module: "dashboard",
                                  },
                                  {
                                    code: "users:read",
                                    description: "Read users",
                                    module: "users",
                                  },
                                ],
                                mutable: false,
                              }
                              : path === "/api/v1/reports" ? [
                                  {
                                    key: "kpi-variance",
                                    name: "KPI Variance",
                                    description: "Target versus actual achievement",
                                    filters: ["period", "departmentId"],
                                    permissions: ["kpis:read"],
                                    available: true,
                                  },
                                ]
                                : path.startsWith("/api/v1/reports/") ? {
                                    key: "kpi-variance",
                                    name: "KPI Variance",
                                    generatedAt: "2026-08-06T00:00:00.000Z",
                                    filters: {},
                                    summary: [],
                                    columns: [{ key: "code", label: "KPI" }],
                                    rows: [],
                                  }
                        : path === "/api/v1/kpi-goals" ? []
                          : path === "/api/v1/kpi-configurations" ? []
                            : path === "/api/v1/kpi-targets" ? []
                              : path === "/api/v1/policies" || path === "/api/v1/controls" || path === "/api/v1/checkpoints" || path === "/api/v1/evidence" || path === "/api/v1/evidence/review-queue" || path === "/api/v1/gaps" || path === "/api/v1/capas" || path === "/api/v1/imports" || path === "/api/v1/audit-events" || path === "/api/v1/operational-registers" || path === "/api/v1/imports/csv/templates" ? []
                                : path === "/api/v1/integrations/genrac/status" ? {
                                  connection: {
                                    id: "90000000-0000-4000-8000-000000000001",
                                    systemCode: "GENRAC",
                                    displayName: "GenRAC",
                                    connectorType: "CSV_FILE",
                                    status: "NOT_CONFIGURED",
                                    secretRefKeys: [],
                                    config: {},
                                    lastTestedAt: null,
                                    lastTestSuccess: null,
                                    lastTestMessage: null,
                                    lastSuccessfulSyncAt: null,
                                    lastAttemptedSyncAt: null,
                                    configurationExplanation:
                                      "GenRAC credentials and connection settings are not configured. Live REST/database sync remains unavailable.",
                                  },
                                  mappingCount: 0,
                                  lastSyncRun: null,
                                  liveAccess: false,
                                  adapters: { csvFile: false, rest: false, postgresReadonly: false },
                                }
                                  : path === "/api/v1/integrations/genrac/history" ? []
                                    : null;
    if (data === null || data === undefined) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }) });
    if (
      path === "/api/v1/policies" ||
      path === "/api/v1/controls" ||
      path === "/api/v1/checkpoints" ||
      path === "/api/v1/evidence" ||
      path === "/api/v1/evidence/review-queue" ||
      path === "/api/v1/gaps" ||
      path === "/api/v1/capas" ||
      path === "/api/v1/imports" ||
      path === "/api/v1/audit-events" ||
      path === "/api/v1/operational-registers" ||
      path === "/api/v1/imports/csv/templates" ||
      path === "/api/v1/integrations/genrac/history"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success(data)) });
  });
}

async function navigateInApp(page: Page, path: string) {
  // Full navigation keeps React Router and mocked APIs in sync for sibling
  // routes (for example /kpi/catalogue → /kpi/analytics). pushState alone can
  // leave the previous page mounted under the Vite library router.
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(
    new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  );
}

test("login, secure storage, Company switch and API-backed master screens", async ({ page }) => {
  test.setTimeout(90_000);
  await installMockApi(page, false);
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin001@example.test");
  await page.locator("#login-password").fill("Synthetic001!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Active KPI Configurations")).toBeVisible();
  await expect(
    page.getByLabel(/Active KPI Configurations: 9/),
  ).toBeVisible();
  const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const storedText = JSON.stringify(stored);
  const storageContainsSecretValue = [
    "Synthetic001!",
    "mock-access-token",
  ].some((value) => storedText.includes(value));
  const storageContainsSecretKey = Object.values(stored)
    .flatMap((storage) => Object.keys(storage))
    .some((key) => key === "refreshToken" || key === "refresh_token");
  expect(storageContainsSecretValue).toBe(false);
  expect(storageContainsSecretKey).toBe(false);

  const companySelect = page.locator("#company-switcher");
  await expect(companySelect.locator("option")).toHaveCount(3);
  await companySelect.selectOption(companies[1]!.id);
  await expect(page.getByText("Company context changed")).toBeVisible();

  for (const [path, heading] of [
    ["/admin/companies", "Company Setup"],
    ["/admin/users", "User Management"],
    ["/admin/departments", "Department Setup"],
    ["/admin/locations", "Location Setup"],
    ["/admin/organisation-units", "Organisation Units"],
    ["/master/frameworks", "Framework Master"],
  ] as const) {
    await navigateInApp(page, path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator(".page-head")).toBeVisible();
  }

  await navigateInApp(page, "/admin/users");
  await page.getByRole("button", { name: `View ${users[0]!.id}` }).click();
  await expect(page.getByText("Database-authoritative Company user detail.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await navigateInApp(page, "/master/frameworks");
  await page.getByRole("button", { name: `View ${frameworks[0]!.id}` }).click();
  await expect(page).toHaveURL(new RegExp(`/master/frameworks/${frameworks[0]!.id}/rules$`));
  await expect(page.getByText("RUL-001")).toBeVisible();
});

const approvedGroups = [
  "Overview",
  "Administration",
  "Master Data",
  "KPI Management",
  "Compliance Management",
  "Evidence Management",
  "Data Management",
  "Audit & Reporting",
];

/** Must match `clientNavigationPaths` in routeDefinitions.ts (44 LIVE nav paths). */
const approvedPaths = [
  "/dashboard",
  "/admin/companies",
  "/admin/users",
  "/admin/roles",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/users",
  "/master/frequencies",
  "/master/targets",
  "/master/frameworks",
  "/master/rules",
  "/master/policies",
  "/master/controls",
  "/master/kpis",
  "/kpi/catalogue",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/kpi/analytics",
  "/compliance/frameworks",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/compliance/policy-register",
  "/compliance/risks",
  "/compliance/gaps",
  "/compliance/capa",
  "/evidence",
  "/evidence/new",
  "/evidence/review",
  "/evidence/approved",
  "/evidence/rejected",
  "/data/import",
  "/data/import-history",
  "/data/genrac-integration",
  "/audit-trail",
  "/compliance/operational-registers",
  "/reports",
  "/reports/kpi-variance",
  "/reports/framework-compliance",
  "/reports/evidence-status",
  "/reports/gaps",
  "/reports/audit-activity",
];

const livePaths = [
  ["/dashboard", "Dashboard"],
  ["/admin/companies", "Company Setup"],
  ["/admin/users", "User Management"],
  ["/admin/roles", "Role & Access"],
  ["/admin/departments", "Department Setup"],
  ["/admin/locations", "Location Setup"],
  ["/admin/organisation-units", "Organisation Units"],
  ["/master/users", "User Management"],
  ["/master/frequencies", "Frequency Master"],
  ["/master/targets", "KPI Targets"],
  ["/master/policies", "Policy Register"],
  ["/master/controls", "Control Register"],
  ["/master/kpis", "KPI Catalogue"],
  ["/master/frameworks", "Framework Master"],
  ["/master/rules", "Framework Rules"],
  ["/compliance/frameworks", "Framework Master"],
  ["/kpi/catalogue", "KPI Catalogue"],
  ["/kpi/analytics", "KPI Analytics"],
  ["/kpi/configuration", "KPI Configuration"],
  ["/kpi/targets", "KPI Targets"],
  ["/kpi/actual-entry", "KPI Actual Entry"],
  ["/kpi/approval", "KPI Approval"],
  ["/compliance/risks", "Risk Register"],
  ["/compliance/policy-register", "Policy Register"],
  ["/compliance/controls", "Control Register"],
  ["/compliance/checkpoints", "Checkpoint Register"],
  ["/compliance/gaps", "Gap Register"],
  ["/compliance/capa", "CAPA Register"],
  ["/audit-trail", "Audit Trail"],
  ["/compliance/operational-registers", "Operational Registers"],
  ["/data/import", "Data Import"],
  ["/data/import-history", "Import History"],
  ["/data/genrac-integration", "GenRAC Integration"],
  ["/evidence", "Evidence Library"],
  ["/evidence/new", "Create Evidence"],
  ["/evidence/review", "Evidence Review"],
  ["/evidence/approved", "Approved Evidence"],
  ["/evidence/rejected", "Rejected Evidence"],
  ["/reports", "Report Hub"],
] as const;

test("sidebar exposes the complete approved structure and truthful badges", async ({
  page,
}) => {
  await installMockApi(page, true);
  await page.goto("/dashboard");

  const groupLabels = await page
    .locator(".sidebar nav .nav-group-btn")
    .allTextContents();
  expect(groupLabels.map((label) => label.trim())).toEqual(approvedGroups);

  const hrefs = await page
    .locator(".sidebar nav a")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  expect(hrefs).toEqual(approvedPaths);
  // Client navigation is LIVE-only — no In Development or Awaiting Access badges.
  await expect(page.locator(".nav-status-badge")).toHaveCount(0);
  await expect(page.getByTestId("nav-status-/data/genrac-integration")).toHaveCount(
    0,
  );
  // Role & Access is a real read-only page in this release, so it is visible.
  await expect(page.locator('a[href="/admin/roles"]')).toHaveCount(1);
  await expect(page.locator('a[href="/tasks"]')).toHaveCount(0);
  await expect(page.locator('a[href="/notifications"]')).toHaveCount(0);
  await expect(page.locator('a[href="/settings/tenant"]')).toHaveCount(0);
  await expect(page.locator('a[href="/master/customers"]')).toHaveCount(0);
  await expect(page.locator('a[href="/analytics/customers"]')).toHaveCount(0);
  await expect(page.locator('a[href="/reports/deals"]')).toHaveCount(0);
  await expect(page.locator('a[href="/reports/attribution"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reports & Analytics", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('a[href="/dashboard"] .nav-status-badge')).toHaveCount(
    0,
  );
});

test("live navigation remains API-backed and never shows development status", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await installMockApi(page, true);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  for (const [path, heading] of livePaths) {
    await navigateInApp(page, path);
    await expect(page.locator(".page-head h1")).toContainText(heading, {
      timeout: 15_000,
    });
    await expect(page.locator(".sidebar nav a.active")).toHaveCount(1);
    await expect(page.locator(`.sidebar nav a[href="${path}"]`)).toHaveClass(
      /active/,
    );
    await expect(page.getByTestId("module-status-page")).toHaveCount(0);
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
  }

  await navigateInApp(page, "/master/rules");
  await page.getByRole("button", { name: `View ${frameworks[0]!.id}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/master/frameworks/${frameworks[0]!.id}/rules$`),
  );
  await expect(page.getByText("RUL-001")).toBeVisible();
});

test("unfinished and compatibility routes use truthful non-operational status pages without writes or console errors", async ({
  page,
}) => {
  const undeclaredWrites: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installMockApi(page, true, undeclaredWrites);
  await page.goto("/dashboard");

  for (const [path, expectedStatus] of [
    ["/kpi/dashboard", "development"],
    ["/kpi/mapping", "development"],
    ["/settings/tenant", "development"],
    ["/compliance/policy-versions", "compatibility"],
    ["/master/customers", "compatibility"],
    ["/upload/evidence-master", "compatibility"],
  ] as const) {
    await navigateInApp(page, path);
    const statusPage = page.getByTestId("module-status-page");
    await expect(statusPage).toBeVisible();
    if (expectedStatus === "compatibility") {
      await expect(
        page.getByTestId("compatibility-status-message"),
      ).toBeVisible();
      await expect(
        statusPage.getByText("Compatibility Route", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(page.getByTestId("development-status-message")).toBeVisible();
      await expect(
        statusPage.getByText("In Development", { exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator(".data-table")).toHaveCount(0);
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(page.getByText(/Prototype simulation/)).toHaveCount(0);
  }

  expect(undeclaredWrites).toEqual([]);
  // Parallel suite pressure can surface transient Chromium network-suspension
  // console lines during full document navigations. Those are not application
  // errors and must not fail the truthful status-page contract.
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes("ERR_NETWORK_IO_SUSPENDED") &&
        !message.includes("net::ERR_ABORTED"),
    ),
  ).toEqual([]);
});

test("GenRAC Integration shows Not configured without claiming live access", async ({
  page,
}) => {
  await installMockApi(page, true);
  await page.goto("/data/genrac-integration");

  await expect(page.getByTestId("module-status-page")).toHaveCount(0);
  await expect(page.getByTestId("genrac-status")).toBeVisible();
  await expect(page.getByTestId("genrac-not-configured")).toContainText(
    "Not configured",
  );
  await expect(page.getByText("Awaiting GenRAC Access")).toHaveCount(0);
  await expect(page.getByText("Awaiting Access")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview Changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run Sync" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preview Changes" })).toHaveAttribute(
    "title",
    /Not configured/,
  );
  await expect(page.getByRole("button", { name: "Run Sync" })).toHaveAttribute(
    "title",
    /Not configured/,
  );
});

test("sidebar groups, keyboard navigation and current-route highlighting work", async ({
  page,
}) => {
  await installMockApi(page, true);
  await page.goto("/dashboard");
  if ((page.viewportSize()?.width ?? 1280) <= 900) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }

  const administration = page.getByRole("button", {
    name: "Administration",
    exact: true,
  });
  await expect(administration).toHaveAttribute("aria-expanded", "true");
  await administration.focus();
  await page.keyboard.press("Enter");
  await expect(administration).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(administration).toHaveAttribute("aria-expanded", "true");

  const usersLink = page.locator('.sidebar a[href="/admin/users"]');
  await usersLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(usersLink).toHaveClass(/active/);
  await expect(
    page.locator('.nav-group[data-group="administration"]'),
  ).toHaveClass(/active-group/);
});

test("mobile navigation contains the same approved modules and closes after use", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, true);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.getByText("PERN · React", { exact: true })).toHaveCount(0);

  const mobileGeometry = await page.locator(".sidebar").evaluate((sidebar) => {
    const group = sidebar.querySelector(".nav-group-btn");
    const icon = group?.querySelector(".nav-icon");
    const label = group?.querySelector(".nav-group-label");
    const link = sidebar.querySelector(".nav-children .nav-link");
    const rect = (element: Element | null | undefined) =>
      element?.getBoundingClientRect();
    return {
      width: rect(sidebar)?.width ?? 0,
      iconLabelGap:
        icon && label ? (rect(label)?.left ?? 0) - (rect(icon)?.right ?? 0) : 0,
      linkInset: link ? (rect(link)?.left ?? 0) - (rect(sidebar)?.left ?? 0) : 0,
    };
  });
  expect(mobileGeometry.width).toBeLessThanOrEqual(264.5);
  expect(mobileGeometry.iconLabelGap).toBeLessThanOrEqual(8.5);
  expect(mobileGeometry.linkInset).toBeLessThanOrEqual(18);

  const hrefs = await page
    .locator(".sidebar nav a")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  expect(hrefs).toEqual(approvedPaths);

  await page.locator('.sidebar a[href="/admin/users"]').click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
});

test("every approved direct route remains reachable without horizontal overflow", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await installMockApi(page, true);
  await page.goto("/dashboard");
  // Auth restoration is asynchronous and may replace the document after the
  // initial load event. Wait for the protected route to settle before using
  // history.pushState in the direct-route loop.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const path of approvedPaths) {
    await navigateInApp(page, path);
    await expect(page.locator("main#page-content")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Page not found")).toHaveCount(0);
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  }
});

test("logout still survives a page reload from a status route", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installMockApi(page, true);
  await page.goto("/admin/roles");
  await expect(page.getByRole("heading", { name: "Role & Access" })).toBeVisible();
  await page.getByRole("button", { name: "User profile" }).click();
  await page
    .locator(".profile-menu")
    .getByRole("button", { name: "Sign Out" })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});

async function assertDashboardKeyboardDestinations(
  page: Page,
  selector: string,
  destinations: readonly string[],
  offset: number,
  expectedControlCount: number,
) {
  const cards = page.locator(selector);
  await expect(cards).toHaveCount(expectedControlCount);
  for (let index = 0; index < destinations.length; index += 1) {
    const destination = destinations[index]!;
    const controlIndex = offset + index;
    await test.step(
      `dashboard control ${controlIndex + 1} reaches ${destination}`,
      async () => {
        await expect(cards).toHaveCount(expectedControlCount);
        const link = cards.nth(controlIndex);
        await expect(link).toBeVisible();
        await link.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(
          new RegExp(`${destination.replaceAll("/", "\\/")}$`),
        );
        await page.goto("/dashboard");
        await expect(page.getByTestId("dashboard-cards")).toBeVisible();
        await expect(page.locator(selector)).toHaveCount(expectedControlCount);
      },
    );
  }
}

test("dashboard summary cards reach their live routes by keyboard", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockApi(page, true);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-cards")).toBeVisible();

  // One card per required submission metric, each linking to the register it
  // counted. The order is the order the cards are rendered in.
  await assertDashboardKeyboardDestinations(
    page,
    ".dashboard-cards a",
    [
      "/kpi/catalogue",
      "/kpi/configuration",
      "/kpi/analytics",
      "/kpi/analytics",
      "/kpi/analytics",
      "/evidence/review",
      "/compliance/risks",
      "/compliance/gaps",
      "/compliance/capa",
      "/compliance/policy-register",
    ],
    0,
    10,
  );
});

test("dashboard visualisation sections link to the registers they summarise", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockApi(page, true);
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
    await expect(page.getByTestId(testId)).toBeVisible();
  }

  await page.getByTestId("dashboard-evidence-status").getByRole("link", { name: "Evidence Library" }).click();
  await expect(page).toHaveURL(/\/evidence$/);
  await page.goto("/dashboard");
  await page
    .getByTestId("dashboard-framework-compliance")
    .getByRole("link", { name: "Frameworks" })
    .click();
  await expect(page).toHaveURL(/\/master\/frameworks$/);
});

test("desktop header controls are truthful, close correctly and do not write", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const undeclaredWrites: string[] = [];
  await installMockApi(page, true, undeclaredWrites);
  await page.goto("/dashboard");

  const notificationButton = page.getByRole("button", {
    name: "Notifications",
  });
  await notificationButton.click();
  const notifications = page.getByRole("dialog", { name: "Notifications" });
  await expect(notifications).toBeVisible();
  await expect(notifications).toContainText("1 pending KPI approval");
  await expect(notifications).toContainText("1 open · 2 major risks");
  expect(undeclaredWrites).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(notifications).toBeHidden();
  await notificationButton.click();
  await page.locator(".page-head h1").click();
  await expect(notifications).toBeHidden();

  await notificationButton.click();
  await page.locator("#company-switcher").selectOption(companies[1]!.id);
  await expect(notifications).toBeHidden();

  await page.getByRole("button", { name: "KPI Approval Centre" }).click();
  await expect(page).toHaveURL(/\/kpi\/approval$/);
  await page.goto("/dashboard");

  const routeSearch = page.getByPlaceholder("Search pages and modules");
  await routeSearch.fill("Policy Register");
  const policyResult = page.getByRole("option", { name: /Policy Register/ });
  await expect(policyResult).toContainText("Live");
  await expect(policyResult).not.toContainText("In Development");
  await policyResult.click();
  await expect(page).toHaveURL(/\/compliance\/policy-register$/);
  await expect(page.getByRole("heading", { name: "Policy Register" })).toBeVisible();
  await expect(page.getByTestId("module-status-page")).toHaveCount(0);

  // User Master is a real navigation entry now, so it must be findable.
  await page.goto("/dashboard");
  await routeSearch.fill("User Master");
  await expect(
    page.getByRole("option", { name: /User Master/ }),
  ).toContainText("Live");

  // Customer Master remains a hidden compatibility URL and must stay unfindable.
  await page.goto("/dashboard");
  await routeSearch.fill("Customer Master");
  await expect(page.locator(".global-search .search-results")).toHaveCount(0);
});

test("notification fallback is explicit when no supported summary is available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const undeclaredWrites: string[] = [];
  await installMockApi(page, true, undeclaredWrites, {
    kpis: null,
    risks: null,
    organisation: null,
    frameworks: null,
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications" }).click();
  const notifications = page.getByRole("dialog", { name: "Notifications" });
  await expect(
    notifications.getByText(
      "No notification feed is configured for this UAT release.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    notifications.getByRole("button", { name: "KPI Approval" }),
  ).toBeVisible();
  await expect(
    notifications.getByRole("button", { name: "Risk Register" }),
  ).toBeVisible();
  expect(undeclaredWrites).toEqual([]);
});

test("mobile route search opens, identifies status, navigates and closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page, true);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Open global search" }).click();
  const searchDialog = page.getByRole("dialog", {
    name: "Search pages and modules",
  });
  await expect(searchDialog).toBeVisible();
  const input = searchDialog.getByPlaceholder("Search pages and modules");
  await input.fill("GenRAC");
  const result = searchDialog.getByRole("option", {
    name: /GenRAC Integration/,
  });
  await expect(result).toContainText("Live");
  await expect(result).not.toContainText("Awaiting");
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/data\/genrac-integration$/);
  await expect(searchDialog).toBeHidden();
  await expect(page.getByTestId("genrac-not-configured")).toBeVisible();

  await page.getByRole("button", { name: "Open global search" }).click();
  await page.keyboard.press("Escape");
  await expect(searchDialog).toBeHidden();
});

for (const outage of ["network", "500"] as const) {
  test(`protected routes show retry and recover after refresh ${outage} failure without a loop`, async ({
    page,
  }) => {
    let available = false;
    let refreshRequests = 0;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/auth/refresh") {
        refreshRequests += 1;
        if (!available) {
          if (outage === "network") return route.abort("failed");
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: { code: "INTERNAL_ERROR", message: "Unavailable" },
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({ accessToken: "recovered-access-token", user: identity() }),
          ),
        });
      }
      if (path === "/api/v1/dashboard/summary") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(dashboardSummary)),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "NOT_FOUND", message: "Not found" },
        }),
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("alert").getByText("Service temporarily unavailable"),
    ).toBeVisible();
    expect(refreshRequests).toBe(1);
    await page.waitForTimeout(300);
    expect(refreshRequests).toBe(1);

    available = true;
    await page.getByRole("button", { name: "Retry connection" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(refreshRequests).toBe(2);
  });
}

for (const invalidCase of [
  ["invalid refresh token", "Invalid refresh token"],
  ["revoked session", "Refresh token reuse detected"],
] as const) {
  test(`explicit ${invalidCase[0]} still redirects to login`, async ({
    page,
  }) => {
    let refreshRequests = 0;
    await page.route("**/api/v1/auth/refresh", async (route) => {
      refreshRequests += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "UNAUTHORIZED", message: invalidCase[1] },
        }),
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(refreshRequests).toBe(1);
  });
}

test("an authenticated shell survives a transient refresh failure and recovers", async ({
  page,
}) => {
  let refreshRequests = 0;
  let recovered = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/refresh") {
      refreshRequests += 1;
      if (refreshRequests >= 2 && !recovered) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Unavailable" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "active-access-token", user: identity() }),
        ),
      });
    }
    if (path === "/api/v1/dashboard/summary") {
      if (!recovered) {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Access token expired" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(dashboardSummary)),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      }),
    });
  });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(SERVICE_UNAVAILABLE_COPY)).toBeVisible();
  expect(refreshRequests).toBe(2);
  await page.waitForTimeout(300);
  expect(refreshRequests).toBe(2);

  recovered = true;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Active KPI Configurations")).toBeVisible();
  expect(refreshRequests).toBe(3);
});
