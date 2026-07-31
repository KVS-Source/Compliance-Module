/**
 * Milestone 4 cross-module frontend integration suite.
 *
 * Browser-level API mocks via Playwright `page.route` against `/api/v1/**`.
 * These tests are NOT browser-to-database end-to-end and do not exercise
 * Express/PostgreSQL. In-memory `setActor` / `setPermissions` switches simulate
 * UI permission flows only; they are not JWT/auth or PostgreSQL authority.
 * Backend PostgreSQL integration tests remain the permissions/auth/DB authority.
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

const submitter = {
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
  email: "submitter001@example.test",
};

const approver = {
  id: "20000000-0000-4000-8000-000000000002",
  code: "USR-002",
  name: "User 002",
  email: "approver001@example.test",
};

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Compliance",
};

const framework = {
  id: "60000000-0000-4000-8000-000000000001",
  code: "FRM-001",
  name: "ISO 9001",
  version: "2025",
  description: null,
  status: "ACTIVE",
};

const POLICY_ID = "a0000000-0000-4000-8000-000000000001";
const VERSION_ID = "a1000000-0000-4000-8000-000000000001";
const CONTROL_ID = "c0000000-0000-4000-8000-000000000001";
const CHECKPOINT_ID = "d0000000-0000-4000-8000-000000000001";
const REVIEW_ID = "e0000000-0000-4000-8000-000000000001";

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, error: { code, message } },
});

const REVIEW_BODY_ALLOWLIST = new Set([
  "reviewPeriod",
  "reviewDate",
  "outcome",
  "observation",
  "recommendation",
  "nextReviewDate",
]);

const ALL_M4_PERMISSIONS = [
  "*",
  "policies:read",
  "policies:write",
  "policies:submit",
  "policies:approve",
  "controls:read",
  "controls:write",
  "checkpoints:read",
  "checkpoints:write",
  "checkpoints:review",
  "frameworks:read",
  "users:read",
  "organisation:read",
];

type CapturedMutation = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
};

async function installM4IntegrationMock(
  page: Page,
  options: {
    permissions?: string[];
    actor?: "submitter" | "approver";
    versionStatus?: "DRAFT" | "SUBMITTED" | "APPROVED";
  } = {},
) {
  let permissions = options.permissions ?? ALL_M4_PERMISSIONS;
  let actor = options.actor === "approver" ? approver : submitter;
  let activeCompany = company;
  let versionStatus = options.versionStatus ?? "DRAFT";
  let currentApprovedId: string | null =
    versionStatus === "APPROVED" ? VERSION_ID : null;
  let submittedBy: typeof submitter | null =
    versionStatus === "SUBMITTED" || versionStatus === "APPROVED"
      ? submitter
      : null;
  let approvedBy: typeof approver | null =
    versionStatus === "APPROVED" ? approver : null;

  let controlCreated = versionStatus === "APPROVED";
  let checkpointCreated = false;
  let reviews: Array<Record<string, unknown>> = [];
  let latestReview: Record<string, unknown> | null = null;

  const mutations: CapturedMutation[] = [];
  const reviewPosts: CapturedMutation[] = [];

  const can = (code: string) =>
    permissions.includes("*") || permissions.includes(code);

  const identity = () => ({
    id: actor.id,
    code: actor.code,
    name: actor.name,
    email: actor.email,
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions,
    activeCompany,
    companies: [company, companyTwo],
  });

  const versionDto = () => ({
    id: VERSION_ID,
    policyId: POLICY_ID,
    sequence: 1,
    version: "1.0",
    versionMajor: 1,
    versionMinor: 0,
    content: "Initial policy content for M4 integration",
    purpose: "Protect information assets",
    scope: "All staff",
    changeSummary: "Initial draft",
    status: versionStatus,
    effectiveDate: null,
    reviewDate: null,
    requiresEvidence: false,
    requestedApprover: {
      id: approver.id,
      code: approver.code,
      name: approver.name,
    },
    submittedBy: submittedBy
      ? { id: submittedBy.id, code: submittedBy.code, name: submittedBy.name }
      : null,
    submittedAt: submittedBy ? "2026-07-31T04:00:00.000Z" : null,
    approvedBy: approvedBy
      ? { id: approvedBy.id, code: approvedBy.code, name: approvedBy.name }
      : null,
    approvedAt: approvedBy ? "2026-07-31T05:00:00.000Z" : null,
    supersededById: null,
    frameworks: [
      {
        id: "af000000-0000-4000-8000-000000000001",
        frameworkId: framework.id,
        isActive: true,
        framework: {
          id: framework.id,
          code: framework.code,
          name: framework.name,
          version: framework.version,
        },
      },
    ],
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  });

  const policyDto = () => {
    const latest = versionDto();
    const approved = currentApprovedId ? latest : null;
    return {
      id: POLICY_ID,
      code: "POL-001",
      title: "M4 Integration Policy",
      description: "Cross-module demonstration policy",
      lifecycleStatus: "ACTIVE",
      owner: {
        id: submitter.id,
        code: submitter.code,
        name: submitter.name,
      },
      department: {
        id: department.id,
        code: department.code,
        name: department.name,
      },
      currentApprovedVersion: approved,
      latestVersion: latest,
      archivedAt: null,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
  };

  const controlDto = () => ({
    id: CONTROL_ID,
    code: "CTL-001",
    title: "M4 Integration Control",
    description: "Control linked to approved Policy Version",
    objective: "Demonstrate Policy → Control linkage",
    owner: {
      id: submitter.id,
      code: submitter.code,
      name: submitter.name,
    },
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
    },
    implementationStatus: "IN_PROGRESS",
    implementationNotes: null,
    controlType: "PREVENTIVE",
    frequency: "MONTHLY",
    verificationMethod: "Checkpoint reviews",
    requiresEvidence: false,
    lifecycleStatus: "ACTIVE",
    lastReviewDate: null,
    nextReviewDate: "2026-08-15",
    activePolicyVersionMappingCount: 1,
    activeFrameworkMappingCount: 1,
    activeFrameworkRuleMappingCount: 0,
    activeCheckpointCount: checkpointCreated ? 1 : 0,
    inactiveCheckpointCount: 0,
    archivedCheckpointCount: 0,
    archivedAt: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  });

  const checkpointDto = () => ({
    id: CHECKPOINT_ID,
    code: "CHK-001",
    title: "M4 Integration Checkpoint",
    description: "Checkpoint under Control CTL-001",
    expectedResult: "Verification completed",
    verificationFrequency: "MONTHLY",
    owner: {
      id: submitter.id,
      code: submitter.code,
      name: submitter.name,
    },
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
    },
    evidenceRequired: false,
    lifecycleStatus: "ACTIVE",
    initialReviewDate: "2026-07-01",
    nextReviewDate: latestReview
      ? ((latestReview.nextReviewDate as string | null) ?? "2026-08-01")
      : "2026-08-01",
    lastReviewedAt: latestReview
      ? ((latestReview.submittedAt as string) ?? null)
      : null,
    control: {
      id: CONTROL_ID,
      code: "CTL-001",
      title: "M4 Integration Control",
      lifecycleStatus: "ACTIVE",
    },
    latestOutcome: latestReview
      ? ((latestReview.outcome as string) ?? null)
      : null,
    latestReview,
    totalReviewCount: reviews.length,
    activePolicyVersionMappingCount: 1,
    activeFrameworkMappingCount: 1,
    activeFrameworkRuleMappingCount: 0,
    archivedAt: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  });

  const captureMutation = (request: {
    url: () => string;
    method: () => string;
    postDataJSON: () => unknown;
  }) => {
    let body: Record<string, unknown> | null = null;
    try {
      body = request.postDataJSON() as Record<string, unknown>;
    } catch {
      body = null;
    }
    mutations.push({
      url: request.url(),
      method: request.method(),
      body,
    });
    return body;
  };

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
        body: JSON.stringify(
          success([
            {
              ...submitter,
              phone: null,
              department: "Compliance",
              roles: [],
              status: "ACTIVE",
              lastLogin: null,
            },
            {
              ...approver,
              phone: null,
              department: "Compliance",
              roles: [],
              status: "ACTIVE",
              lastLogin: null,
            },
          ]),
        ),
      });
    }

    if (path === "/api/v1/organisation/departments" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([
            {
              ...department,
              headName: "User 002",
              status: "ACTIVE",
              createdAt: "2026-07-01T00:00:00.000Z",
            },
          ]),
        ),
      });
    }

    if (path === "/api/v1/frameworks" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([framework])),
      });
    }

    if (path === "/api/v1/policies" && method === "GET") {
      if (!can("policies:read")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      if (activeCompany.id !== company.id) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success([], { page: 1, pageSize: 20, total: 0, totalPages: 1 }),
          ),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([policyDto()], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/policies" && method === "POST") {
      const body = captureMutation(request);
      expect(body).not.toBeNull();
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("actorId");
      if (!can("policies:write")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      versionStatus = "DRAFT";
      currentApprovedId = null;
      submittedBy = null;
      approvedBy = null;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(policyDto())),
      });
    }

    if (path === `/api/v1/policies/${POLICY_ID}` && method === "GET") {
      if (activeCompany.id !== company.id) {
        const missing = failure(404, "POLICY_NOT_FOUND", "Policy not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(policyDto())),
      });
    }

    if (
      path === `/api/v1/policies/${POLICY_ID}/versions` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([versionDto()])),
      });
    }

    if (
      path === `/api/v1/policy-versions/${VERSION_ID}/frameworks` &&
      method === "PUT"
    ) {
      const body = captureMutation(request);
      expect(body).toEqual({ frameworkIds: [framework.id] });
      expect(body).not.toHaveProperty("tenantId");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(versionDto())),
      });
    }

    if (
      path === `/api/v1/policy-versions/${VERSION_ID}/submit` &&
      method === "POST"
    ) {
      const body = captureMutation(request);
      expect(body).toEqual({});
      if (!can("policies:submit")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      versionStatus = "SUBMITTED";
      submittedBy = submitter;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(versionDto())),
      });
    }

    if (
      path === `/api/v1/policy-versions/${VERSION_ID}/approve` &&
      method === "POST"
    ) {
      const body = captureMutation(request);
      expect(body === null || Object.keys(body).every((k) => k === "comments")).toBe(
        true,
      );
      expect(body ?? {}).not.toHaveProperty("tenantId");
      expect(body ?? {}).not.toHaveProperty("actorId");
      expect(body ?? {}).not.toHaveProperty("reviewerId");
      if (!can("policies:approve")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      if (actor.id === submittedBy?.id) {
        const denied = failure(
          403,
          "POLICY_SELF_APPROVAL_FORBIDDEN",
          "Self-approval is forbidden",
        );
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      versionStatus = "APPROVED";
      approvedBy = approver;
      currentApprovedId = VERSION_ID;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(versionDto())),
      });
    }

    if (
      path === `/api/v1/policies/${POLICY_ID}/traceability` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            policy: {
              ...policyDto(),
              latestVersion: versionDto(),
            },
            focusVersion: versionDto(),
            controlMappings: controlCreated
              ? [
                  {
                    id: "cpv00000-0000-4000-8000-000000000001",
                    isActive: true,
                    control: {
                      id: CONTROL_ID,
                      code: "CTL-001",
                      title: "M4 Integration Control",
                      lifecycleStatus: "ACTIVE",
                    },
                    policyVersion: {
                      id: VERSION_ID,
                      version: "1.0",
                      status: "APPROVED",
                    },
                  },
                ]
              : [],
          }),
        ),
      });
    }

    if (
      path === `/api/v1/policies/${POLICY_ID}/audit-events` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(
            [
              {
                id: "aa000000-0000-4000-8000-000000000001",
                action: "POLICY_CREATED",
                entityType: "POLICY",
                entityId: POLICY_ID,
                metadata: { code: "POL-001", status: "ACTIVE" },
                createdAt: "2026-07-28T00:00:00.000Z",
                userId: submitter.id,
              },
            ],
            { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          ),
        ),
      });
    }

    if (path === "/api/v1/controls" && method === "GET") {
      if (!can("controls:read")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const rows = controlCreated && activeCompany.id === company.id
        ? [controlDto()]
        : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(rows, {
            page: 1,
            pageSize: 20,
            total: rows.length,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/controls" && method === "POST") {
      const body = captureMutation(request);
      expect(body).not.toBeNull();
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("actorId");
      expect(body).not.toHaveProperty("code");
      expect(body).not.toHaveProperty("lifecycleStatus");
      if (!can("controls:write")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      controlCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(controlDto())),
      });
    }

    if (path === `/api/v1/controls/${CONTROL_ID}` && method === "GET") {
      if (activeCompany.id !== company.id || !controlCreated) {
        const missing = failure(404, "CONTROL_NOT_FOUND", "Control not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(controlDto())),
      });
    }

    if (
      path === `/api/v1/controls/${CONTROL_ID}/traceability` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            control: controlDto(),
            policyVersionMappings: [
              {
                id: "cpv-active",
                isActive: true,
                policyId: POLICY_ID,
                policyVersionId: VERSION_ID,
                policy: {
                  id: POLICY_ID,
                  code: "POL-001",
                  title: "M4 Integration Policy",
                },
                policyVersion: {
                  id: VERSION_ID,
                  version: "1.0",
                  versionMajor: 1,
                  versionMinor: 0,
                  status: "APPROVED",
                },
              },
            ],
            frameworkMappings: [],
            frameworkRuleMappings: [],
            checkpointCounts: {
              active: checkpointCreated ? 1 : 0,
              inactive: 0,
              archived: 0,
            },
          }),
        ),
      });
    }

    if (
      path === `/api/v1/controls/${CONTROL_ID}/audit-events` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(
            [
              {
                id: "ca000000-0000-4000-8000-000000000001",
                action: "CONTROL_CREATED",
                entityType: "CONTROL",
                entityId: CONTROL_ID,
                metadata: { code: "CTL-001", status: "ACTIVE" },
                createdAt: "2026-07-28T00:00:00.000Z",
                userId: submitter.id,
              },
            ],
            { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          ),
        ),
      });
    }

    // Eligible approved Policy Versions for Control mapping selectors
    if (
      path.startsWith("/api/v1/policies") &&
      method === "GET" &&
      url.searchParams.get("lifecycleStatus") === "ACTIVE"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([policyDto()], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/checkpoints" && method === "GET") {
      if (!can("checkpoints:read")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const rows =
        checkpointCreated && activeCompany.id === company.id
          ? [checkpointDto()]
          : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(rows, {
            page: 1,
            pageSize: 20,
            total: rows.length,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/checkpoints" && method === "POST") {
      const body = captureMutation(request);
      expect(body).not.toBeNull();
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("actorId");
      expect(body).not.toHaveProperty("reviewerId");
      expect(body).not.toHaveProperty("code");
      expect(body).not.toHaveProperty("lifecycleStatus");
      if (!can("checkpoints:write")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      checkpointCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(checkpointDto())),
      });
    }

    if (path === `/api/v1/checkpoints/${CHECKPOINT_ID}` && method === "GET") {
      if (activeCompany.id !== company.id || !checkpointCreated) {
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
        body: JSON.stringify(success(checkpointDto())),
      });
    }

    if (
      path === `/api/v1/checkpoints/${CHECKPOINT_ID}/reviews` &&
      method === "POST"
    ) {
      const body = captureMutation(request) ?? {};
      reviewPosts.push({
        url: request.url(),
        method,
        body,
      });
      expect(
        Object.keys(body).every((key) => REVIEW_BODY_ALLOWLIST.has(key)),
      ).toBe(true);
      for (const forbidden of [
        "tenantId",
        "reviewerId",
        "actorId",
        "comments",
        "checkpointId",
        "submittedAt",
      ]) {
        expect(body).not.toHaveProperty(forbidden);
      }
      if (!can("checkpoints:review")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const created = {
        id: REVIEW_ID,
        checkpointId: CHECKPOINT_ID,
        reviewPeriod: body.reviewPeriod,
        reviewDate: body.reviewDate,
        outcome: body.outcome,
        observation: body.observation ?? null,
        recommendation: body.recommendation ?? null,
        nextReviewDate: body.nextReviewDate ?? null,
        submittedAt: "2026-07-31T12:00:00.000Z",
        reviewer: {
          id: actor.id,
          code: actor.code,
          name: actor.name,
        },
      };
      reviews = [created, ...reviews];
      latestReview = created;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    if (
      path === `/api/v1/checkpoints/${CHECKPOINT_ID}/reviews` &&
      method === "GET"
    ) {
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

    if (
      path === `/api/v1/checkpoints/${CHECKPOINT_ID}/latest-review` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(latestReview)),
      });
    }

    if (
      path === `/api/v1/checkpoints/${CHECKPOINT_ID}/traceability` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            checkpoint: {
              id: CHECKPOINT_ID,
              code: "CHK-001",
              title: "M4 Integration Checkpoint",
              lifecycleStatus: "ACTIVE",
              verificationFrequency: "MONTHLY",
            },
            control: {
              id: CONTROL_ID,
              code: "CTL-001",
              title: "M4 Integration Control",
              lifecycleStatus: "ACTIVE",
            },
            latestReview,
            totalReviewCount: reviews.length,
            policyVersionMappings: {
              active: [
                {
                  id: "cpv-active",
                  isActive: true,
                  policyId: POLICY_ID,
                  policyVersionId: VERSION_ID,
                  policy: {
                    id: POLICY_ID,
                    code: "POL-001",
                    title: "M4 Integration Policy",
                  },
                  policyVersion: {
                    id: VERSION_ID,
                    version: "1.0",
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

    if (
      path === `/api/v1/checkpoints/${CHECKPOINT_ID}/audit-events` &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(
            [
              {
                id: "cha00000-0000-4000-8000-000000000001",
                action: "CHECKPOINT_CREATED",
                entityType: "Checkpoint",
                entityId: CHECKPOINT_ID,
                metadata: {
                  code: "CHK-001",
                  fromStatus: null,
                  toStatus: "ACTIVE",
                },
                createdAt: "2026-07-28T00:00:00.000Z",
                userId: submitter.id,
              },
            ],
            { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          ),
        ),
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

  return {
    mutations,
    reviewPosts,
    setActor: (next: "submitter" | "approver") => {
      actor = next === "approver" ? approver : submitter;
    },
    setPermissions: (next: string[]) => {
      permissions = next;
    },
    setVersionStatus: (
      status: "DRAFT" | "SUBMITTED" | "APPROVED",
    ) => {
      versionStatus = status;
      if (status === "APPROVED") {
        currentApprovedId = VERSION_ID;
        submittedBy = submitter;
        approvedBy = approver;
        controlCreated = true;
      } else if (status === "SUBMITTED") {
        currentApprovedId = null;
        submittedBy = submitter;
        approvedBy = null;
      } else {
        currentApprovedId = null;
        submittedBy = null;
        approvedBy = null;
      }
    },
    seedApprovedChain: () => {
      versionStatus = "APPROVED";
      currentApprovedId = VERSION_ID;
      submittedBy = submitter;
      approvedBy = approver;
      controlCreated = true;
      checkpointCreated = true;
    },
  };
}

test.describe("Milestone 4 cross-module integration (mocked APIs)", () => {
  test("walks Policy → Control → Checkpoint → Review with exact contracts", async ({
    page,
  }) => {
    const mock = await installM4IntegrationMock(page, {
      actor: "submitter",
      versionStatus: "DRAFT",
      permissions: [
        "policies:read",
        "policies:write",
        "policies:submit",
        "controls:read",
        "controls:write",
        "checkpoints:read",
        "checkpoints:write",
        "checkpoints:review",
        "frameworks:read",
        "users:read",
        "organisation:read",
      ],
    });

    await page.goto("/compliance/policy-register");
    await expect(
      page.getByRole("heading", { name: "Policy Register" }),
    ).toBeVisible();
    await expect(
      page.getByText("POL-001").filter({ visible: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "View POL-001" }).first().click();
    await expect(page).toHaveURL(`/compliance/policies/${POLICY_ID}`);
    await expect(page.getByTestId("policy-summary")).toBeVisible();
    await expect(page.getByTestId("policy-version-history")).toBeVisible();
    await expect(page.getByTestId("policy-framework-mapping")).toBeVisible();
    await expect(page.getByTestId("policy-active-frameworks")).toContainText(
      "ISO 9001",
    );

    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "SUBMITTED",
    );

    const submitMutation = mock.mutations.find(
      (entry) =>
        entry.method === "POST" &&
        entry.url.includes(`/policy-versions/${VERSION_ID}/submit`),
    );
    expect(submitMutation?.body).toEqual({});

    mock.setActor("approver");
    mock.setPermissions([
      "policies:read",
      "policies:approve",
      "controls:read",
      "controls:write",
      "checkpoints:read",
      "checkpoints:write",
      "checkpoints:review",
      "frameworks:read",
      "users:read",
      "organisation:read",
    ]);
    await page.reload();
    await expect(
      page
        .getByTestId("policy-version-row-1.0")
        .getByRole("button", { name: "Approve" }),
    ).toBeVisible();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Approve" })
      .click();
    await page.getByTestId("policy-decision-approve-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "APPROVED",
    );

    await expect(page.getByTestId("policy-traceability")).toBeVisible();
    await expect(page.getByTestId("policy-audit-history")).toBeVisible();

    await page.goto("/compliance/controls");
    await expect(
      page.getByRole("heading", { name: "Control Register" }),
    ).toBeVisible();
    await page.getByTestId("control-create-open").click();
    await page.locator("#control-title").fill("M4 Integration Control");
    await page
      .locator("#control-objective")
      .fill("Demonstrate Policy to Control linkage");
    await page.locator("#control-verification").fill("Checkpoint reviews");
    await expect(
      page.getByTestId("control-policy-version-options"),
    ).toContainText("POL-001");
    await page
      .getByTestId("control-policy-version-options")
      .getByRole("checkbox")
      .check();
    await page.getByTestId("control-form-save").click();
    await expect(page).toHaveURL(`/compliance/controls/${CONTROL_ID}`);

    const createControl = mock.mutations.find(
      (entry) =>
        entry.method === "POST" &&
        new URL(entry.url).pathname === "/api/v1/controls",
    );
    expect(createControl?.body).toMatchObject({
      title: "M4 Integration Control",
      objective: "Demonstrate Policy to Control linkage",
      verificationMethod: "Checkpoint reviews",
      policyVersionIds: [VERSION_ID],
    });
    expect(createControl?.body).not.toHaveProperty("tenantId");
    expect(createControl?.body).not.toHaveProperty("actorId");

    await expect(page.getByTestId("control-traceability")).toBeVisible();
    await expect(page.getByTestId("control-open-checkpoints")).toBeVisible();
    await page.getByTestId("control-open-checkpoints").click();
    await expect(page).toHaveURL("/compliance/checkpoints");

    await page.getByTestId("checkpoint-create-open").click();
    await page.getByTestId("checkpoint-form-control").selectOption(CONTROL_ID);
    await page.locator("#checkpoint-title").fill("M4 Integration Checkpoint");
    await page
      .locator("#checkpoint-expected-result")
      .fill("Verification completed");
    await page.getByTestId("checkpoint-form-save").click();
    await expect(page).toHaveURL(`/compliance/checkpoints/${CHECKPOINT_ID}`);

    const createCheckpoint = mock.mutations.find(
      (entry) =>
        entry.method === "POST" &&
        new URL(entry.url).pathname === "/api/v1/checkpoints",
    );
    expect(createCheckpoint?.body).toMatchObject({
      controlId: CONTROL_ID,
      title: "M4 Integration Checkpoint",
      expectedResult: "Verification completed",
    });
    expect(createCheckpoint?.body).not.toHaveProperty("tenantId");
    expect(createCheckpoint?.body).not.toHaveProperty("reviewerId");

    await expect(page.getByTestId("checkpoint-parent-control")).toContainText(
      "CTL-001",
    );
    await page.getByTestId("checkpoint-review-open").click();
    await page.getByTestId("checkpoint-review-period").fill("2026-07");
    await page.getByTestId("checkpoint-review-date").fill("2026-07-31");
    await page.getByTestId("checkpoint-review-outcome").selectOption("PASS");
    await page.getByTestId("checkpoint-review-save").click();

    await expect(page.getByTestId("checkpoint-latest-review-body")).toContainText(
      "PASS",
    );
    await expect(page.getByTestId("checkpoint-review-history")).toContainText(
      "2026-07",
    );
    await expect(page.getByTestId("checkpoint-traceability")).toBeVisible();
    await expect(page.getByTestId("checkpoint-audit-history")).toBeVisible();

    expect(mock.reviewPosts).toHaveLength(1);
    expect(new URL(mock.reviewPosts[0]!.url).pathname).toBe(
      `/api/v1/checkpoints/${CHECKPOINT_ID}/reviews`,
    );
    expect(mock.reviewPosts[0]!.method).toBe("POST");
    expect(mock.reviewPosts[0]!.body).toEqual({
      reviewPeriod: "2026-07",
      reviewDate: "2026-07-31",
      outcome: "PASS",
      observation: null,
      recommendation: null,
      nextReviewDate: null,
    });

    await page
      .getByTestId("checkpoint-traceability-control")
      .getByRole("link", { name: "CTL-001" })
      .click();
    await expect(page).toHaveURL(`/compliance/controls/${CONTROL_ID}`);
  });

  test("hides Policy submit without policies:submit", async ({ page }) => {
    await installM4IntegrationMock(page, {
      actor: "submitter",
      versionStatus: "DRAFT",
      permissions: ["policies:read", "policies:write", "frameworks:read"],
    });
    await page.goto(`/compliance/policies/${POLICY_ID}`);
    await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("hides Policy approve without policies:approve", async ({ page }) => {
    await installM4IntegrationMock(page, {
      actor: "approver",
      versionStatus: "SUBMITTED",
      permissions: ["policies:read", "frameworks:read"],
    });
    await page.goto(`/compliance/policies/${POLICY_ID}`);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });

  test("shows Policy approve only with policies:approve on SUBMITTED", async ({
    page,
  }) => {
    await installM4IntegrationMock(page, {
      actor: "approver",
      versionStatus: "SUBMITTED",
      permissions: ["policies:read", "policies:approve", "frameworks:read"],
    });
    await page.goto(`/compliance/policies/${POLICY_ID}`);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByTestId("policy-edit-open")).toHaveCount(0);
  });

  test("hides Control and Checkpoint writes and Review without permissions", async ({
    page,
  }) => {
    const mock = await installM4IntegrationMock(page, {
      actor: "approver",
      versionStatus: "APPROVED",
      permissions: [
        "controls:read",
        "checkpoints:read",
        "policies:read",
        "frameworks:read",
      ],
    });
    mock.seedApprovedChain();

    await page.goto("/compliance/controls");
    await expect(page.getByTestId("control-create-open")).toHaveCount(0);

    await page.goto(`/compliance/controls/${CONTROL_ID}`);
    await expect(page.getByTestId("control-edit-open")).toHaveCount(0);

    await page.goto("/compliance/checkpoints");
    await expect(page.getByTestId("checkpoint-create-open")).toHaveCount(0);

    await page.goto(`/compliance/checkpoints/${CHECKPOINT_ID}`);
    await expect(page.getByTestId("checkpoint-review-open")).toHaveCount(0);
    await expect(page.getByTestId("checkpoint-edit-open")).toHaveCount(0);
  });

  test("shows Review only with checkpoints:review", async ({ page }) => {
    const mock = await installM4IntegrationMock(page, {
      actor: "approver",
      versionStatus: "APPROVED",
      permissions: [
        "checkpoints:read",
        "checkpoints:write",
        "checkpoints:review",
        "controls:read",
        "policies:read",
      ],
    });
    mock.seedApprovedChain();
    await page.goto(`/compliance/checkpoints/${CHECKPOINT_ID}`);
    await expect(page.getByTestId("checkpoint-review-open")).toBeVisible();
    await expect(page.getByRole("button", { name: /edit review/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /delete review/i }),
    ).toHaveCount(0);
  });

  test("company switch clears Checkpoint detail and ignores old-company data", async ({
    page,
  }) => {
    const mock = await installM4IntegrationMock(page, {
      versionStatus: "APPROVED",
    });
    mock.seedApprovedChain();
    await page.goto(`/compliance/checkpoints/${CHECKPOINT_ID}`);
    await expect(
      page.getByRole("heading", { name: "M4 Integration Checkpoint" }),
    ).toBeVisible();
    await expect(page.getByTestId("checkpoint-summary")).toBeVisible();
    await expect(
      page.getByText("CHK-001").filter({ visible: true }).first(),
    ).toBeVisible();

    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(page.getByText("Checkpoint not found")).toBeVisible();
    await expect(page.getByTestId("checkpoint-summary")).toHaveCount(0);
    await expect(
      page.getByText("CHK-001").filter({ visible: true }),
    ).toHaveCount(0);
  });
});
