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

const baseRisk = {
  id: "93000000-0000-4000-8000-000000000001",
  code: "RSK-042",
  title: "KPI target missed: KPI-001 Customer Satisfaction Score (FY26-27 Q1)",
  description: "Auto-raised from KPI actual submission.",
  category: null,
  kpiRiskClass: "MAJOR",
  generalLevel: "HIGH",
  inherentLikelihood: 4,
  inherentImpact: 4,
  inherentScore: 16,
  status: "OPEN",
  source: { actual: null, configuration: null, target: null },
  residualLikelihood: null,
  residualImpact: null,
  residualScore: null,
  owner: null,
  treatmentStrategy: null,
  reviewDate: null,
  closedAt: null,
  closureReason: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  reviews: [] as unknown[],
  treatments: [] as unknown[],
};

const reviewEntry = {
  id: "95000000-0000-4000-8000-000000000001",
  reviewer: currentUser,
  comments: "Reassessed after the corrective action.",
  likelihoodAtReview: 2,
  impactAtReview: 4,
  reviewedAt: "2026-07-05T10:00:00.000Z",
};

const plannedTreatment = {
  id: "96000000-0000-4000-8000-000000000001",
  strategy: "MITIGATE",
  plan: "Introduce a second reviewer on the survey process.",
  owner: otherUser,
  dueDate: "2026-09-30",
  completedAt: null,
  status: "PLANNED",
  effectivenessNotes: null,
  supersedesId: null,
  recordedBy: currentUser,
  recordedAt: "2026-07-06T10:00:00.000Z",
};

const completionTreatment = {
  ...plannedTreatment,
  id: "96000000-0000-4000-8000-000000000002",
  status: "COMPLETED",
  completedAt: "2026-07-20T10:00:00.000Z",
  effectivenessNotes: "Second reviewer in place since August.",
  supersedesId: plannedTreatment.id,
  recordedAt: "2026-07-20T10:00:00.000Z",
};

const FULL_PERMISSIONS = [
  "risk:read",
  "risk:treat",
  "risk:close",
  "users:read",
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

type Mode =
  | "default"
  | "with-history"
  | "treated-open"
  | "closed"
  | "reopen-conflict"
  | "error";

interface MockOptions {
  permissions?: string[];
  mode?: Mode;
}

async function installRiskWorkflowMock(page: Page, options: MockOptions = {}) {
  const permissions = options.permissions ?? FULL_PERMISSIONS;
  const mode = options.mode ?? "default";
  const has = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);

  let activeCompany = company;
  const calls: string[] = [];

  const buildRisk = () => {
    switch (mode) {
      case "with-history":
        return {
          ...baseRisk,
          status: "TREATED",
          residualLikelihood: 2,
          residualImpact: 4,
          residualScore: 8,
          generalLevel: "MEDIUM",
          treatmentStrategy: "MITIGATE",
          owner: otherUser,
          reviews: [reviewEntry],
          treatments: [plannedTreatment, completionTreatment],
        };
      case "treated-open":
        // One planned treatment still awaiting completion.
        return {
          ...baseRisk,
          status: "TREATED",
          treatmentStrategy: "MITIGATE",
          reviews: [reviewEntry],
          treatments: [plannedTreatment],
        };
      case "closed":
      case "reopen-conflict":
        return {
          ...baseRisk,
          status: "CLOSED",
          closedAt: "2026-07-21T10:00:00.000Z",
          closureReason: "Mitigated and verified by the compliance team.",
          reviews: [reviewEntry],
          treatments: [plannedTreatment],
        };
      default:
        return { ...baseRisk };
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

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    // Record comments render on every detail page; the mock answers with an
    // empty conversation so the panel shows its empty state rather than an
    // error that would collide with the page's own alerts.
    if (/\/api\/v1\/records\/[A-Z]+\/[^/]+\/comments$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
    }
    calls.push(`${method} ${path}`);

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
        ),
      );
    }

    if (path === `/api/v1/risks/${baseRisk.id}` && method === "GET") {
      if (!has("risk:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "error") {
        return json(route, 500, failure("INTERNAL_ERROR", "Synthetic failure"));
      }
      // Company 002 holds no risks in this fixture set.
      if (activeCompany.id !== company.id) {
        return json(route, 404, failure("NOT_FOUND", "Risk not found"));
      }
      return json(route, 200, success(buildRisk()));
    }

    const workflowMatch = path.match(
      /^\/api\/v1\/risks\/([^/]+)\/(reviews|treatments|owner|close|reopen)$/,
    );
    if (workflowMatch) {
      const [, , segment] = workflowMatch;
      const permission =
        segment === "close" || segment === "reopen" ? "risk:close" : "risk:treat";
      if (!has(permission)) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (segment === "reopen" && mode === "reopen-conflict") {
        return json(
          route,
          409,
          failure(
            "RISK_ACTIVE_DUPLICATE_FOR_ACTUAL",
            "Risk RSK-099 is already active for the same KPI actual. Only one active risk per KPI actual is permitted, so this risk cannot be reopened until that one is closed.",
          ),
        );
      }
      return json(route, segment === "owner" ? 200 : 201, success(buildRisk()));
    }

    if (/\/complete$/.test(path) && method === "POST") {
      if (!has("risk:treat")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      return json(route, 201, success(buildRisk()));
    }

    return json(route, 200, success([]));
  });

  return { calls };
}

const gotoRisk = async (page: Page) => {
  await page.goto(`/compliance/risks/${baseRisk.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /KPI target missed/ }),
  ).toBeVisible();
};

const toast = (page: Page) => page.locator(".toast");
const shown = (locator: Locator) => locator.filter({ visible: true });

test.describe("Risk review, treatment and closure", () => {
  test("renders the live detail without a prototype banner", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await expect(page.getByTestId("risk-review-history")).toBeVisible();
    await expect(page.getByTestId("risk-treatment-history")).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
  });

  test("states that both trails are append-only and database-enforced", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);

    const reviewNote = page.getByTestId("review-append-only-note");
    await expect(reviewNote).toContainText("risk_reviews_append_only");
    await expect(reviewNote).toContainText("cannot be edited or deleted");

    const treatmentNote = page.getByTestId("treatment-append-only-note");
    await expect(treatmentNote).toContainText("risk_treatments_append_only");
  });

  test("explains that a completion is a new entry, not an edit", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);

    const note = page.getByTestId("treatment-completion-note");
    await expect(note).toContainText("new entry");
    await expect(note).toContainText("not a duplicate");

    // Both entries render, and the completion is labelled as superseding.
    const history = page.getByTestId("risk-treatment-history");
    await expect(history.locator("li")).toHaveCount(2);
    await expect(history).toContainText(
      "Completion entry superseding the earlier plan",
    );
  });

  test("shows the server-computed residual score without recomputing", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);
    // 2 x 4 = 8 comes from the server; the UI only displays it.
    await expect(shown(page.getByText("8", { exact: true })).first()).toBeVisible();
    await expect(
      page.getByTestId("risk-review-history"),
    ).toContainText("Reassessed 2×4");
  });

  test("records a review with a revised assessment", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.getByRole("button", { name: "Record review" }).click();
    await page.getByLabel("Revised likelihood (1–5)").selectOption("2");
    await page.getByLabel("Revised impact (1–5)").selectOption("4");
    await page.getByLabel("Review comments *").fill("Reassessed after action.");
    await page
      .getByRole("button", { name: "Record review", exact: true })
      .last()
      .click();
    await expect(toast(page).getByText(/Review recorded/).first()).toBeVisible();
  });

  test("requires review comments", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.getByRole("button", { name: "Record review" }).click();
    const confirm = page
      .getByRole("button", { name: "Record review", exact: true })
      .last();
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Review comments *").fill("Noted.");
    await expect(confirm).toBeEnabled();
  });

  test("records a treatment with strategy, plan, owner and due date", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.getByRole("button", { name: "Record treatment" }).click();
    await expect(page.getByLabel("Notes (optional)")).toHaveCount(0);
    await page.getByLabel("Strategy *").selectOption("TRANSFER");
    await page.getByLabel("Plan *").fill("Transfer via insurance cover.");
    await page.getByLabel("Treatment owner").selectOption(otherUser.id);
    await page.getByLabel("Due date").fill("2026-09-30");
    await page
      .getByRole("button", { name: "Record treatment", exact: true })
      .last()
      .click();
    await expect(
      toast(page).getByText(/Treatment recorded/).first(),
    ).toBeVisible();
  });

  test("completes a treatment and says it appends a new entry", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "treated-open" });
    await gotoRisk(page);
    await page.getByRole("button", { name: /^Complete treatment recorded/ }).click();
    await expect(page.getByTestId("complete-supersede-note")).toContainText(
      "new completion entry",
    );
    await page
      .getByRole("button", { name: "Complete treatment", exact: true })
      .last()
      .click();
    await expect(
      toast(page).getByText(/Treatment completed/).first(),
    ).toBeVisible();
  });

  test("offers no completion on an already-superseded treatment", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);
    // The plan was completed, so neither entry can be completed again.
    await expect(
      page.getByRole("button", { name: /^Complete treatment recorded/ }),
    ).toHaveCount(0);
  });

  test("assigns an owner", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.getByRole("button", { name: "Assign owner" }).click();
    await expect(page.getByLabel("Notes (optional)")).toHaveCount(0);
    await page.getByLabel("Risk owner").selectOption(otherUser.id);
    await page
      .getByRole("button", { name: "Assign owner", exact: true })
      .last()
      .click();
    await expect(toast(page).getByText(/Owner assigned/).first()).toBeVisible();
  });

  test("requires a closure reason", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.getByRole("button", { name: "Close risk" }).click();
    const confirm = page
      .getByRole("button", { name: "Close risk", exact: true })
      .last();
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Closure reason *").fill("Mitigated and verified.");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(toast(page).getByText(/Risk closed/).first()).toBeVisible();
  });

  test("offers reopen on a closed risk and hides the treat actions", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "closed" });
    await gotoRisk(page);

    await expect(page.getByTestId("risk-closed-note")).toContainText(
      "cannot be recorded until it is reopened",
    );
    await expect(
      page.getByRole("button", { name: "Reopen risk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record review" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Record treatment" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close risk" })).toHaveCount(
      0,
    );
  });

  test("reopens a closed risk", async ({ page }) => {
    await installRiskWorkflowMock(page, { mode: "closed" });
    await gotoRisk(page);
    await page.getByRole("button", { name: "Reopen risk" }).click();
    await page
      .getByLabel("Reason for reopening *")
      .fill("New evidence contradicts the closure.");
    await page
      .getByRole("button", { name: "Reopen risk", exact: true })
      .last()
      .click();
    await expect(toast(page).getByText(/Risk reopened/).first()).toBeVisible();
  });

  test("explains a reopen blocked by another live risk on the same actual", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { mode: "reopen-conflict" });
    await gotoRisk(page);
    await page.getByRole("button", { name: "Reopen risk" }).click();
    await page.getByLabel("Reason for reopening *").fill("Trying to reopen.");
    await page
      .getByRole("button", { name: "Reopen risk", exact: true })
      .last()
      .click();

    const error = page.getByTestId("risk-action-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("RSK-099");
    await expect(error).toContainText("already active for the same KPI actual");
  });

  test("hides treat actions without risk:treat", async ({ page }) => {
    await installRiskWorkflowMock(page, {
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "risk:treat",
      ),
    });
    await gotoRisk(page);
    await expect(
      page.getByRole("button", { name: "Record review" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Record treatment" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Assign owner" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close risk" })).toBeVisible();
  });

  test("hides closure actions without risk:close", async ({ page }) => {
    await installRiskWorkflowMock(page, {
      permissions: FULL_PERMISSIONS.filter(
        (permission) => permission !== "risk:close",
      ),
    });
    await gotoRisk(page);
    await expect(page.getByRole("button", { name: "Close risk" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Record review" }),
    ).toBeVisible();
  });

  test("says the risk is read only without either permission", async ({
    page,
  }) => {
    await installRiskWorkflowMock(page, { permissions: ["risk:read"] });
    await gotoRisk(page);
    await expect(page.getByText(/so this risk is read only/)).toBeVisible();
  });

  test("shows permission-denied without risk:read", async ({ page }) => {
    await installRiskWorkflowMock(page, { permissions: ["tenants:read"] });
    await page.goto(`/compliance/risks/${baseRisk.id}`);
    await expect(
      page.getByRole("heading", { name: "Permission required" }),
    ).toBeVisible();
  });

  test("drops the risk on Company switch", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(page.getByText("Risk not found")).toBeVisible();
    await expect(page.getByTestId("risk-review-history")).toHaveCount(0);
  });

  test("shows empty history states", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    await expect(
      page.getByText("No reviews have been recorded for this risk yet."),
    ).toBeVisible();
    await expect(
      page.getByText("No treatments have been recorded for this risk yet."),
    ).toBeVisible();
  });

  test("shows the error state when detail fails", async ({ page }) => {
    await installRiskWorkflowMock(page, { mode: "error" });
    await page.goto(`/compliance/risks/${baseRisk.id}`);
    await expect(page.getByText("Data could not be loaded")).toBeVisible();
  });

  test("refetches on refresh", async ({ page }) => {
    const { calls } = await installRiskWorkflowMock(page);
    await gotoRisk(page);
    const before = calls.filter((entry) => entry.includes("/risks/")).length;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("risk-review-history")).toBeVisible();
    expect(
      calls.filter((entry) => entry.includes("/risks/")).length,
    ).toBeGreaterThan(before);
  });

  test("remains usable on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);
    await expect(page.getByTestId("risk-review-history")).toBeVisible();
    await expect(page.getByTestId("risk-treatment-history")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("supports keyboard navigation and Escape", async ({ page }) => {
    await installRiskWorkflowMock(page);
    await gotoRisk(page);
    const review = page.getByRole("button", { name: "Record review" });
    await review.focus();
    await expect(review).toBeFocused();
    await review.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("emits no unexpected console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installRiskWorkflowMock(page, { mode: "with-history" });
    await gotoRisk(page);
    await expect(page.getByTestId("risk-treatment-history")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
