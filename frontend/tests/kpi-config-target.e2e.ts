import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

/**
 * These tests drive the UI against mocked `**\/api/v1/**` browser routes. They
 * are not browser-to-database end-to-end tests: no Express server and no
 * PostgreSQL instance is involved.
 */

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

const currentUser = {
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
};

const otherUser = {
  id: "20000000-0000-4000-8000-000000000003",
  code: "USR-003",
  name: "User 003",
};

const definition = {
  id: "80000000-0000-4000-8000-000000000001",
  code: "KPI-001",
  name: "Customer Satisfaction Score",
  description: null,
  unit: "%",
  direction: "HIGHER_IS_BETTER",
  frequency: "QUARTERLY",
  status: "ACTIVE",
};

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Compliance",
  status: "ACTIVE",
};

const location = {
  id: "40000000-0000-4000-8000-000000000001",
  code: "LOC-001",
  name: "Location 001",
  status: "ACTIVE",
};

const unit = {
  id: "50000000-0000-4000-8000-000000000001",
  code: "UNIT-001",
  name: "Unit 001",
  status: "ACTIVE",
};

const thresholdDefaults = {
  defaultAmberThresholdPct: "2.50",
  defaultRedThresholdPct: "12.00",
};

const baseConfiguration = {
  id: "90000000-0000-4000-8000-000000000001",
  kpi: {
    id: definition.id,
    code: definition.code,
    name: definition.name,
    unit: definition.unit,
    direction: definition.direction,
    frequency: definition.frequency,
  },
  orgUnit: null,
  orgLocation: null,
  productService: null,
  department: { id: department.id, code: department.code, name: department.name },
  owner: currentUser,
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

const baseTarget = {
  id: "91000000-0000-4000-8000-000000000001",
  code: "TGT-KPI-001-FY26-27-Q1",
  configuration: baseConfiguration,
  period: "FY26-27 Q1",
  periodStart: "2026-04-01",
  periodEnd: "2026-06-30",
  targetValue: "95.0000",
  minValue: null,
  maxValue: null,
  approvalStatus: "DRAFT",
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  version: 1,
  supersededById: null,
  effectiveFrom: "2026-04-01",
  effectiveTo: null,
  status: "ACTIVE",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const FULL_PERMISSIONS = [
  "kpis:read",
  "kpi-config:write",
  "kpi-target:write",
  "kpi-target:approve",
  "users:read",
  "organisation:read",
  "tenants:read",
];

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const pageMeta = (total: number) => ({
  page: 1,
  pageSize: 20,
  total,
  totalPages: Math.max(1, Math.ceil(total / 20)),
});

type Mode =
  | "default"
  | "empty"
  | "error"
  | "approved-target"
  | "pending-own-submission"
  | "pending-other-submission"
  | "pending-server-rejects-self"
  | "duplicate-scope"
  | "validation-error"
  | "decimal-validation-error";

interface MockOptions {
  permissions?: string[];
  mode?: Mode;
}

async function installKpiMock(page: Page, options: MockOptions = {}) {
  const permissions = options.permissions ?? FULL_PERMISSIONS;
  const mode = options.mode ?? "default";
  const has = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);

  let activeCompany = company;
  const configurations = new Map<string, Record<string, unknown>>();
  const targets = new Map<string, Record<string, unknown>>();
  const listUrls: string[] = [];

  if (mode !== "empty") {
    configurations.set(baseConfiguration.id, { ...baseConfiguration });
    if (mode === "approved-target") {
      targets.set(baseTarget.id, {
        ...baseTarget,
        approvalStatus: "APPROVED",
        submittedBy: otherUser,
        submittedAt: "2026-07-02T00:00:00.000Z",
        approvedBy: currentUser,
        approvedAt: "2026-07-03T00:00:00.000Z",
      });
    } else if (mode === "pending-own-submission") {
      targets.set(baseTarget.id, {
        ...baseTarget,
        approvalStatus: "PENDING_APPROVAL",
        submittedBy: currentUser,
        submittedAt: "2026-07-02T00:00:00.000Z",
      });
    } else if (
      mode === "pending-server-rejects-self" ||
      mode === "pending-other-submission"
    ) {
      targets.set(baseTarget.id, {
        ...baseTarget,
        approvalStatus: "PENDING_APPROVAL",
        submittedBy: otherUser,
        submittedAt: "2026-07-02T00:00:00.000Z",
      });
    } else {
      targets.set(baseTarget.id, { ...baseTarget });
    }
  }

  const identity = () => ({
    id: currentUser.id,
    code: currentUser.code,
    name: currentUser.name,
    email: "admin001@example.test",
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions,
    activeCompany,
    companies: [company, companyTwo],
  });

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  // Company 002 carries no KPI rows in this fixture set.
  const inCompanyOne = () => activeCompany.id === company.id;

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return json(
        route,
        200,
        success({ accessToken: "mock-access-token", user: identity() }),
      );
    }

    if (path === "/api/v1/auth/tenant-context" && method === "POST") {
      const body = request.postDataJSON() as { companyId: string };
      activeCompany = body.companyId === companyTwo.id ? companyTwo : company;
      return json(
        route,
        200,
        success({ accessToken: "mock-access-token", user: identity() }),
      );
    }

    if (path === "/api/v1/tenants") {
      return json(route, 200, success([company, companyTwo]));
    }

    if (path === "/api/v1/kpi-definitions") {
      if (!has("kpis:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      return json(route, 200, success([definition], pageMeta(1)));
    }

    if (path === "/api/v1/users") {
      if (!has("users:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      return json(
        route,
        200,
        success(
          [currentUser, otherUser].map((entry) => ({
            ...entry,
            email: `${entry.code.toLowerCase()}@example.test`,
            status: "ACTIVE",
          })),
          pageMeta(2),
        ),
      );
    }

    if (path.startsWith("/api/v1/organisation/")) {
      if (!has("organisation:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const rows = path.endsWith("/departments")
        ? [department]
        : path.endsWith("/locations")
          ? [location]
          : [unit];
      return json(route, 200, success(rows, pageMeta(1)));
    }

    if (path === "/api/v1/kpi-configurations/threshold-defaults") {
      if (!has("kpis:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      return json(route, 200, success(thresholdDefaults));
    }

    if (path === "/api/v1/kpi-configurations" && method === "GET") {
      listUrls.push(request.url());
      if (!has("kpis:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "error") {
        return json(route, 500, failure("INTERNAL_ERROR", "Synthetic failure"));
      }
      const rows = inCompanyOne() ? [...configurations.values()] : [];
      const definitionFilter = url.searchParams.get("kpiDefinitionId");
      const enabledFilter = url.searchParams.get("enabled");
      const filtered = rows.filter((row) => {
        const record = row as typeof baseConfiguration;
        if (definitionFilter && record.kpi.id !== definitionFilter) return false;
        if (enabledFilter !== null) {
          return record.enabled === (enabledFilter === "true");
        }
        return true;
      });
      return json(route, 200, success(filtered, pageMeta(filtered.length)));
    }

    if (path === "/api/v1/kpi-configurations" && method === "POST") {
      if (!has("kpi-config:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "duplicate-scope") {
        return json(
          route,
          409,
          failure("CONFLICT", "A record with these details already exists"),
        );
      }
      if (mode === "validation-error") {
        return json(
          route,
          400,
          failure("VALIDATION_ERROR", "Request validation failed", [
            { path: "effectiveFrom", message: "Date must use YYYY-MM-DD" },
            { path: "amberThresholdPct", message: "Threshold must fit Decimal(6,2)" },
          ]),
        );
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const created = {
        ...baseConfiguration,
        id: "90000000-0000-4000-8000-0000000000ff",
        productService: (body.productService as string | null) ?? null,
        amberThresholdPct: (body.amberThresholdPct as string | null) ?? null,
        redThresholdPct: (body.redThresholdPct as string | null) ?? null,
        requiresEvidence: Boolean(body.requiresEvidence),
        requiresApproval: Boolean(body.requiresApproval),
      };
      configurations.set(created.id, created);
      return json(route, 201, success(created));
    }

    const configurationMatch = path.match(
      /^\/api\/v1\/kpi-configurations\/([^/]+)$/,
    );
    if (configurationMatch) {
      const id = configurationMatch[1];
      if (method === "GET") {
        const found = inCompanyOne() ? configurations.get(id) : undefined;
        return found
          ? json(route, 200, success(found))
          : json(route, 404, failure("NOT_FOUND", "KPI configuration not found"));
      }
      if (method === "DELETE") {
        if (!has("kpi-config:write")) {
          return json(route, 403, failure("FORBIDDEN", "Permission denied"));
        }
        const found = configurations.get(id);
        configurations.delete(id);
        return json(route, 200, success(found ?? baseConfiguration));
      }
      if (method === "PATCH") {
        if (!has("kpi-config:write")) {
          return json(route, 403, failure("FORBIDDEN", "Permission denied"));
        }
        const body = request.postDataJSON() as Record<string, unknown>;
        const updated = { ...(configurations.get(id) ?? baseConfiguration), ...body };
        configurations.set(id, updated);
        return json(route, 200, success(updated));
      }
    }

    if (path === "/api/v1/kpi-targets" && method === "GET") {
      listUrls.push(request.url());
      if (!has("kpis:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "error") {
        return json(route, 500, failure("INTERNAL_ERROR", "Synthetic failure"));
      }
      const statusFilter = url.searchParams.get("approvalStatus");
      const rows = (inCompanyOne() ? [...targets.values()] : []).filter((row) =>
        statusFilter
          ? (row as typeof baseTarget).approvalStatus === statusFilter
          : true,
      );
      return json(route, 200, success(rows, pageMeta(rows.length)));
    }

    if (path === "/api/v1/kpi-targets" && method === "POST") {
      if (!has("kpi-target:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "decimal-validation-error") {
        return json(
          route,
          400,
          failure("VALIDATION_ERROR", "Request validation failed", [
            {
              path: "targetValue",
              message: "Value must fit Decimal(18,4)",
            },
          ]),
        );
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const created = {
        ...baseTarget,
        id: "91000000-0000-4000-8000-0000000000ff",
        code: String(body.code),
        period: String(body.period),
        targetValue: String(body.targetValue),
        approvalStatus: "DRAFT",
      };
      targets.set(created.id, created);
      return json(route, 201, success(created));
    }

    const targetActionMatch = path.match(
      /^\/api\/v1\/kpi-targets\/([^/]+)\/(submit|approve|reject|versions)$/,
    );
    if (targetActionMatch && method === "POST") {
      const [, id, action] = targetActionMatch;
      const existing = targets.get(id) as typeof baseTarget | undefined;
      if (!existing) {
        return json(route, 404, failure("NOT_FOUND", "KPI target not found"));
      }

      if (action === "submit") {
        if (!has("kpi-target:write")) {
          return json(route, 403, failure("FORBIDDEN", "Permission denied"));
        }
        const updated = {
          ...existing,
          approvalStatus: "PENDING_APPROVAL",
          submittedBy: currentUser,
          submittedAt: "2026-07-05T00:00:00.000Z",
        };
        targets.set(id, updated);
        return json(route, 200, success(updated));
      }

      if (action === "approve" || action === "reject") {
        if (!has("kpi-target:approve")) {
          return json(route, 403, failure("FORBIDDEN", "Permission denied"));
        }
        if (mode === "pending-server-rejects-self") {
          return json(
            route,
            403,
            failure("FORBIDDEN", "KPI target self-approval is forbidden"),
          );
        }
        const updated =
          action === "approve"
            ? {
                ...existing,
                approvalStatus: "APPROVED",
                approvedBy: currentUser,
                approvedAt: "2026-07-06T00:00:00.000Z",
              }
            : {
                ...existing,
                approvalStatus: "REJECTED",
                rejectionReason: String(
                  (request.postDataJSON() as { reason: string }).reason,
                ),
              };
        targets.set(id, updated);
        return json(route, 200, success(updated));
      }

      if (!has("kpi-target:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const version = {
        ...existing,
        id: "91000000-0000-4000-8000-0000000000aa",
        code: String(body.code),
        version: existing.version + 1,
        approvalStatus: "DRAFT",
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
      };
      targets.set(existing.id, { ...existing, supersededById: version.id });
      targets.set(version.id, version);
      return json(route, 201, success(version));
    }

    return json(route, 200, success([], pageMeta(0)));
  });

  return { listUrls };
}

const gotoConfigurations = async (page: Page) => {
  await page.goto("/kpi/configuration");
  await expect(
    page.getByRole("heading", { level: 1, name: /KPI Configuration/ }),
  ).toBeVisible();
};

const gotoTargets = async (page: Page) => {
  await page.goto(`/kpi/configuration/${baseConfiguration.id}/targets`);
  await expect(
    page.getByRole("heading", { level: 1, name: /KPI Targets/ }),
  ).toBeVisible();
};

/** Toast copy repeats words used in table cells, so scope assertions to it. */
const toast = (page: Page) => page.locator(".toast");

/**
 * The desktop table and the mobile cards are both in the DOM; CSS hides one by
 * viewport. Filtering to the visible copy keeps assertions layout-agnostic.
 */
const shown = (locator: Locator) => locator.filter({ visible: true });

/** Present in both the desktop table and the mobile cards. */
const configurationRows = (page: Page) =>
  shown(page.getByRole("button", { name: /^Manage targets for/ }));

const targetRows = (page: Page) => shown(page.getByText(baseTarget.period));

test.describe("KPI configuration and target management", () => {
  test("renders both routes live without a prototype banner", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await expect(configurationRows(page).first()).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);

    await gotoTargets(page);
    await expect(targetRows(page).first()).toBeVisible();
    await expect(
      page
        .getByTestId("kpi-target-configuration-summary")
        .getByText("Higher is better", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Values at or above target perform better.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
  });

  test("creates a configuration and shows the Company threshold default", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await page.getByRole("button", { name: "New configuration" }).click();

    // Empty threshold overrides must name the inherited Company value.
    await expect(
      page.getByText(
        `Leave empty to inherit the Company default, currently ${thresholdDefaults.defaultAmberThresholdPct}%.`,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Leave empty to inherit the Company default, currently ${thresholdDefaults.defaultRedThresholdPct}%.`,
      ),
    ).toBeVisible();

    await page
      .getByLabel("KPI definition *")
      .selectOption(definition.id);
    await expect(
      page
        .getByLabel("Selected KPI definition")
        .getByText("Higher is better", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Owner *").selectOption(currentUser.id);
    await page.getByLabel("Effective from *").fill("2026-04-01");
    await page.getByRole("button", { name: "Create configuration" }).click();

    await expect(page.getByText("KPI configuration created")).toBeVisible();
  });

  test("surfaces field-level validation errors from the response envelope", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "validation-error" });
    await gotoConfigurations(page);
    await page.getByRole("button", { name: "New configuration" }).click();
    await page.getByLabel("KPI definition *").selectOption(definition.id);
    await page.getByLabel("Owner *").selectOption(currentUser.id);
    await page.getByLabel("Effective from *").fill("2026-04-01");
    await page.getByRole("button", { name: "Create configuration" }).click();

    await expect(page.getByText("Date must use YYYY-MM-DD")).toBeVisible();
    await expect(
      page.getByText("Threshold must fit Decimal(6,2)"),
    ).toBeVisible();
  });

  test("replaces database decimal terminology with safe target copy", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "decimal-validation-error" });
    await gotoTargets(page);
    await page.getByRole("button", { name: "New draft target" }).click();
    await page.getByLabel("Period *").fill("FY26-27 Q2");
    await page.getByLabel("Period start *").fill("2026-07-01");
    await page.getByLabel("Period end *").fill("2026-09-30");
    await page
      .getByLabel(/Target value \*/)
      .fill("123456789012345.12345");
    await page.getByLabel("Effective from *").fill("2026-07-01");
    await page.getByRole("button", { name: "New draft target" }).last().click();

    await expect(
      page.getByText(
        "Enter a valid number with up to 14 digits before the decimal and up to 4 digits after it.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Decimal\(18,4\)/)).toHaveCount(0);
  });

  test("names the scope conflict on a 409", async ({ page }) => {
    await installKpiMock(page, { mode: "duplicate-scope" });
    await gotoConfigurations(page);
    await page.getByRole("button", { name: "New configuration" }).click();
    await page.getByLabel("KPI definition *").selectOption(definition.id);
    await page.getByLabel("Owner *").selectOption(currentUser.id);
    await page.getByLabel("Effective from *").fill("2026-04-01");
    await page.getByRole("button", { name: "Create configuration" }).click();

    await expect(
      page.getByText(/An active KPI configuration already exists for this KPI/),
    ).toBeVisible();
  });

  test("warns that requiresEvidence blocks actual approval", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await page.getByRole("button", { name: "New configuration" }).click();

    await expect(page.getByTestId("requires-evidence-warning")).toHaveCount(0);
    await page.getByLabel("Requires evidence").check();

    const warning = page.getByTestId("requires-evidence-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Evidence is required for approval");
    await expect(warning).toContainText("qualifying approved Evidence");
  });

  test("creates a draft target and submits it for approval", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoTargets(page);

    await page.getByRole("button", { name: "New draft target" }).click();
    await page.getByLabel("Period *").fill("FY26-27 Q2");
    // The code is pre-filled from the KPI and period, never left empty.
    await expect(page.getByLabel("Target code *")).toHaveValue(
      "TGT-KPI-001-FY26-27-Q2",
    );
    await page.getByLabel("Period start *").fill("2026-07-01");
    await page.getByLabel("Period end *").fill("2026-09-30");
    await page.getByLabel(/Target value \*/).fill("96");
    await page.getByLabel("Effective from *").fill("2026-07-01");
    await page.getByRole("button", { name: "New draft target" }).last().click();
    await expect(toast(page).getByText(/created/).first()).toBeVisible();

    await page
      .getByRole("button", { name: `Submit target ${baseTarget.code} for approval` })
      .click();
    await expect(toast(page).getByText(/submitted/).first()).toBeVisible();

    // Having submitted it, the same user must not be offered approval.
    await expect(
      shown(
        page.getByRole("button", { name: `Approve target ${baseTarget.code}` }),
      ),
    ).toBeDisabled();
  });

  test("approves a target submitted by another user", async ({ page }) => {
    await installKpiMock(page, { mode: "pending-other-submission" });
    await gotoTargets(page);

    const approve = shown(
      page.getByRole("button", { name: `Approve target ${baseTarget.code}` }),
    );
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(toast(page).getByText(/approved/).first()).toBeVisible();
  });

  test("rejects a target with a required reason", async ({ page }) => {
    await installKpiMock(page, { mode: "pending-other-submission" });
    await gotoTargets(page);
    await shown(
      page.getByRole("button", { name: `Reject target ${baseTarget.code}` }),
    ).click();

    const reject = page.getByRole("button", {
      name: "Reject target",
      exact: true,
    });
    await expect(reject).toBeDisabled();
    await page.getByLabel("Rejection reason *").fill("Target is unrealistic.");
    await expect(reject).toBeEnabled();
    await reject.click();
    await expect(toast(page).getByText(/rejected/).first()).toBeVisible();
    await expect(shown(page.getByText("Target is unrealistic."))).toBeVisible();
  });

  test("an approved target offers a new version and never edit", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "approved-target" });
    await gotoTargets(page);

    await expect(
      shown(
        page.getByRole("button", {
          name: `Create new version of target ${baseTarget.code}`,
        }),
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Edit target ${baseTarget.code}` }),
    ).toHaveCount(0);
    await expect(
      shown(page.getByText("Approved targets are immutable.")).first(),
    ).toBeVisible();

    await shown(
      page.getByRole("button", {
        name: `Create new version of target ${baseTarget.code}`,
      }),
    ).click();
    await expect(
      page.getByText(/This creates version 2 as a new draft/),
    ).toBeVisible();
    // Versioning requires a fresh code rather than reusing the approved one.
    await expect(page.getByLabel("Target code *")).toHaveValue("");
  });

  test("blocks self-approval in the UI with a specific reason", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "pending-own-submission" });
    await gotoTargets(page);

    const approve = shown(
      page.getByRole("button", { name: `Approve target ${baseTarget.code}` }),
    );
    await expect(approve).toBeDisabled();
    await expect(
      shown(
        page.getByText("You submitted this target, so you cannot decide it."),
      ).first(),
    ).toBeVisible();
  });

  test("surfaces a server self-approval 403 as a specific message", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "pending-server-rejects-self" });
    await gotoTargets(page);

    await shown(
      page.getByRole("button", { name: `Approve target ${baseTarget.code}` }),
    ).click();

    const banner = page.getByTestId("target-action-error");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      "You submitted this target, so you cannot approve or reject it.",
    );
  });

  test("hides configuration writes without kpi-config:write", async ({
    page,
  }) => {
    await installKpiMock(page, {
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "kpi-config:write",
      ),
    });
    await gotoConfigurations(page);

    await expect(
      page.getByRole("button", { name: "New configuration" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Edit ${definition.code}` }),
    ).toHaveCount(0);
    await expect(page.getByText(/does not include/)).toContainText(
      "kpi-config:write",
    );
  });

  test("hides target writes without kpi-target:write", async ({ page }) => {
    await installKpiMock(page, {
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "kpi-target:write",
      ),
    });
    await gotoTargets(page);

    await expect(
      page.getByRole("button", { name: "New draft target" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Edit target ${baseTarget.code}` }),
    ).toHaveCount(0);
  });

  test("hides approval actions without kpi-target:approve", async ({ page }) => {
    await installKpiMock(page, {
      mode: "pending-server-rejects-self",
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "kpi-target:approve",
      ),
    });
    await gotoTargets(page);

    await expect(
      page.getByRole("button", { name: `Approve target ${baseTarget.code}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Reject target ${baseTarget.code}` }),
    ).toHaveCount(0);
  });

  test("shows permission-denied without kpis:read", async ({ page }) => {
    await installKpiMock(page, { permissions: ["tenants:read"] });
    await page.goto("/kpi/configuration");
    await expect(
      page.getByRole("heading", { name: "Permission required" }),
    ).toBeVisible();
    await expect(page.getByText("kpis:read")).toBeVisible();
  });

  test("clears previous-Company rows immediately on Company switch", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await expect(configurationRows(page).first()).toBeVisible();

    await page.locator("#company-switcher").selectOption(companyTwo.id);
    // The row must not survive the switch even briefly.
    await expect(configurationRows(page)).toHaveCount(0);
    await expect(page.getByText("No KPI configurations yet")).toBeVisible();
  });

  test("drops the selected configuration on Company switch", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoTargets(page);
    await expect(targetRows(page).first()).toBeVisible();

    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(
      page.getByText("KPI configuration not found"),
    ).toBeVisible();
    await expect(targetRows(page)).toHaveCount(0);
  });

  test("shows the empty state when the Company has no configurations", async ({
    page,
  }) => {
    await installKpiMock(page, { mode: "empty" });
    await gotoConfigurations(page);
    await expect(page.getByText("No KPI configurations yet")).toBeVisible();
  });

  test("shows a filtered-empty state distinct from the empty state", async ({
    page,
  }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await page.getByLabel("Filter by enabled state").selectOption("false");
    await expect(
      page.getByText("No configurations match these filters"),
    ).toBeVisible();
  });

  test("shows the error state when the list request fails", async ({ page }) => {
    await installKpiMock(page, { mode: "error" });
    await page.goto("/kpi/configuration");
    await expect(page.getByText("Data could not be loaded")).toBeVisible();
    await expect(page.getByText("Synthetic failure")).toBeVisible();
  });

  test("shows a distinct refresh state and refetches", async ({ page }) => {
    const { listUrls } = await installKpiMock(page);
    await gotoConfigurations(page);
    const before = listUrls.length;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(configurationRows(page).first()).toBeVisible();
    expect(listUrls.length).toBeGreaterThan(before);
  });

  test("shows a not-found state for an unknown configuration", async ({
    page,
  }) => {
    await installKpiMock(page);
    await page.goto(
      "/kpi/configuration/90000000-0000-4000-8000-000000000099/targets",
    );
    await expect(page.getByText("KPI configuration not found")).toBeVisible();
  });

  test("renders mobile card layouts instead of tables", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await installKpiMock(page);
    await gotoConfigurations(page);
    await expect(page.getByTestId("kpi-configuration-cards")).toBeVisible();
    await expect(page.getByTestId("kpi-configuration-table")).toBeHidden();

    await gotoTargets(page);
    await expect(page.getByTestId("kpi-target-cards")).toBeVisible();
    await expect(page.getByTestId("kpi-target-table")).toBeHidden();
  });

  test("supports keyboard navigation across filters", async ({ page }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    const definitionFilter = page.getByLabel("Filter by KPI definition");
    await definitionFilter.focus();
    await expect(definitionFilter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Filter by record status")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Filter by enabled state")).toBeFocused();
  });

  test("closes the configuration dialog with Escape", async ({ page }) => {
    await installKpiMock(page);
    await gotoConfigurations(page);
    await page.getByRole("button", { name: "New configuration" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("emits no unexpected console errors across both routes", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installKpiMock(page);
    await gotoConfigurations(page);
    await gotoTargets(page);
    await expect(targetRows(page).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
