/**
 * Risk Register UI Playwright suite.
 *
 * These tests use browser-level API mocks via Playwright `page.route` against
 * `/api/v1/**`. They are NOT browser-to-database end-to-end tests and do not
 * exercise Express/PostgreSQL.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};

const companyTwo = {
  id: "10000000-0000-4000-8000-000000000002",
  code: "COM-002",
  name: "Company 002",
};

const configuration = {
  id: "90000000-0000-4000-8000-000000000001",
  kpi: {
    id: "80000000-0000-4000-8000-000000000001",
    code: "KPI-001",
    name: "Customer Satisfaction Score",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
  },
  orgUnit: {
    id: "40000000-0000-4000-8000-000000000001",
    code: "OU-001",
    name: "Operations Unit",
  },
  orgLocation: {
    id: "50000000-0000-4000-8000-000000000001",
    code: "LOC-001",
    name: "Location 001",
  },
  productService: "Compliance Platform",
  department: {
    id: "30000000-0000-4000-8000-000000000001",
    code: "DEP-001",
    name: "Compliance",
  },
  owner: {
    id: "20000000-0000-4000-8000-000000000001",
    code: "USR-001",
    name: "User 001",
  },
  approver: null,
  enabled: true,
  currency: null,
  reviewFrequency: "QUARTERLY",
  amberThresholdPct: null,
  redThresholdPct: null,
  requiresEvidence: false,
  requiresApproval: true,
  effectiveFrom: "2026-04-01",
  effectiveTo: null,
  status: "ACTIVE",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const openRisk = {
  id: "93000000-0000-4000-8000-000000000001",
  code: "RSK-001",
  title: "KPI target missed: KPI-001 Customer Satisfaction Score (FY26-27 Q1)",
  description:
    "Auto-raised from KPI actual submission. Target snapshot: 100.0000; actual value: 80.0000; variance: -20.0000; RAG: RED.",
  category: null,
  kpiRiskClass: "MAJOR",
  generalLevel: "HIGH",
  inherentLikelihood: 4,
  inherentImpact: 4,
  inherentScore: 16,
  status: "OPEN",
  source: {
    actual: {
      id: "92000000-0000-4000-8000-000000000001",
      code: "ACT-001",
      period: "FY26-27 Q1",
      ragStatus: "RED",
      targetMet: false,
      actualValue: "80.0000",
      variance: "-20.0000",
      targetValueSnapshot: "100.0000",
    },
    configuration,
    target: {
      id: "91000000-0000-4000-8000-000000000001",
      code: "KTG-001",
      version: 1,
    },
  },
  residualLikelihood: null,
  residualImpact: null,
  residualScore: null,
  owner: null,
  treatmentStrategy: null,
  reviewDate: null,
  closedAt: null,
  closureReason: null,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

const closedRisk = {
  ...openRisk,
  id: "93000000-0000-4000-8000-000000000002",
  code: "RSK-002",
  title: "Closed historical KPI miss",
  status: "CLOSED",
  closedAt: "2026-07-20T00:00:00.000Z",
};

const manualRisk = {
  ...openRisk,
  id: "93000000-0000-4000-8000-000000000003",
  code: "RSK-003",
  title: "Manually raised enterprise risk",
  description: null,
  kpiRiskClass: null,
  source: {
    actual: null,
    configuration: null,
    target: null,
  },
};

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, error: { code, message } },
});

async function installRiskMock(
  page: Page,
  options: {
    permissions: string[];
    mode?: "populated" | "empty" | "filtered-empty" | "error" | "manual";
  },
) {
  const canRead =
    options.permissions.includes("*") ||
    options.permissions.includes("risk:read");
  const mode = options.mode ?? "populated";
  const mutatingCalls: string[] = [];
  const listUrls: string[] = [];
  let activeCompany = company;

  const identity = () => ({
    id: "20000000-0000-4000-8000-000000000001",
    code: "USR-001",
    name: "User 001",
    email: "admin001@example.test",
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions: options.permissions,
    activeCompany,
    companies: [company, companyTwo],
  });

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      if (
        path !== "/api/v1/auth/login" &&
        path !== "/api/v1/auth/refresh" &&
        path !== "/api/v1/auth/logout" &&
        path !== "/api/v1/auth/tenant-context"
      ) {
        mutatingCalls.push(`${method} ${path}`);
      }
    }

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }

    if (path === "/api/v1/auth/tenant-context" && method === "POST") {
      const body = request.postDataJSON() as { companyId: string };
      activeCompany =
        body.companyId === companyTwo.id ? companyTwo : company;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            accessToken: "mock-access-token",
            user: identity(),
          }),
        ),
      });
    }

    if (path === "/api/v1/risks" && method === "GET") {
      listUrls.push(request.url());
      if (!canRead) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      if (mode === "error") {
        const boom = failure(500, "INTERNAL", "Synthetic failure");
        return route.fulfill({
          status: boom.status,
          contentType: "application/json",
          body: JSON.stringify(boom.body),
        });
      }

      const lifecycle = url.searchParams.get("lifecycle") ?? "all";
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

      // Company 002 has no risks in this fixture set.
      let rows =
        activeCompany.id === companyTwo.id
          ? []
          : mode === "manual"
            ? [manualRisk]
            : mode === "empty" || mode === "filtered-empty"
              ? []
              : [openRisk, closedRisk];

      if (lifecycle === "active") {
        rows = rows.filter((row) =>
          ["OPEN", "UNDER_REVIEW", "TREATED"].includes(row.status),
        );
      } else if (lifecycle === "closed") {
        rows = rows.filter((row) =>
          ["CLOSED", "ARCHIVED"].includes(row.status),
        );
      }
      if (status) rows = rows.filter((row) => row.status === status);
      if (q) {
        rows = rows.filter((row) => {
          const haystack = [
            row.title,
            row.code,
            row.source.configuration?.kpi.code ?? "",
            row.source.configuration?.kpi.name ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
      }

      if (mode === "filtered-empty") rows = [];

      const total = rows.length;
      const start = (pageNumber - 1) * pageSize;
      const data = rows.slice(start, start + pageSize);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(data, {
            page: pageNumber,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
          }),
        ),
      });
    }

    const detailMatch = /^\/api\/v1\/risks\/([^/]+)$/.exec(path);
    if (detailMatch && method === "GET") {
      if (!canRead) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const id = detailMatch[1]!;
      const found = [openRisk, closedRisk, manualRisk].find(
        (row) => row.id === id,
      );
      if (!found || activeCompany.id === companyTwo.id) {
        const missing = failure(404, "NOT_FOUND", "Risk not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(found)),
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

  return { mutatingCalls, listUrls };
}

test.describe("Risk Register UI (mocked browser APIs)", () => {
  test("shows the live register without a prototype banner", async ({
    page,
  }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
      mode: "populated",
    });
    await page.goto("/compliance/risks");
    await expect(
      page.getByRole("heading", { name: "Risk Register" }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(
      page.getByText("RSK-001").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText("KPI target missed: KPI-001 Customer Satisfaction Score")
        .filter({ visible: true }),
    ).toBeVisible();
  });

  test("sends filters and search to the API and opens detail", async ({
    page,
  }) => {
    const { listUrls } = await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await page.getByLabel("Search risks by title, code or KPI").fill("RSK-001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect
      .poll(() =>
        listUrls.some(
          (url) =>
            url.includes("q=RSK-001") && url.includes("lifecycle=active"),
        ),
      )
      .toBeTruthy();

    await page.getByLabel("Active or historical risks").selectOption("closed");
    await expect
      .poll(() => listUrls.some((url) => url.includes("lifecycle=closed")))
      .toBeTruthy();

    await page.getByLabel("Active or historical risks").selectOption("active");
    await page.getByRole("button", { name: "View RSK-001" }).first().click();
    await expect(page).toHaveURL(
      /\/compliance\/risks\/93000000-0000-4000-8000-000000000001$/,
    );
    await expect(page.getByTestId("risk-automatic-origin")).toContainText(
      "raised automatically because a KPI target was missed",
    );
    await expect(page.getByText("Not yet assessed").first()).toBeVisible();
    await expect(page.getByText("ACT-001").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "ACT-001" })).toHaveCount(0);
    await expect(page.getByText("MAJOR").first()).toBeVisible();
    await expect(page.getByText("HIGH").first()).toBeVisible();
    await expect(page.getByText("KPI risk class")).toBeVisible();
    await expect(page.getByText("General level")).toBeVisible();
  });

  test("omits the automatic-origin banner for risks without KPI lineage", async ({
    page,
  }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
      mode: "manual",
    });
    await page.goto(`/compliance/risks/${manualRisk.id}`);
    await expect(
      page.getByRole("heading", { name: "Manually raised enterprise risk" }),
    ).toBeVisible();
    await expect(page.getByTestId("risk-automatic-origin")).toHaveCount(0);
    await expect(
      page.getByText("No automatic KPI lineage is attached to this risk."),
    ).toBeVisible();
  });

  test("shows permission denied without requesting risk data", async ({
    page,
  }) => {
    const { listUrls } = await installRiskMock(page, {
      permissions: ["kpis:read"],
    });
    await page.goto("/compliance/risks");
    await expect(page.getByText("Permission required")).toBeVisible();
    await expect(page.getByText("risk:read")).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    expect(listUrls).toEqual([]);
  });

  test("shows an empty register state", async ({ page }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
      mode: "empty",
    });
    await page.goto("/compliance/risks");
    await expect(page.getByText("No risks yet")).toBeVisible();
  });

  test("shows a filtered-empty register state", async ({ page }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
      mode: "filtered-empty",
    });
    await page.goto("/compliance/risks");
    await page.getByLabel("Search risks by title, code or KPI").fill("ZZZ");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No risks match these filters")).toBeVisible();
  });

  test("shows an API error state", async ({ page }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
      mode: "error",
    });
    await page.goto("/compliance/risks");
    await expect(page.getByText("Data could not be loaded")).toBeVisible();
  });

  test("issues no risk write methods from register or detail", async ({
    page,
  }) => {
    const { mutatingCalls } = await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await page.getByRole("button", { name: "View RSK-001" }).first().click();
    await expect(page.getByTestId("risk-automatic-origin")).toBeVisible();
    expect(mutatingCalls.filter((call) => call.includes("/risks"))).toEqual(
      [],
    );
  });

  test("sends class and level filters to the API", async ({ page }) => {
    const { listUrls } = await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await page.getByLabel("Filter by KPI risk class").selectOption("MINOR");
    await page.getByLabel("Filter by general risk level").selectOption("LOW");
    await expect
      .poll(() =>
        listUrls.some(
          (url) =>
            url.includes("kpiRiskClass=MINOR") &&
            url.includes("generalLevel=LOW"),
        ),
      )
      .toBeTruthy();
  });

  test("clears previous-tenant risks immediately on Company switch", async ({
    page,
  }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await expect(
      page.getByText("RSK-001").filter({ visible: true }),
    ).toBeVisible();
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(page.getByText("RSK-001")).toHaveCount(0);
    await expect(page.getByText("No risks yet")).toBeVisible();
  });

  test("does not retain previous-tenant detail after Company switch", async ({
    page,
  }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto(`/compliance/risks/${openRisk.id}`);
    await expect(page.getByTestId("risk-automatic-origin")).toBeVisible();
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(page.getByText("Risk not found")).toBeVisible();
    await expect(page.getByTestId("risk-automatic-origin")).toHaveCount(0);
  });

  test("shows risk-not-found for an unknown id", async ({ page }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks/93000000-0000-4000-8000-000000000099");
    await expect(page.getByText("Risk not found")).toBeVisible();
  });

  test("mobile register and detail layouts remain usable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await expect(page.getByTestId("risk-register-cards")).toBeVisible();
    await expect(page.getByTestId("risk-register-table")).toBeHidden();
    await page
      .getByTestId("risk-register-cards")
      .getByRole("button", { name: "View RSK-001" })
      .click();
    await expect(page.getByTestId("risk-automatic-origin")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: openRisk.title }),
    ).toBeVisible();
  });

  test("supports keyboard focus on register controls", async ({ page }) => {
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    const search = page.getByLabel("Search risks by title, code or KPI");
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Active or historical risks")).toBeFocused();
  });

  test("emits no unexpected console errors on register and detail", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installRiskMock(page, {
      permissions: ["*", "risk:read"],
    });
    await page.goto("/compliance/risks");
    await page.getByRole("button", { name: "View RSK-001" }).first().click();
    await expect(page.getByTestId("risk-automatic-origin")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
