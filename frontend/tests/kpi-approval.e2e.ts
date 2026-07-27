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

const thirdUser = {
  id: "20000000-0000-4000-8000-000000000004",
  code: "USR-004",
  name: "User 004",
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

const configuration = {
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
  department: null,
  owner: otherUser,
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

const linkedRisk = {
  id: "93000000-0000-4000-8000-000000000001",
  code: "RSK-042",
  title: "KPI-001 missed target for FY26-27 Q1",
  kpiRiskClass: "MAJOR",
  generalLevel: "HIGH",
  inherentLikelihood: 4,
  inherentImpact: 4,
  inherentScore: 16,
  status: "OPEN",
};

const baseActual = {
  id: "92000000-0000-4000-8000-000000000001",
  code: "ACT-001",
  configuration,
  target: {
    id: "91000000-0000-4000-8000-000000000001",
    code: "TGT-KPI-001-FY26-27-Q1",
    version: 1,
  },
  period: "FY26-27 Q1",
  periodStart: "2026-04-01",
  periodEnd: "2026-06-30",
  targetValueSnapshot: "95.0000",
  actualValue: "80.0000",
  variance: "-15.0000",
  variancePercentage: "-15.79",
  ragStatus: "RED",
  targetMet: false,
  approvalStatus: "PENDING_APPROVAL",
  submittedBy: otherUser,
  submittedAt: "2026-07-02T09:00:00.000Z",
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  evidenceStatus: null,
  comments: "Quarterly survey result",
  createdAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
  riskRequired: true,
  recommendedRiskClass: "MAJOR",
  risk: linkedRisk,
  approvals: [] as unknown[],
};

const historyEntries = [
  {
    id: "94000000-0000-4000-8000-000000000001",
    decision: "REJECTED",
    reviewer: currentUser,
    comments: "Survey sample too small.",
    decidedAt: "2026-07-03T10:00:00.000Z",
  },
  {
    id: "94000000-0000-4000-8000-000000000002",
    decision: "RESUBMITTED",
    reviewer: otherUser,
    comments: "Sample corrected and re-run.",
    decidedAt: "2026-07-04T11:00:00.000Z",
  },
];

const FULL_PERMISSIONS = [
  "kpis:read",
  "kpi-actual:approve",
  "kpi-actual:write",
  "risk:read",
  "tenants:read",
];

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (code: string, message: string) => ({
  success: false,
  error: { code, message },
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
  | "with-history"
  | "self-submitted"
  | "other-approver"
  | "approver-is-submitter"
  | "rejected"
  | "requires-evidence"
  | "server-rejects-self"
  | "evidence-gate-501";

interface MockOptions {
  permissions?: string[];
  mode?: Mode;
}

async function installApprovalMock(page: Page, options: MockOptions = {}) {
  const permissions = options.permissions ?? FULL_PERMISSIONS;
  const mode = options.mode ?? "default";
  const has = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);

  let activeCompany = company;
  const listUrls: string[] = [];

  const buildActual = () => {
    switch (mode) {
      case "with-history":
        return { ...baseActual, approvals: historyEntries };
      case "self-submitted":
        return { ...baseActual, submittedBy: currentUser };
      case "other-approver":
        return {
          ...baseActual,
          configuration: { ...configuration, approver: thirdUser },
        };
      case "approver-is-submitter":
        // Configured approver is also the submitter, so the approver
        // restriction is waived and any approver may decide.
        return {
          ...baseActual,
          configuration: { ...configuration, approver: otherUser },
        };
      case "rejected":
        return {
          ...baseActual,
          approvalStatus: "REJECTED",
          submittedBy: currentUser,
          rejectionReason: "Needs a corrected sample.",
        };
      case "requires-evidence":
      case "evidence-gate-501":
        return {
          ...baseActual,
          configuration: { ...configuration, requiresEvidence: true },
        };
      default:
        return { ...baseActual };
    }
  };

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
      return json(route, 200, success([definition], pageMeta(1)));
    }

    if (path === "/api/v1/kpi-actuals" && method === "GET") {
      listUrls.push(request.url());
      if (!has("kpis:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "error") {
        return json(route, 500, failure("INTERNAL_ERROR", "Synthetic failure"));
      }
      // Company 002 carries no actuals in this fixture set.
      if (!inCompanyOne() || mode === "empty") {
        return json(route, 200, success([], pageMeta(0)));
      }
      const actual = buildActual();
      const statusFilter = url.searchParams.get("approvalStatus");
      const awaitingMine = url.searchParams.get("awaitingMyDecision") === "true";
      // Mirrors the server filter: pending, not submitted by the actor, and
      // either no approver, the actor, or the approver-is-submitter fallback.
      const approver = actual.configuration.approver as
        | { id: string }
        | null;
      const decidable =
        (actual.approvalStatus === "SUBMITTED" ||
          actual.approvalStatus === "PENDING_APPROVAL") &&
        actual.submittedBy.id !== currentUser.id &&
        (approver === null ||
          approver.id === currentUser.id ||
          approver.id === actual.submittedBy.id);
      const rows =
        (statusFilter && actual.approvalStatus !== statusFilter) ||
        (awaitingMine && !decidable)
          ? []
          : [actual];
      return json(route, 200, success(rows, pageMeta(rows.length)));
    }

    const actionMatch = path.match(
      /^\/api\/v1\/kpi-actuals\/([^/]+)\/(approve|reject|resubmit)$/,
    );
    if (actionMatch && method === "POST") {
      const [, , action] = actionMatch;
      const permission =
        action === "resubmit" ? "kpi-actual:write" : "kpi-actual:approve";
      if (!has(permission)) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "server-rejects-self" && action !== "resubmit") {
        return json(
          route,
          403,
          failure("FORBIDDEN", "KPI actual self-approval is forbidden"),
        );
      }
      if (mode === "evidence-gate-501" && action !== "resubmit") {
        return json(
          route,
          501,
          failure(
            "EVIDENCE_GATE_NOT_IMPLEMENTED",
            "KPI actual approval requires evidence support that is not implemented",
          ),
        );
      }
      const actual = buildActual();
      const decided = {
        ...actual,
        approvalStatus:
          action === "approve"
            ? "APPROVED"
            : action === "reject"
              ? "REJECTED"
              : "PENDING_APPROVAL",
      };
      return json(route, 200, success(decided));
    }

    return json(route, 200, success([], pageMeta(0)));
  });

  return { listUrls };
}

const gotoApproval = async (page: Page) => {
  await page.goto("/kpi/approval");
  await expect(
    page.getByRole("heading", { level: 1, name: /KPI Approval/ }),
  ).toBeVisible();
};

const toast = (page: Page) => page.locator(".toast");

/** Desktop table and mobile cards both live in the DOM; CSS hides one. */
const shown = (locator: Locator) => locator.filter({ visible: true });

const actualRows = (page: Page) => shown(page.getByText(baseActual.code));

test.describe("KPI actual approval", () => {
  test("renders the live route without a prototype banner", async ({
    page,
  }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await expect(actualRows(page).first()).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
  });

  test("shows every required field for a submitted actual", async ({
    page,
  }) => {
    await installApprovalMock(page);
    await gotoApproval(page);

    for (const value of [
      definition.code,
      definition.name,
      baseActual.period,
      baseActual.targetValueSnapshot,
      baseActual.actualValue,
      baseActual.variance,
      "RED",
      otherUser.name,
      linkedRisk.code,
    ]) {
      await expect(shown(page.getByText(value, { exact: false })).first()).toBeVisible();
    }
  });

  test("states that a decision does not change the linked risk", async ({
    page,
  }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    const note = page.getByTestId("risk-unchanged-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("does not change any risk it raised");
    await expect(note).toContainText(
      "handled separately in the Risk Register",
    );

    await shown(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).click();
    await expect(page.getByTestId("decision-risk-note")).toContainText(
      linkedRisk.code,
    );
  });

  test("shows the append-only approval history in decision order", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "with-history" });
    await gotoApproval(page);
    await shown(
      page.getByRole("button", {
        name: `Show approval history for ${baseActual.code}`,
      }),
    ).click();

    const history = shown(page.getByTestId("kpi-approval-history")).first();
    await expect(history).toBeVisible();
    await expect(
      shown(page.getByTestId("approval-history-append-only")).first(),
    ).toContainText("kpi_approvals_append_only");
    await expect(
      shown(page.getByTestId("approval-history-append-only")).first(),
    ).toContainText("cannot be edited or deleted");
    await expect(history).toContainText("Survey sample too small.");
    await expect(history).toContainText("Sample corrected and re-run.");

    const entries = await history.locator("li").allInnerTexts();
    expect(entries[0]).toContain("Rejected");
    expect(entries[1]).toContain("Resubmitted");
  });

  test("approves an actual", async ({ page }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).click();
    await page.getByLabel("Comments (optional)").fill("Reviewed and accepted.");
    await page.getByRole("button", { name: "Approve KPI actual" }).click();
    await expect(toast(page).getByText(/approved/).first()).toBeVisible();
  });

  test("requires a reason to reject", async ({ page }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Reject actual ${baseActual.code}` }),
    ).click();

    const confirm = page.getByRole("button", { name: "Reject KPI actual" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Rejection reason *").fill("Sample size too small.");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(toast(page).getByText(/rejected/).first()).toBeVisible();
  });

  test("resubmits a rejected actual as the original submitter", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "rejected" });
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Resubmit actual ${baseActual.code}` }),
    ).click();
    await page.getByLabel("Comments (optional)").fill("Corrected the sample.");
    await page.getByRole("button", { name: "Resubmit KPI actual" }).click();
    await expect(toast(page).getByText(/resubmitted/).first()).toBeVisible();
  });

  test("disables the decision when the actor submitted the actual", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "self-submitted" });
    await gotoApproval(page);
    await expect(
      shown(
        page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
      ),
    ).toBeDisabled();
    await expect(
      shown(
        page.getByText("You submitted this actual, so you cannot decide it."),
      ).first(),
    ).toBeVisible();
  });

  test("disables the decision when another user is the configured approver", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "other-approver" });
    await gotoApproval(page);
    await expect(
      shown(
        page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
      ),
    ).toBeDisabled();
    await expect(
      shown(page.getByText(`Only ${thirdUser.name} may decide this actual.`)).first(),
    ).toBeVisible();
  });

  test("keeps the decision enabled when the configured approver is the submitter", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "approver-is-submitter" });
    await gotoApproval(page);
    // The approver restriction is waived rather than deadlocking the record.
    await expect(
      shown(
        page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
      ),
    ).toBeEnabled();
    await expect(
      shown(page.getByText("Yours to decide")).first(),
    ).toBeVisible();
  });

  test("marks rows the current user can act on", async ({ page }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await expect(shown(page.getByText("Yours to decide")).first()).toBeVisible();

    await page.getByLabel("Only actuals awaiting my decision").check();
    await expect(actualRows(page).first()).toBeVisible();
  });

  test("filters out rows the user cannot decide via awaitingMyDecision", async ({
    page,
  }) => {
    const { listUrls } = await installApprovalMock(page, {
      mode: "self-submitted",
    });
    await gotoApproval(page);
    await page.getByLabel("Only actuals awaiting my decision").check();
    await expect(page.getByText("No actuals match these filters")).toBeVisible();
    expect(
      listUrls.some((url) => url.includes("awaitingMyDecision=true")),
    ).toBeTruthy();
  });

  test("surfaces a server 403 verbatim as a specific message", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "server-rejects-self" });
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).click();
    await page.getByRole("button", { name: "Approve KPI actual" }).click();

    const error = page.getByTestId("decision-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(
      "You submitted this actual, so you cannot approve or reject it.",
    );
  });

  test("warns before an evidence-gated decision and explains the 501", async ({
    page,
  }) => {
    await installApprovalMock(page, { mode: "evidence-gate-501" });
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).click();

    const warning = page.getByTestId("evidence-gate-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("EVIDENCE_GATE_NOT_IMPLEMENTED");

    await page.getByRole("button", { name: "Approve KPI actual" }).click();
    const error = page.getByTestId("decision-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(
      "the Evidence domain is not implemented yet",
    );
    await expect(error).toContainText("nothing was saved");
  });

  test("hides approval actions without kpi-actual:approve", async ({ page }) => {
    await installApprovalMock(page, {
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "kpi-actual:approve",
      ),
    });
    await gotoApproval(page);
    await expect(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Reject actual ${baseActual.code}` }),
    ).toHaveCount(0);
  });

  test("hides resubmit without kpi-actual:write", async ({ page }) => {
    await installApprovalMock(page, {
      mode: "rejected",
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "kpi-actual:write",
      ),
    });
    await gotoApproval(page);
    await expect(
      page.getByRole("button", { name: `Resubmit actual ${baseActual.code}` }),
    ).toHaveCount(0);
  });

  test("shows permission-denied without kpis:read", async ({ page }) => {
    await installApprovalMock(page, { permissions: ["tenants:read"] });
    await page.goto("/kpi/approval");
    await expect(
      page.getByRole("heading", { name: "Permission required" }),
    ).toBeVisible();
    await expect(page.getByText("kpis:read")).toBeVisible();
  });

  test("clears the list on Company switch and refetches", async ({ page }) => {
    const { listUrls } = await installApprovalMock(page);
    await gotoApproval(page);
    await expect(actualRows(page).first()).toBeVisible();
    const before = listUrls.length;

    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(actualRows(page)).toHaveCount(0);
    await expect(page.getByText("No KPI actuals yet")).toBeVisible();
    expect(listUrls.length).toBeGreaterThan(before);
  });

  test("shows the empty state", async ({ page }) => {
    await installApprovalMock(page, { mode: "empty" });
    await gotoApproval(page);
    await expect(page.getByText("No KPI actuals yet")).toBeVisible();
  });

  test("shows a filtered-empty state distinct from the empty state", async ({
    page,
  }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await page.getByLabel("Filter by approval status").selectOption("APPROVED");
    await expect(page.getByText("No actuals match these filters")).toBeVisible();
  });

  test("shows the error state when the list request fails", async ({ page }) => {
    await installApprovalMock(page, { mode: "error" });
    await page.goto("/kpi/approval");
    await expect(page.getByText("Data could not be loaded")).toBeVisible();
    await expect(page.getByText("Synthetic failure")).toBeVisible();
  });

  test("shows a distinct refresh state", async ({ page }) => {
    const { listUrls } = await installApprovalMock(page);
    await gotoApproval(page);
    const before = listUrls.length;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(actualRows(page).first()).toBeVisible();
    expect(listUrls.length).toBeGreaterThan(before);
  });

  test("renders mobile cards instead of the table", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await installApprovalMock(page);
    await gotoApproval(page);
    await expect(page.getByTestId("kpi-approval-cards")).toBeVisible();
    await expect(page.getByTestId("kpi-approval-table")).toBeHidden();
  });

  test("supports keyboard navigation across filters", async ({ page }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    const statusFilter = page.getByLabel("Filter by approval status");
    await statusFilter.focus();
    await expect(statusFilter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Filter by KPI")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Only actuals awaiting my decision"),
    ).toBeFocused();
  });

  test("closes the decision dialog with Escape", async ({ page }) => {
    await installApprovalMock(page);
    await gotoApproval(page);
    await shown(
      page.getByRole("button", { name: `Approve actual ${baseActual.code}` }),
    ).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("emits no unexpected console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installApprovalMock(page, { mode: "with-history" });
    await gotoApproval(page);
    await shown(
      page.getByRole("button", {
        name: `Show approval history for ${baseActual.code}`,
      }),
    ).click();
    await expect(
      shown(page.getByTestId("kpi-approval-history")).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
