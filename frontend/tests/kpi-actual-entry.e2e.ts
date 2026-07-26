import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
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
  orgUnit: null,
  orgLocation: null,
  productService: null,
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

const approvedTarget = {
  id: "91000000-0000-4000-8000-000000000001",
  code: "KTG-001",
  configuration,
  period: "FY26-27 Q1",
  periodStart: "2026-04-01",
  periodEnd: "2026-06-30",
  targetValue: "100.0000",
  minValue: null,
  maxValue: null,
  approvalStatus: "APPROVED",
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: "2026-07-01T00:00:00.000Z",
  rejectionReason: null,
  version: 1,
  supersededById: null,
  effectiveFrom: "2026-04-01",
  effectiveTo: null,
  status: "ACTIVE",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const success = (data: unknown) => ({ success: true, data });
const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, error: { code, message } },
});

async function installKpiActualMock(
  page: Page,
  options: {
    permissions: string[];
    mode?:
      | "success-met"
      | "success-miss"
      | "empty-targets"
      | "target-missing-on-submit"
      | "duplicate-period";
  },
) {
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes("kpi-actual:write");
  const mode = options.mode ?? "success-met";
  let submitted = false;

  const identity = () => ({
    id: "20000000-0000-4000-8000-000000000001",
    code: "USR-001",
    name: "User 001",
    email: "admin001@example.test",
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions: options.permissions,
    activeCompany: company,
    companies: [company],
  });

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }

    if (path === "/api/v1/kpi-configurations" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([configuration])),
      });
    }

    if (path === "/api/v1/kpi-targets" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(mode === "empty-targets" ? [] : [approvedTarget]),
        ),
      });
    }

    if (path === "/api/v1/kpi-actuals" && method === "POST") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }

      const payload = request.postDataJSON() as {
        kpiConfigurationId: string;
        period: string;
        actualValue: string;
        code?: string;
      };
      expect(payload).not.toHaveProperty("code");

      if (mode === "target-missing-on-submit") {
        const missing = failure(
          404,
          "KPI_TARGET_NOT_FOUND",
          "Approved KPI target not found for the requested period",
        );
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }

      if (mode === "duplicate-period" || submitted) {
        const conflict = failure(
          409,
          "KPI_ACTUAL_PERIOD_EXISTS",
          "A KPI actual already exists for this KPI configuration and period",
        );
        return route.fulfill({
          status: conflict.status,
          contentType: "application/json",
          body: JSON.stringify(conflict.body),
        });
      }

      submitted = true;
      const missed = mode === "success-miss";
      const actual = {
        id: "92000000-0000-4000-8000-000000000001",
        code: "ACT-001",
        configuration,
        target: {
          id: approvedTarget.id,
          code: approvedTarget.code,
          version: approvedTarget.version,
        },
        period: payload.period,
        periodStart: approvedTarget.periodStart,
        periodEnd: approvedTarget.periodEnd,
        targetValueSnapshot: approvedTarget.targetValue,
        actualValue: payload.actualValue,
        variance: missed ? "-20.0000" : "0.0000",
        variancePercentage: missed ? "-20.0000" : "0.0000",
        ragStatus: missed ? "RED" : "GREEN",
        targetMet: !missed,
        approvalStatus: "PENDING_APPROVAL",
        submittedBy: {
          id: identity().id,
          code: identity().code,
          name: identity().name,
        },
        submittedAt: "2026-07-27T00:00:00.000Z",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        evidenceStatus: null,
        comments: null,
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T00:00:00.000Z",
        riskRequired: missed,
        recommendedRiskClass: missed ? "MAJOR" : null,
        risk: missed
          ? {
              id: "93000000-0000-4000-8000-000000000001",
              code: "RSK-001",
              title: "KPI target missed: KPI-001 Customer Satisfaction Score (FY26-27 Q1)",
              kpiRiskClass: "MAJOR",
              generalLevel: "HIGH",
              inherentLikelihood: 4,
              inherentImpact: 4,
              inherentScore: 16,
              status: "OPEN",
            }
          : null,
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(actual)),
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
}

async function fillSubmission(page: Page, actualValue: string) {
  await page.locator("#actual-kpi").selectOption(configuration.id);
  const identity = page.getByLabel("Selected KPI");
  await expect(identity.getByText("Customer Satisfaction Score")).toBeVisible();
  await expect(identity.getByText("Compliance")).toBeVisible();
  await expect(identity.getByText("USR-001")).toBeVisible();
  await expect(identity.getByText("%", { exact: true })).toBeVisible();
  await page.locator("#actual-period").selectOption("FY26-27 Q1");
  await expect(page.locator("#actual-target")).toHaveValue(/100\.0000/);
  await page.locator("#actual-value").fill(actualValue);
}

test.describe("KPI actual entry UI", () => {
  test("submits a met target and shows the calculated result with no risk", async ({
    page,
  }) => {
    await installKpiActualMock(page, {
      permissions: ["*", "kpis:read", "kpi-actual:write"],
      mode: "success-met",
    });
    await page.goto("/kpi/actual-entry");
    await expect(
      page.getByRole("heading", { name: "KPI Actual Entry" }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);

    await fillSubmission(page, "100.0000");
    await page.getByRole("button", { name: "Submit actual" }).click();

    await expect(
      page.getByText("Actual ACT-001 submitted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "No risk" })).toBeVisible();
    await expect(page.getByText("GREEN", { exact: true }).first()).toBeVisible();
    await expect(
      page.locator(".metric-row").filter({ hasText: "Actual" }).getByText("100.0000"),
    ).toBeVisible();
    await expect(
      page.locator(".metric-row").filter({ hasText: "Risk" }).getByText("No risk"),
    ).toBeVisible();
  });

  test("submits a missed target and shows the raised risk", async ({ page }) => {
    await installKpiActualMock(page, {
      permissions: ["*", "kpis:read", "kpi-actual:write"],
      mode: "success-miss",
    });
    await page.goto("/kpi/actual-entry");
    await fillSubmission(page, "80.0000");
    await page.getByRole("button", { name: "Submit actual" }).click();

    await expect(
      page.getByText("Actual ACT-001 submitted · RSK-001", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Risk raised · RSK-001" }),
    ).toBeVisible();
    await expect(page.getByText("RED", { exact: true }).first()).toBeVisible();
    await expect(
      page.locator(".metric-row").filter({ hasText: "Risk code" }).getByText("RSK-001"),
    ).toBeVisible();
    await expect(
      page.locator(".metric-row").filter({ hasText: "Risk class" }).getByText("MAJOR"),
    ).toBeVisible();
  });

  test("shows an empty state when the KPI has no approved targets", async ({
    page,
  }) => {
    await installKpiActualMock(page, {
      permissions: ["*", "kpis:read", "kpi-actual:write"],
      mode: "empty-targets",
    });
    await page.goto("/kpi/actual-entry");
    await page.locator("#actual-kpi").selectOption(configuration.id);
    await expect(
      page.getByText("This KPI has no approved active targets"),
    ).toBeVisible();
    await expect(page.locator("#actual-period")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Submit actual" })).toBeDisabled();
  });

  test("shows a specific error when the API reports no approved target", async ({
    page,
  }) => {
    await installKpiActualMock(page, {
      permissions: ["*", "kpis:read", "kpi-actual:write"],
      mode: "target-missing-on-submit",
    });
    await page.goto("/kpi/actual-entry");
    await fillSubmission(page, "95");
    await page.getByRole("button", { name: "Submit actual" }).click();

    await expect(page.locator("#actual-period-error")).toHaveText(
      "No approved target exists for this KPI and period. Approve a target before submitting an actual.",
    );
  });

  test("shows the period conflict for a duplicate period", async ({ page }) => {
    await installKpiActualMock(page, {
      permissions: ["*", "kpis:read", "kpi-actual:write"],
      mode: "duplicate-period",
    });
    await page.goto("/kpi/actual-entry");
    await fillSubmission(page, "100");
    await page.getByRole("button", { name: "Submit actual" }).click();

    await expect(page.locator("#actual-period-error")).toHaveText(
      "An actual already exists for this KPI configuration and period",
    );
    await expect(page.locator("#actual-period")).toHaveClass(/invalid/);
    await expect(page.getByText("Actual ACT-001 submitted")).toHaveCount(0);
  });

  test("hides submit without kpi-actual:write and rejects a forced request", async ({
    page,
  }) => {
    await installKpiActualMock(page, {
      permissions: ["kpis:read"],
      mode: "success-met",
    });
    await page.goto("/kpi/actual-entry");
    await expect(
      page.getByRole("heading", { name: "KPI Actual Entry" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit actual" })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("kpi-actual:write", { exact: true }),
    ).toBeVisible();

    const denied = await page.evaluate(async () => {
      const response = await fetch("/api/v1/kpi-actuals", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kpiConfigurationId: "90000000-0000-4000-8000-000000000001",
          period: "FY26-27 Q1",
          actualValue: "100",
        }),
      });
      return {
        status: response.status,
        body: (await response.json()) as {
          success: boolean;
          error?: { code: string };
        },
      };
    });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
