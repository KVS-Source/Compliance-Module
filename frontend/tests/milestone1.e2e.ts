import { expect, test, type Page, type Route } from "@playwright/test";

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

async function installMockApi(
  page: Page,
  startAuthenticated: boolean,
  undeclaredWrites: string[] = [],
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
      : path === "/api/v1/dashboard/summary" ? dashboardSummary
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
                              : null;
    if (data === null || data === undefined) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }) });
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
  expect(JSON.stringify(stored)).not.toContain("Admin001!Secure");
  expect(JSON.stringify(stored)).not.toContain("mock-access-token");
  expect(JSON.stringify(stored)).not.toContain("refreshToken");

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
  await expect(page.locator(".nav-status-badge")).toHaveCount(30);
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

test("unfinished routes use one non-operational status page without writes or console errors", async ({
  page,
}) => {
  const undeclaredWrites: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installMockApi(page, true, undeclaredWrites);
  await page.goto("/dashboard");

  for (const path of [
    "/admin/roles",
    "/compliance/policy-register",
    "/kpi/dashboard",
    "/kpi/mapping",
    "/evidence/register",
    "/compliance/gaps",
    "/audit-trail",
    "/data/import",
    "/reports",
    "/settings/tenant",
    "/upload/evidence-master",
  ]) {
    await navigateInApp(page, path);
    const statusPage = page.getByTestId("module-status-page");
    await expect(statusPage).toBeVisible();
    await expect(page.getByTestId("development-status-message")).toBeVisible();
    await expect(
      statusPage.getByText("In Development", { exact: true }),
    ).toBeVisible();
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
    await expect(page.locator("#page-content")).toBeVisible();
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
