/**
 * Report filter enum parity — every offered UI value must be accepted by the
 * API, and values that are not Prisma enums must not appear in the selects.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "GEN",
  name: "GenBioCa",
};

const success = (data: unknown) => ({ success: true, data });

const identity = () => ({
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
  email: "admin001@example.test",
  phone: null,
  status: "ACTIVE",
  lastLogin: null,
  permissions: ["*"],
  activeCompany: { id: company.id, code: company.code, name: company.name },
  companies: [{ id: company.id, code: company.code, name: company.name }],
});

const catalogue = [
  {
    key: "gaps",
    name: "Gaps",
    description: "Gap register",
    permissions: ["gaps:read"],
    filters: ["status", "severity", "frameworkId", "departmentId"],
    available: true,
  },
  {
    key: "risks",
    name: "Risks",
    description: "Risk register",
    permissions: ["risk:read"],
    filters: ["status"],
    available: true,
  },
];

const emptyReport = (key: string, filters: Record<string, string | null>) => ({
  key,
  name: key === "gaps" ? "Gaps" : "Risks",
  description: "Mocked report",
  generatedAt: "2026-08-06T12:00:00.000Z",
  filters,
  summary: [],
  chart: null,
  columns: [
    { key: "code", header: "Code" },
    { key: "status", header: "Status" },
  ],
  rows: [],
  rowCount: 0,
  rowLimit: 500,
  truncated: false,
});

async function installMocks(page: Page) {
  const requested: string[] = [];
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }
    if (path === "/api/v1/reports") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(catalogue)),
      });
    }
    if (path === "/api/v1/reports/gaps" || path === "/api/v1/reports/risks") {
      requested.push(`${path}?${url.searchParams.toString()}`);
      const key = path.endsWith("gaps") ? "gaps" : "risks";
      const filters: Record<string, string | null> = {
        status: url.searchParams.get("status"),
        severity: url.searchParams.get("severity"),
        priority: url.searchParams.get("priority"),
      };
      // Mirror the backend contract: unsupported enums must not be accepted.
      if (
        key === "gaps" &&
        (filters.severity === "MODERATE" || filters.status === "RESOLVED")
      ) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
          }),
        });
      }
      if (key === "risks" && filters.status === "ASSESSED") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(emptyReport(key, filters))),
      });
    }
    if (
      path === "/api/v1/organisation/departments" ||
      path === "/api/v1/frameworks"
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
    if (path === "/api/v1/tenants") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([company])),
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
  return requested;
}

const optionValues = async (page: Page, label: string) =>
  page.locator(`select[aria-label="${label}"] option`).evaluateAll((nodes) =>
    nodes
      .map((node) => (node as HTMLOptionElement).value)
      .filter((value) => value !== ""),
  );

test("Gaps and Risks report filters match Prisma enums", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page);
  await page.goto("/reports/gaps");
  await expect(page.getByRole("heading", { name: "Gaps" })).toBeVisible();
  await expect(page.getByText("Data could not be loaded")).toHaveCount(0);

  const severity = page.getByLabel("Filter by severity");
  const status = page.getByLabel("Filter by status");
  const severities = await optionValues(page, "Filter by severity");
  const statuses = await optionValues(page, "Filter by status");

  expect(severities).toEqual([
    "CRITICAL",
    "MAJOR",
    "MINOR",
    "OBSERVATION",
    "OFI",
  ]);
  expect(severities).not.toContain("MODERATE");
  expect(statuses).toEqual(["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"]);
  expect(statuses).not.toContain("RESOLVED");

  for (const value of severities) {
    await severity.selectOption(value);
    await expect(page.getByText("Data could not be loaded")).toHaveCount(0);
    await expect(page.getByTestId("report-generated")).toBeVisible();
  }
  for (const value of statuses) {
    await status.selectOption(value);
    await expect(page.getByText("Data could not be loaded")).toHaveCount(0);
    await expect(page.getByTestId("report-generated")).toBeVisible();
  }

  await page.goto("/reports/risks");
  await expect(page.getByRole("heading", { name: "Risks" })).toBeVisible();
  await expect(page.getByText("Data could not be loaded")).toHaveCount(0);

  const riskStatuses = await optionValues(page, "Filter by status");
  expect(riskStatuses).toEqual([
    "OPEN",
    "UNDER_REVIEW",
    "TREATED",
    "CLOSED",
    "ARCHIVED",
  ]);
  expect(riskStatuses).toContain("UNDER_REVIEW");
  expect(riskStatuses).not.toContain("ASSESSED");

  const riskStatus = page.getByLabel("Filter by status");
  for (const value of riskStatuses) {
    await riskStatus.selectOption(value);
    await expect(page.getByText("Data could not be loaded")).toHaveCount(0);
    await expect(page.getByTestId("report-generated")).toBeVisible();
  }
});
