/**
 * Checkpoint detail / Review workflow Playwright suite.
 *
 * Browser-level API mocks only — not Express/PostgreSQL end-to-end.
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

const userOne = {
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
  email: "admin001@example.test",
  phone: null,
  department: "Compliance",
  roles: ["Company Admin"],
  status: "ACTIVE",
  lastLogin: null,
};

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Compliance",
  headName: "User 001",
  status: "ACTIVE",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const policy = {
  id: "p0000000-0000-4000-8000-000000000001",
  code: "POL-001",
  title: "Access Policy",
};

const parentControl = {
  id: "c0000000-0000-4000-8000-000000000001",
  code: "CTL-001",
  title: "Access Control Review",
  owner: { id: userOne.id, code: userOne.code, name: userOne.name },
  department: {
    id: department.id,
    code: department.code,
    name: department.name,
  },
  implementationStatus: "IN_PROGRESS",
  controlType: "PREVENTIVE",
  frequency: "MONTHLY",
  requiresEvidence: false,
  lifecycleStatus: "ACTIVE" as string,
  lastReviewDate: null,
  nextReviewDate: "2026-08-15",
  activePolicyVersionMappingCount: 1,
  activeFrameworkMappingCount: 0,
  activeFrameworkRuleMappingCount: 0,
  activeCheckpointCount: 1,
  inactiveCheckpointCount: 0,
  archivedCheckpointCount: 0,
  description: "Control description",
  objective: "Protect access pathways",
  implementationNotes: null,
  verificationMethod: "Sample verification",
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

let checkpoint = {
  id: "d0000000-0000-4000-8000-000000000001",
  code: "CHK-001",
  title: "Monthly access verification",
  description: "Checkpoint description",
  expectedResult: "Access review completed with evidence",
  verificationFrequency: "MONTHLY",
  owner: { id: userOne.id, code: userOne.code, name: userOne.name },
  department: {
    id: department.id,
    code: department.code,
    name: department.name,
  },
  evidenceRequired: false,
  lifecycleStatus: "ACTIVE",
  initialReviewDate: "2026-07-01",
  nextReviewDate: "2026-08-01",
  lastReviewedAt: null as string | null,
  control: {
    id: parentControl.id,
    code: parentControl.code,
    title: parentControl.title,
    lifecycleStatus: parentControl.lifecycleStatus,
  },
  latestOutcome: null as string | null,
  latestReview: null as null | Record<string, unknown>,
  totalReviewCount: 0,
  activePolicyVersionMappingCount: 1,
  activeFrameworkMappingCount: 0,
  activeFrameworkRuleMappingCount: 0,
  archivedAt: null as string | null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

let reviews: Array<Record<string, unknown>> = [];
let latestReview: Record<string, unknown> | null = null;
let auditEvents: Array<Record<string, unknown>> = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    action: "CHECKPOINT_CREATED",
    entityType: "Checkpoint",
    entityId: checkpoint.id,
    metadata: {
      code: "CHK-001",
      observation: "MUST_NOT_APPEAR",
      recommendation: "MUST_NOT_APPEAR",
      expectedResult: "MUST_NOT_APPEAR",
      fromStatus: null,
      toStatus: "ACTIVE",
    },
    createdAt: "2026-07-28T00:00:00.000Z",
    userId: userOne.id,
  },
];

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, error: { code, message } },
});

async function installCheckpointWorkflowMock(
  page: Page,
  options: {
    permissions?: string[];
  } = {},
) {
  const permissions = options.permissions ?? [
    "*",
    "checkpoints:read",
    "checkpoints:write",
    "checkpoints:review",
    "controls:read",
    "policies:read",
    "users:read",
    "organisation:read",
  ];
  const canRead =
    permissions.includes("*") || permissions.includes("checkpoints:read");
  const canWrite =
    permissions.includes("*") || permissions.includes("checkpoints:write");
  const canReview =
    permissions.includes("*") || permissions.includes("checkpoints:review");
  let activeCompany = company;
  const reviewBodies: unknown[] = [];

  const identity = () => ({
    id: userOne.id,
    code: userOne.code,
    name: userOne.name,
    email: userOne.email,
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions,
    activeCompany,
    companies: [company, companyTwo],
  });

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
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

    if (path === "/api/v1/auth/tenant-context" && method === "POST") {
      const body = request.postDataJSON() as { companyId: string };
      activeCompany =
        body.companyId === companyTwo.id ? companyTwo : company;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }

    if (path === "/api/v1/users" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([userOne])),
      });
    }

    if (path === "/api/v1/organisation/departments" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([department])),
      });
    }

    if (path === "/api/v1/controls" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([parentControl], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (
      path === `/api/v1/controls/${parentControl.id}` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(parentControl)),
      });
    }

    if (
      path === `/api/v1/controls/${parentControl.id}/traceability` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            control: parentControl,
            policyVersionMappings: [],
            frameworkMappings: [],
            frameworkRuleMappings: [],
            checkpointCounts: {
              active: parentControl.activeCheckpointCount,
              inactive: parentControl.inactiveCheckpointCount,
              archived: parentControl.archivedCheckpointCount,
            },
          }),
        ),
      });
    }

    if (
      path === `/api/v1/controls/${parentControl.id}/audit-events` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 20, total: 0, totalPages: 1 }),
        ),
      });
    }

    if (path === "/api/v1/checkpoints" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([checkpoint], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path.startsWith(`/api/v1/checkpoints/${checkpoint.id}`)) {
      if (!canRead && method === "GET") {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }

      if (path.endsWith("/latest-review") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(latestReview)),
        });
      }

      if (path.endsWith("/reviews") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success(reviews, {
              page: 1,
              pageSize: 20,
              total: reviews.length,
              totalPages: 1,
            }),
          ),
        });
      }

      if (path.endsWith("/reviews") && method === "POST") {
        if (!canReview) {
          const denied = failure(403, "FORBIDDEN", "Permission denied");
          return route.fulfill({
            status: denied.status,
            contentType: "application/json",
            body: JSON.stringify(denied.body),
          });
        }
        if (checkpoint.lifecycleStatus !== "ACTIVE") {
          const blocked = failure(
            409,
            "CHECKPOINT_INVALID_STATE",
            "Checkpoint reviews require an ACTIVE Checkpoint",
          );
          return route.fulfill({
            status: blocked.status,
            contentType: "application/json",
            body: JSON.stringify(blocked.body),
          });
        }
        const body = request.postDataJSON() as {
          reviewPeriod: string;
          reviewDate: string;
          outcome: string;
          observation?: string | null;
          recommendation?: string | null;
          nextReviewDate?: string | null;
        };
        reviewBodies.push(body);
        if (reviews.some((entry) => entry.reviewPeriod === body.reviewPeriod)) {
          const dup = failure(
            409,
            "CHECKPOINT_REVIEW_DUPLICATE",
            "Review period already exists",
          );
          return route.fulfill({
            status: dup.status,
            contentType: "application/json",
            body: JSON.stringify(dup.body),
          });
        }
        if (
          (body.outcome === "PARTIAL" || body.outcome === "FAIL") &&
          (body.observation?.trim().length ?? 0) < 2
        ) {
          const invalid = failure(
            400,
            "CHECKPOINT_REVIEW_INVALID",
            "PARTIAL and FAIL reviews require an observation",
          );
          return route.fulfill({
            status: invalid.status,
            contentType: "application/json",
            body: JSON.stringify(invalid.body),
          });
        }
        const created = {
          id: `r0000000-0000-4000-8000-00000000000${reviews.length + 1}`,
          checkpointId: checkpoint.id,
          reviewPeriod: body.reviewPeriod,
          reviewDate: body.reviewDate,
          outcome: body.outcome,
          observation: body.observation ?? null,
          recommendation: body.recommendation ?? null,
          nextReviewDate: body.nextReviewDate ?? null,
          submittedAt: "2026-07-31T12:00:00.000Z",
          reviewer: {
            id: userOne.id,
            code: userOne.code,
            name: userOne.name,
          },
        };
        reviews = [created, ...reviews];
        latestReview = created;
        checkpoint = {
          ...checkpoint,
          totalReviewCount: reviews.length,
          latestOutcome: body.outcome,
          lastReviewedAt: created.submittedAt,
          nextReviewDate: body.nextReviewDate ?? checkpoint.nextReviewDate,
          latestReview: {
            id: created.id,
            reviewPeriod: created.reviewPeriod,
            reviewDate: created.reviewDate,
            outcome: created.outcome,
            nextReviewDate: created.nextReviewDate,
            submittedAt: created.submittedAt,
            reviewer: created.reviewer,
          },
        };
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(success(created)),
        });
      }

      if (path.endsWith("/traceability") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              checkpoint: {
                id: checkpoint.id,
                code: checkpoint.code,
                title: checkpoint.title,
                lifecycleStatus: checkpoint.lifecycleStatus,
                verificationFrequency: checkpoint.verificationFrequency,
              },
              control: checkpoint.control,
              latestReview: checkpoint.latestReview,
              totalReviewCount: checkpoint.totalReviewCount,
              policyVersionMappings: {
                active: [
                  {
                    id: "cpv-1",
                    isActive: true,
                    policyId: policy.id,
                    policyVersionId: "pv-1",
                    policy: {
                      id: policy.id,
                      code: policy.code,
                      title: policy.title,
                    },
                    policyVersion: {
                      id: "pv-1",
                      version: "1.0",
                      versionMajor: 1,
                      versionMinor: 0,
                      status: "APPROVED",
                    },
                  },
                ],
                historical: [],
              },
              frameworkMappings: { active: [], historical: [] },
              frameworkRuleMappings: { active: [], historical: [] },
            }),
          ),
        });
      }

      if (path.endsWith("/audit-events") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success(auditEvents, {
              page: 1,
              pageSize: 20,
              total: auditEvents.length,
              totalPages: 1,
            }),
          ),
        });
      }

      if (
        (path.endsWith("/activate") ||
          path.endsWith("/deactivate") ||
          path.endsWith("/archive")) &&
        method === "POST"
      ) {
        if (!canWrite) {
          const denied = failure(403, "FORBIDDEN", "Permission denied");
          return route.fulfill({
            status: denied.status,
            contentType: "application/json",
            body: JSON.stringify(denied.body),
          });
        }
        if (path.endsWith("/activate")) {
          if (checkpoint.control.lifecycleStatus === "ARCHIVED") {
            const blocked = failure(
              409,
              "CHECKPOINT_PARENT_CONTROL_ARCHIVED",
              "Parent Control is archived",
            );
            return route.fulfill({
              status: blocked.status,
              contentType: "application/json",
              body: JSON.stringify(blocked.body),
            });
          }
          checkpoint = { ...checkpoint, lifecycleStatus: "ACTIVE" };
        } else if (path.endsWith("/deactivate")) {
          checkpoint = { ...checkpoint, lifecycleStatus: "INACTIVE" };
        } else {
          checkpoint = {
            ...checkpoint,
            lifecycleStatus: "ARCHIVED",
            archivedAt: "2026-07-31T12:00:00.000Z",
          };
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(checkpoint)),
        });
      }

      if (method === "PATCH") {
        if (!canWrite) {
          const denied = failure(403, "FORBIDDEN", "Permission denied");
          return route.fulfill({
            status: denied.status,
            contentType: "application/json",
            body: JSON.stringify(denied.body),
          });
        }
        if (checkpoint.lifecycleStatus === "ARCHIVED") {
          const blocked = failure(
            409,
            "CHECKPOINT_INVALID_STATE",
            "Archived Checkpoint is immutable",
          );
          return route.fulfill({
            status: blocked.status,
            contentType: "application/json",
            body: JSON.stringify(blocked.body),
          });
        }
        const body = request.postDataJSON() as Record<string, unknown>;
        if (
          checkpoint.totalReviewCount > 0 &&
          body.verificationFrequency !== undefined &&
          body.verificationFrequency !== checkpoint.verificationFrequency
        ) {
          const blocked = failure(
            409,
            "CHECKPOINT_INVALID_STATE",
            "verificationFrequency cannot change after the first Review",
          );
          return route.fulfill({
            status: blocked.status,
            contentType: "application/json",
            body: JSON.stringify(blocked.body),
          });
        }
        if (
          checkpoint.totalReviewCount > 0 &&
          body.initialReviewDate !== undefined &&
          body.initialReviewDate !== checkpoint.initialReviewDate
        ) {
          const blocked = failure(
            409,
            "CHECKPOINT_INVALID_STATE",
            "initialReviewDate cannot change after the first Review",
          );
          return route.fulfill({
            status: blocked.status,
            contentType: "application/json",
            body: JSON.stringify(blocked.body),
          });
        }
        checkpoint = {
          ...checkpoint,
          ...(typeof body.title === "string" ? { title: body.title } : {}),
          ...(typeof body.expectedResult === "string"
            ? { expectedResult: body.expectedResult }
            : {}),
          ...(typeof body.verificationFrequency === "string"
            ? { verificationFrequency: body.verificationFrequency }
            : {}),
          ...(body.nextReviewDate !== undefined
            ? { nextReviewDate: body.nextReviewDate as string | null }
            : {}),
          updatedAt: "2026-07-31T12:30:00.000Z",
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(checkpoint)),
        });
      }

      if (method === "GET" && path === `/api/v1/checkpoints/${checkpoint.id}`) {
        if (activeCompany.id !== company.id) {
          const missing = failure(
            404,
            "CHECKPOINT_NOT_FOUND",
            "Checkpoint not found",
          );
          return route.fulfill({
            status: missing.status,
            contentType: "application/json",
            body: JSON.stringify(missing.body),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(checkpoint)),
        });
      }
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

  return { reviewBodies };
}

test.describe("Checkpoint detail and Review workflows", () => {
  test.beforeEach(() => {
    checkpoint = {
      ...checkpoint,
      title: "Monthly access verification",
      lifecycleStatus: "ACTIVE",
      totalReviewCount: 0,
      latestOutcome: null,
      latestReview: null,
      lastReviewedAt: null,
      nextReviewDate: "2026-08-01",
      verificationFrequency: "MONTHLY",
      initialReviewDate: "2026-07-01",
      archivedAt: null,
      control: {
        id: parentControl.id,
        code: parentControl.code,
        title: parentControl.title,
        lifecycleStatus: "ACTIVE",
      },
    };
    reviews = [];
    latestReview = null;
    parentControl.lifecycleStatus = "ACTIVE";
    parentControl.activeCheckpointCount = 1;
  });

  test("edits Checkpoint scalars and freezes schedule after first Review", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await page.getByTestId("checkpoint-edit-open").click();
    await page.locator("#checkpoint-title").fill("Updated Checkpoint title");
    await page.getByTestId("checkpoint-form-save").click();
    await expect(
      page.getByRole("heading", { name: "Updated Checkpoint title" }),
    ).toBeVisible();

    await page.getByTestId("checkpoint-review-open").click();
    await page.getByTestId("checkpoint-review-period").fill("2026-07");
    await page.getByTestId("checkpoint-review-date").fill("2026-07-31");
    await page.getByTestId("checkpoint-review-outcome").selectOption("PASS");
    await page.getByTestId("checkpoint-review-save").click();
    await expect(page.getByTestId("checkpoint-latest-review-body")).toBeVisible();

    await page.getByTestId("checkpoint-edit-open").click();
    await expect(page.locator("#checkpoint-frequency")).toBeDisabled();
    await expect(page.locator("#checkpoint-initial-review")).toBeDisabled();
    await expect(
      page.getByText(
        "verificationFrequency and initialReviewDate are frozen after the first Review",
      ),
    ).toBeVisible();
  });

  test("submits Review with observation for FAIL and shows history", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await page.getByTestId("checkpoint-review-open").click();
    await page.getByTestId("checkpoint-review-period").fill("2026-07");
    await page.getByTestId("checkpoint-review-date").fill("2026-07-31");
    await page.getByTestId("checkpoint-review-outcome").selectOption("FAIL");
    await page.getByTestId("checkpoint-review-save").click();
    await expect(page.getByTestId("checkpoint-review-error")).toBeVisible();
    await expect(page.getByTestId("checkpoint-review-period")).toHaveValue(
      "2026-07",
    );

    await page
      .getByTestId("checkpoint-review-observation")
      .fill("Needs follow-up");
    await page
      .getByTestId("checkpoint-review-recommendation")
      .fill("Retest access paths");
    await page.getByTestId("checkpoint-review-save").click();
    await expect(page.getByTestId("checkpoint-latest-review-body")).toContainText(
      "Needs follow-up",
    );
    await expect(page.getByTestId("checkpoint-review-history")).toContainText(
      "Needs follow-up",
    );
    await expect(page.getByTestId("checkpoint-review-history")).toContainText(
      "Retest access paths",
    );
  });

  test("preserves form on duplicate review period", async ({ page }) => {
    await installCheckpointWorkflowMock(page);
    reviews = [
      {
        id: "r-existing",
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-07",
        reviewDate: "2026-07-15",
        outcome: "PASS",
        observation: null,
        recommendation: null,
        nextReviewDate: null,
        submittedAt: "2026-07-15T12:00:00.000Z",
        reviewer: {
          id: userOne.id,
          code: userOne.code,
          name: userOne.name,
        },
      },
    ];
    checkpoint = { ...checkpoint, totalReviewCount: 1 };
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await page.getByTestId("checkpoint-review-open").click();
    await page.getByTestId("checkpoint-review-period").fill("2026-07");
    await page.getByTestId("checkpoint-review-date").fill("2026-07-31");
    await page
      .getByTestId("checkpoint-review-observation")
      .fill("Duplicate attempt notes");
    await page.getByTestId("checkpoint-review-save").click();
    await expect(
      page.getByText("A Review already exists for this period"),
    ).toBeVisible();
    await expect(page.getByTestId("checkpoint-review-period")).toHaveValue(
      "2026-07",
    );
    await expect(
      page.getByTestId("checkpoint-review-observation"),
    ).toHaveValue("Duplicate attempt notes");
  });

  test("hides Review action when Checkpoint is INACTIVE", async ({ page }) => {
    checkpoint = { ...checkpoint, lifecycleStatus: "INACTIVE" };
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await expect(page.getByTestId("checkpoint-review-open")).toHaveCount(0);
    await expect(page.getByTestId("checkpoint-activate-open")).toBeVisible();
  });

  test("archives Checkpoint and shows read-only banner", async ({ page }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await page.getByTestId("checkpoint-archive-open").click();
    await page.getByTestId("checkpoint-lifecycle-archive-confirm").click();
    await expect(page.getByTestId("checkpoint-archived-banner")).toBeVisible();
    await expect(page.getByTestId("checkpoint-edit-open")).toHaveCount(0);
    await expect(page.getByTestId("checkpoint-review-open")).toHaveCount(0);
  });

  test("audit panel never shows observation or recommendation text", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await expect(page.getByTestId("checkpoint-audit-history")).toContainText(
      "CHECKPOINT CREATED",
    );
    await expect(page.getByTestId("checkpoint-audit-history")).not.toContainText(
      "MUST_NOT_APPEAR",
    );
  });

  test("links Control and Policy from traceability when permitted", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await expect(
      page.getByTestId("checkpoint-traceability-control").getByRole("link", {
        name: "CTL-001",
      }),
    ).toBeVisible();
    await page
      .getByTestId("checkpoint-traceability-policies")
      .getByRole("link", { name: "POL-001" })
      .click();
    await expect(page).toHaveURL(`/compliance/policies/${policy.id}`);
  });

  test("Control detail Open Checkpoints navigates without controlId state", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/controls/${parentControl.id}`);
    await expect(page.getByTestId("control-checkpoint-active")).toHaveText("1");
    await page.getByTestId("control-open-checkpoints").click();
    await expect(page).toHaveURL("/compliance/checkpoints");
    await expect(
      page.getByRole("heading", { name: "Checkpoint Register" }),
    ).toBeVisible();
  });

  test("closes Review dialog and clears text on company switch", async ({
    page,
  }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto(`/compliance/checkpoints/${checkpoint.id}`);
    await page.getByTestId("checkpoint-review-open").click();
    await page
      .getByTestId("checkpoint-review-observation")
      .fill("Sensitive observation text");
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(page.getByTestId("checkpoint-review-observation")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("checkpoint-detail-loading")).toHaveCount(0);
    await expect(page.getByText("Checkpoint not found")).toBeVisible();
    await expect(page.getByText("Sensitive observation text")).toHaveCount(0);
  });

  test("does not show Review on Register", async ({ page }) => {
    await installCheckpointWorkflowMock(page);
    await page.goto("/compliance/checkpoints");
    await expect(page.getByTestId("checkpoint-review-open")).toHaveCount(0);
    await expect(page.getByText("Submit Review")).toHaveCount(0);
  });
});
