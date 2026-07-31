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
                        : path === "/api/v1/kpi-goals" ? []
                          : path === "/api/v1/kpi-configurations" ? []
                            : path === "/api/v1/kpi-targets" ? []
                              : path === "/api/v1/policies" || path === "/api/v1/controls" || path === "/api/v1/checkpoints" ? []
                                : null;
    if (data === null || data === undefined) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }) });
    if (path === "/api/v1/policies" || path === "/api/v1/controls" || path === "/api/v1/checkpoints") {
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
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
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
  await expect(page.getByText("9", { exact: true })).toBeVisible();
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
  "Dashboard",
  "Administration",
  "Frameworks & Rules",
  "Policies & Controls",
  "KPI Management",
  "Risk Management",
  "Evidence Management",
  "Gap & CAPA",
  "Audit & Operations",
  "Data Management",
  "Reports & Analytics",
  "Settings",
];

const approvedPaths = [
  "/dashboard",
  "/admin/companies",
  "/admin/users",
  "/admin/roles",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/frameworks",
  "/master/framework-rules",
  "/compliance/policy-register",
  "/compliance/policy-versions",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/master/kpis",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/kpi/dashboard",
  "/kpi/mapping",
  "/compliance/risks",
  "/evidence/register",
  "/evidence/upload",
  "/evidence/review",
  "/evidence/approved",
  "/evidence/rejected",
  "/compliance/gaps",
  "/compliance/gaps/review",
  "/compliance/capa",
  "/compliance/capa/review",
  "/audit-trail",
  "/tasks",
  "/notifications",
  "/data/import",
  "/data/import-history",
  "/data/upload-errors",
  "/data/genrac-integration",
  "/reports",
  "/reports/kpi-performance",
  "/reports/risk-summary",
  "/reports/compliance-summary",
  "/settings/tenant",
  "/settings/integrations",
];

const livePaths = [
  ["/dashboard", "Dashboard"],
  ["/admin/companies", "Company Setup"],
  ["/admin/users", "User Management"],
  ["/admin/departments", "Department Setup"],
  ["/admin/locations", "Location Setup"],
  ["/admin/organisation-units", "Organisation Units"],
  ["/master/frameworks", "Framework Master"],
  ["/master/framework-rules", "Framework Rules"],
  ["/kpi/configuration", "KPI Configuration"],
  ["/kpi/targets", "KPI Targets"],
  ["/kpi/actual-entry", "KPI Actual Entry"],
  ["/kpi/approval", "KPI Approval"],
  ["/compliance/risks", "Risk Register"],
  ["/compliance/policy-register", "Policy Register"],
  ["/compliance/controls", "Control Register"],
  ["/compliance/checkpoints", "Checkpoint Register"],
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
  await expect(page.locator(".nav-status-badge")).toHaveCount(27);
  await expect(
    page.getByTestId("nav-status-/data/genrac-integration"),
  ).toHaveText("Awaiting Access");
  await expect(page.getByTestId("nav-status-/admin/roles")).toHaveText(
    "In Development",
  );
  await expect(page.locator('a[href="/dashboard"] .nav-status-badge')).toHaveCount(
    0,
  );
});

test("live navigation remains API-backed and never shows development status", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installMockApi(page, true);
  await page.goto("/dashboard");

  for (const [path, heading] of livePaths) {
    await navigateInApp(page, path);
    await expect(page.locator(".page-head h1")).toContainText(heading);
    await expect(page.getByTestId("module-status-page")).toHaveCount(0);
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
  }

  await navigateInApp(page, "/master/framework-rules");
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
    ["/admin/roles", "development"],
    ["/compliance/policy-versions", "development"],
    ["/kpi/dashboard", "development"],
    ["/kpi/mapping", "development"],
    ["/evidence/register", "development"],
    ["/compliance/gaps", "development"],
    ["/audit-trail", "development"],
    ["/data/import", "development"],
    ["/reports", "development"],
    ["/settings/tenant", "development"],
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
  expect(consoleErrors).toEqual([]);
});

test("GenRAC is visibly awaiting a client-provided read-only connection", async ({
  page,
}) => {
  await installMockApi(page, true);
  await page.goto("/data/genrac-integration");

  await expect(
    page
      .getByTestId("module-status-page")
      .getByText("Awaiting GenRAC Access", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("genrac-status-message")).toContainText(
    "independent systems",
  );
  await expect(page.getByTestId("genrac-status-message")).toContainText(
    "one-way, read-only",
  );
  await expect(page.getByText(/Client access and interface details are still pending/)).toBeVisible();
  await expect(page.getByText(/No live connection is configured/)).toBeVisible();
  await expect(page.locator(".data-table")).toHaveCount(0);
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

  const rolesLink = page.locator('.sidebar a[href="/admin/roles"]');
  await rolesLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/roles$/);
  await expect(rolesLink).toHaveClass(/active/);
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

  const hrefs = await page
    .locator(".sidebar nav a")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  expect(hrefs).toEqual(approvedPaths);

  await page.locator('.sidebar a[href="/admin/roles"]').click();
  await expect(page).toHaveURL(/\/admin\/roles$/);
  await expect(page.getByTestId("module-status-page")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
});

test("every approved direct route remains reachable without horizontal overflow", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await installMockApi(page, true);
  await page.goto("/dashboard");
  for (const path of approvedPaths) {
    await navigateInApp(page, path);
    await expect(page.locator("main#page-content")).toBeVisible();
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
  await installMockApi(page, true);
  await page.goto("/admin/roles");
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
  await expect(page.locator(selector)).toHaveCount(expectedControlCount);
  for (let index = 0; index < destinations.length; index += 1) {
    const destination = destinations[index]!;
    const controlIndex = offset + index;
    await test.step(
      `dashboard control ${controlIndex + 1} reaches ${destination}`,
      async () => {
        const link = page.locator(selector).nth(controlIndex);
        await link.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(
          new RegExp(`${destination.replaceAll("/", "\\/")}$`),
        );
        await page.goto("/dashboard");
      },
    );
  }
}

test("dashboard KPI metric cards reach their live routes by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockApi(page, true);
  await page.goto("/dashboard");

  await assertDashboardKeyboardDestinations(
    page,
    ".dashboard-cards a",
    [
      "/kpi/configuration",
      "/kpi/approval",
      "/kpi/approval",
      "/kpi/approval",
      "/kpi/approval",
    ],
    0,
    10,
  );
});

test("dashboard Risk metric cards reach their live routes by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockApi(page, true);
  await page.goto("/dashboard");

  await assertDashboardKeyboardDestinations(
    page,
    ".dashboard-cards a",
    [
      "/compliance/risks",
      "/compliance/risks",
      "/compliance/risks",
      "/compliance/risks",
      "/compliance/risks",
    ],
    5,
    10,
  );
});

test("dashboard administration and framework summaries reach their live routes by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockApi(page, true);
  await page.goto("/dashboard");

  await assertDashboardKeyboardDestinations(
    page,
    ".boundary-grid a",
    [
      "/admin/departments",
      "/admin/locations",
      "/admin/organisation-units",
      "/master/frameworks",
    ],
    0,
    4,
  );

  await page.getByRole("link", { name: "View all departments" }).click();
  await expect(page).toHaveURL(/\/admin\/departments$/);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "View all frameworks" }).click();
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

  await page.goto("/dashboard");
  await routeSearch.fill("User Master");
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
  await expect(result).toContainText("Awaiting GenRAC Access");
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/data\/genrac-integration$/);
  await expect(searchDialog).toBeHidden();

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
