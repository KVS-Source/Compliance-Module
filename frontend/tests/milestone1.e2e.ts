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

async function installMockApi(page: Page, startAuthenticated: boolean) {
  let authenticated = startAuthenticated;
  let activeCompany = companies[0]!;
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
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

const preservedPaths = [
  "/dashboard", "/admin/users", "/admin/roles", "/admin/companies", "/admin/departments", "/admin/locations", "/admin/organisation-units",
  "/master/users", "/master/frequencies", "/master/targets", "/master/customers", "/master/frameworks", "/master/controls", "/master/policies", "/master/rules", "/master/kpis",
  "/kpi/mapping", "/kpi/configuration", "/kpi/actual-entry", "/kpi/approval", "/kpi/dashboard",
  "/compliance/frameworks", "/compliance/controls", "/compliance/checkpoints", "/compliance/policy-register", "/compliance/gaps", "/compliance/capa", "/compliance/risks",
  "/upload/policy-master", "/upload/evidence-master", "/upload/kpi-data", "/upload/customer-data", "/upload/audit-reports",
  "/evidence/register", "/evidence/review", "/evidence/approved", "/evidence/rejected",
  "/analytics/customers", "/analytics/kpis", "/reports", "/reports/compliance", "/reports/evidence", "/reports/audit", "/reports/attribution", "/reports/deals", "/reports/customer-outcomes", "/audit-trail", "/settings",
];

test("every approved route remains reachable on desktop and mobile", async ({ page }) => {
  test.setTimeout(120_000);
  await installMockApi(page, true);
  await page.goto("/dashboard");
  await expect(page.locator("#page-content")).toBeVisible();
  for (const path of preservedPaths) {
    await navigateInApp(page, path);
    await expect(page.locator("#page-content")).toBeVisible();
    await expect(page.getByText("Page not found")).toHaveCount(0);
    await expect(page.getByText("Route preserved for its scheduled React migration phase")).toHaveCount(0);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  }
});
