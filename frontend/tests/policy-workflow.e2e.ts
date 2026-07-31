/**
 * Policy workflow UI Playwright suite.
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

const frameworkA = {
  id: "60000000-0000-4000-8000-000000000001",
  code: "FRM-001",
  name: "ISO 9001",
  version: "2025",
  description: null,
  status: "ACTIVE",
};

const frameworkB = {
  id: "60000000-0000-4000-8000-000000000002",
  code: "FRM-002",
  name: "ISO 27001",
  version: "2022",
  description: null,
  status: "ACTIVE",
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

type VersionState = {
  id: string;
  policyId: string;
  sequence: number;
  version: string;
  versionMajor: number;
  versionMinor: number;
  content: string;
  purpose: string | null;
  scope: string | null;
  changeSummary: string | null;
  status: string;
  effectiveDate: string | null;
  reviewDate: string | null;
  requiresEvidence: boolean;
  requestedApprover: { id: string; code: string; name: string } | null;
  submittedBy: { id: string; code: string; name: string } | null;
  submittedAt: string | null;
  approvedBy: { id: string; code: string; name: string } | null;
  approvedAt: string | null;
  supersededById: string | null;
  frameworks: Array<{
    id: string;
    frameworkId: string;
    isActive: boolean;
    framework: {
      id: string;
      code: string;
      name: string;
      version: string;
    } | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

async function installPolicyWorkflowMock(
  page: Page,
  options: {
    actor: "submitter" | "approver";
    forceImmutable?: boolean;
    /** First Framework mapping PUT returns VALIDATION_ERROR on frameworkIds. */
    failFrameworkMappingOnce?: boolean;
  },
) {
  const actor = options.actor === "approver" ? approver : submitter;
  let frameworkMappingFailuresRemaining = options.failFrameworkMappingOnce
    ? 1
    : 0;
  let lifecycleStatus = "ACTIVE";
  let title = "Information Security Policy";
  let description: string | null = "Baseline security policy";
  let versions: VersionState[] = [
    {
      id: "a1000000-0000-4000-8000-000000000001",
      policyId: "a0000000-0000-4000-8000-000000000001",
      sequence: 1,
      version: "1.0",
      versionMajor: 1,
      versionMinor: 0,
      content: "Initial policy content",
      purpose: "Protect information assets",
      scope: "All staff",
      changeSummary: "Initial draft",
      status: "DRAFT",
      effectiveDate: null,
      reviewDate: null,
      requiresEvidence: false,
      requestedApprover: {
        id: approver.id,
        code: approver.code,
        name: approver.name,
      },
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      supersededById: null,
      frameworks: [
        {
          id: "af000000-0000-4000-8000-000000000001",
          frameworkId: frameworkA.id,
          isActive: true,
          framework: {
            id: frameworkA.id,
            code: frameworkA.code,
            name: frameworkA.name,
            version: frameworkA.version,
          },
        },
      ],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ];
  let currentApprovedId: string | null = null;
  let auditEvents: Array<Record<string, unknown>> = [
    {
      id: "aa000000-0000-4000-8000-000000000001",
      action: "POLICY_CREATED",
      entityType: "POLICY",
      entityId: "a0000000-0000-4000-8000-000000000001",
      metadata: { code: "POL-001", status: "ACTIVE" },
      createdAt: "2026-07-28T00:00:00.000Z",
      userId: submitter.id,
    },
  ];

  const policyDto = () => {
    const latest = [...versions].sort((a, b) => b.sequence - a.sequence)[0]!;
    const approved = currentApprovedId
      ? versions.find((entry) => entry.id === currentApprovedId) ?? null
      : null;
    return {
      id: "a0000000-0000-4000-8000-000000000001",
      code: "POL-001",
      title,
      description,
      lifecycleStatus,
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
      archivedAt:
        lifecycleStatus === "ARCHIVED" ? "2026-07-31T00:00:00.000Z" : null,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
  };

  const identity = () => ({
    id: actor.id,
    code: actor.code,
    name: actor.name,
    email: actor.email,
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
    permissions: ["*"],
    activeCompany: company,
    companies: [company],
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

    if (path === "/api/v1/users" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([
            { ...submitter, phone: null, department: "Compliance", roles: [], status: "ACTIVE", lastLogin: null },
            { ...approver, phone: null, department: "Compliance", roles: [], status: "ACTIVE", lastLogin: null },
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
        body: JSON.stringify(success([frameworkA, frameworkB])),
      });
    }

    if (
      path === "/api/v1/policies/a0000000-0000-4000-8000-000000000001" &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(policyDto())),
      });
    }

    if (
      path === "/api/v1/policies/a0000000-0000-4000-8000-000000000001" &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON() as {
        title?: string;
        description?: string | null;
      };
      if (body.title) title = body.title;
      if (body.description !== undefined) description = body.description;
      auditEvents = [
        {
          id: `aa000000-0000-4000-8000-0000000000${auditEvents.length + 1}`,
          action: "POLICY_UPDATED",
          entityType: "POLICY",
          entityId: "a0000000-0000-4000-8000-000000000001",
          metadata: {
            code: "POL-001",
            changedFields: ["title", "description"],
          },
          createdAt: "2026-07-31T01:00:00.000Z",
          userId: actor.id,
        },
        ...auditEvents,
      ];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(policyDto())),
      });
    }

    if (
      path ===
        "/api/v1/policies/a0000000-0000-4000-8000-000000000001/archive" &&
      method === "POST"
    ) {
      if (versions.some((entry) => entry.status === "SUBMITTED")) {
        const blocked = failure(
          409,
          "POLICY_VERSION_INVALID_STATE",
          "Cannot archive while a Version is submitted",
        );
        return route.fulfill({
          status: blocked.status,
          contentType: "application/json",
          body: JSON.stringify(blocked.body),
        });
      }
      lifecycleStatus = "ARCHIVED";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(policyDto())),
      });
    }

    if (
      path ===
        "/api/v1/policies/a0000000-0000-4000-8000-000000000001/versions" &&
      method === "GET"
    ) {
      const ordered = [...versions].sort((a, b) => b.sequence - a.sequence);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(ordered)),
      });
    }

    if (
      path ===
        "/api/v1/policies/a0000000-0000-4000-8000-000000000001/versions" &&
      method === "POST"
    ) {
      const body = request.postDataJSON() as {
        bump: "MAJOR" | "MINOR";
        content: string;
        changeSummary?: string | null;
        requiresEvidence?: boolean;
        frameworkIds?: string[];
      };
      const latest = [...versions].sort((a, b) => b.sequence - a.sequence)[0]!;
      const major =
        body.bump === "MAJOR" ? latest.versionMajor + 1 : latest.versionMajor;
      const minor = body.bump === "MAJOR" ? 0 : latest.versionMinor + 1;
      const created: VersionState = {
        ...latest,
        id: `a1000000-0000-4000-8000-0000000000${versions.length + 1}`,
        sequence: latest.sequence + 1,
        version: `${major}.${minor}`,
        versionMajor: major,
        versionMinor: minor,
        content: body.content,
        changeSummary: body.changeSummary ?? null,
        status: "DRAFT",
        requiresEvidence: Boolean(body.requiresEvidence),
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        frameworks: (body.frameworkIds ?? []).map((frameworkId, index) => {
          const fw = frameworkId === frameworkB.id ? frameworkB : frameworkA;
          return {
            id: `af000000-0000-4000-8000-0000000000${index + 2}`,
            frameworkId,
            isActive: true,
            framework: {
              id: fw.id,
              code: fw.code,
              name: fw.name,
              version: fw.version,
            },
          };
        }),
        createdAt: "2026-07-31T02:00:00.000Z",
        updatedAt: "2026-07-31T02:00:00.000Z",
      };
      versions = [...versions, created];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    const versionPatch = /^\/api\/v1\/policy-versions\/([^/]+)$/.exec(path);
    if (versionPatch && method === "PATCH") {
      if (options.forceImmutable) {
        const immutable = failure(
          409,
          "POLICY_VERSION_IMMUTABLE",
          "Policy Version cannot be modified in its current state",
        );
        return route.fulfill({
          status: immutable.status,
          contentType: "application/json",
          body: JSON.stringify(immutable.body),
        });
      }
      const versionId = versionPatch[1]!;
      const body = request.postDataJSON() as Partial<VersionState>;
      versions = versions.map((entry) =>
        entry.id === versionId
          ? {
              ...entry,
              ...body,
              content: body.content ?? entry.content,
              updatedAt: "2026-07-31T03:00:00.000Z",
            }
          : entry,
      );
      const updated = versions.find((entry) => entry.id === versionId)!;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(updated)),
      });
    }

    const frameworksPut =
      /^\/api\/v1\/policy-versions\/([^/]+)\/frameworks$/.exec(path);
    if (frameworksPut && method === "PUT") {
      const versionId = frameworksPut[1]!;
      const body = request.postDataJSON() as { frameworkIds: string[] };
      if (frameworkMappingFailuresRemaining > 0) {
        frameworkMappingFailuresRemaining -= 1;
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: [
                {
                  path: "frameworkIds",
                  message: "One or more Frameworks are invalid for mapping",
                },
              ],
            },
          }),
        });
      }
      versions = versions.map((entry) => {
        if (entry.id !== versionId) return entry;
        return {
          ...entry,
          frameworks: body.frameworkIds.map((frameworkId, index) => {
            const fw = frameworkId === frameworkB.id ? frameworkB : frameworkA;
            return {
              id: `af000000-0000-4000-8000-0000000000${index + 5}`,
              frameworkId,
              isActive: true,
              framework: {
                id: fw.id,
                code: fw.code,
                name: fw.name,
                version: fw.version,
              },
            };
          }),
        };
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(versions.find((entry) => entry.id === versionId)!),
        ),
      });
    }

    const submitMatch =
      /^\/api\/v1\/policy-versions\/([^/]+)\/submit$/.exec(path);
    if (submitMatch && method === "POST") {
      const versionId = submitMatch[1]!;
      versions = versions.map((entry) =>
        entry.id === versionId
          ? {
              ...entry,
              status: "SUBMITTED",
              submittedBy: {
                id: actor.id,
                code: actor.code,
                name: actor.name,
              },
              submittedAt: "2026-07-31T04:00:00.000Z",
              effectiveDate: entry.effectiveDate ?? "2026-07-31",
              reviewDate: entry.reviewDate ?? "2027-07-31",
            }
          : entry,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(versions.find((entry) => entry.id === versionId)!),
        ),
      });
    }

    const approveMatch =
      /^\/api\/v1\/policy-versions\/([^/]+)\/approve$/.exec(path);
    if (approveMatch && method === "POST") {
      const versionId = approveMatch[1]!;
      const version = versions.find((entry) => entry.id === versionId);
      if (!version) {
        const missing = failure(
          404,
          "POLICY_VERSION_NOT_FOUND",
          "Policy Version not found",
        );
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      if (version.submittedBy?.id === actor.id) {
        const denied = failure(
          403,
          "POLICY_SELF_APPROVAL_FORBIDDEN",
          "Policy Version self-approval is prohibited",
        );
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      if (version.requiresEvidence) {
        const blocked = failure(
          501,
          "EVIDENCE_GATE_NOT_IMPLEMENTED",
          "Policy approval requiring Evidence is unavailable until the Evidence milestone",
        );
        return route.fulfill({
          status: blocked.status,
          contentType: "application/json",
          body: JSON.stringify(blocked.body),
        });
      }
      if (currentApprovedId) {
        versions = versions.map((entry) =>
          entry.id === currentApprovedId
            ? { ...entry, status: "SUPERSEDED", supersededById: versionId }
            : entry,
        );
      }
      versions = versions.map((entry) =>
        entry.id === versionId
          ? {
              ...entry,
              status: "APPROVED",
              approvedBy: {
                id: actor.id,
                code: actor.code,
                name: actor.name,
              },
              approvedAt: "2026-07-31T05:00:00.000Z",
            }
          : entry,
      );
      currentApprovedId = versionId;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(versions.find((entry) => entry.id === versionId)!),
        ),
      });
    }

    const rejectMatch =
      /^\/api\/v1\/policy-versions\/([^/]+)\/reject$/.exec(path);
    if (rejectMatch && method === "POST") {
      const versionId = rejectMatch[1]!;
      const body = request.postDataJSON() as { comments?: string };
      if (!body.comments || body.comments.trim().length < 2) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: [
                {
                  path: "comments",
                  message: "Comments must be between 2 and 2000 characters",
                },
              ],
            },
          }),
        });
      }
      versions = versions.map((entry) =>
        entry.id === versionId ? { ...entry, status: "REJECTED" } : entry,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(versions.find((entry) => entry.id === versionId)!),
        ),
      });
    }

    if (
      path ===
        "/api/v1/policies/a0000000-0000-4000-8000-000000000001/traceability" &&
      method === "GET"
    ) {
      const policy = policyDto();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            policy,
            focusVersion: policy.currentApprovedVersion ?? policy.latestVersion,
            controlMappings: [
              {
                id: "ac000000-0000-4000-8000-000000000001",
                isActive: true,
                control: {
                  id: "c0000000-0000-4000-8000-000000000001",
                  code: "CTL-001",
                  title: "Access control",
                  lifecycleStatus: "ACTIVE",
                },
              },
            ],
          }),
        ),
      });
    }

    if (
      path ===
        "/api/v1/policies/a0000000-0000-4000-8000-000000000001/audit-events" &&
      method === "GET"
    ) {
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

const policyUrl =
  "/compliance/policies/a0000000-0000-4000-8000-000000000001";

test.describe("Policy workflow UI (mocked browser APIs)", () => {
  test("edits Policy metadata and shows Version history badges", async ({
    page,
  }) => {
    await installPolicyWorkflowMock(page, { actor: "submitter" });
    await page.goto(policyUrl);
    await expect(page.getByTestId("policy-summary")).toContainText("POL-001");
    await expect(page.getByTestId("policy-version-history")).toContainText(
      "Latest Version",
    );
    await expect(page.getByTestId("policy-version-history")).toContainText(
      "DRAFT",
    );
    await expect(page.getByTestId("policy-summary")).toContainText("None");

    await page.getByTestId("policy-edit-open").click();
    await page.getByLabel("Title (required)").fill("Updated Security Policy");
    await page.getByTestId("policy-form-save").click();
    await expect(page.getByRole("heading", { name: "Updated Security Policy" })).toBeVisible();
  });

  test("creates MINOR Version, edits draft, updates frameworks, submits", async ({
    page,
  }) => {
    await installPolicyWorkflowMock(page, { actor: "submitter" });
    await page.goto(policyUrl);

    await page.getByTestId("policy-version-create-open").click();
    await page.getByLabel("Content (required, plain text)").fill(
      "Revised policy content for minor bump",
    );
    await page.getByLabel("Change summary").fill("Clarify access rules");
    await page.getByTestId("policy-version-form-save").click();
    await expect(page.getByTestId("policy-version-row-1.1")).toBeVisible();

    await page
      .getByTestId("policy-version-row-1.1")
      .getByRole("button", { name: "Edit" })
      .click();
    await page.getByLabel("Content (required, plain text)").fill(
      "Revised policy content edited once",
    );
    await page.getByTestId("policy-version-form-save").click();
    await expect(page.getByText("Revised policy content edited once")).toBeVisible();

    await page.getByTestId("policy-framework-editor").getByText("ISO 27001").click();
    await page.getByTestId("policy-framework-save").click();
    await expect(page.getByTestId("policy-active-frameworks")).toContainText(
      "ISO 27001",
    );

    await page
      .getByTestId("policy-version-row-1.1")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.1")).toContainText(
      "SUBMITTED",
    );
  });

  test("blocks self-approval and maps Evidence 501", async ({ page }) => {
    await installPolicyWorkflowMock(page, { actor: "submitter" });
    await page.goto(policyUrl);
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Approve" })
      .click();
    await page.getByTestId("policy-decision-approve-confirm").click();
    await expect(page.getByTestId("policy-decision-error")).toContainText(
      "You cannot approve a Policy Version that you submitted",
    );
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByTestId("policy-version-create-open").click();
    await page.getByLabel("Content (required, plain text)").fill(
      "Evidence gated version body",
    );
    await page.getByLabel("Requires Evidence").check();
    await expect(page.getByTestId("policy-version-evidence-warning")).toBeVisible();
    await page.getByTestId("policy-version-form-save").click();
    await page
      .getByTestId("policy-version-row-1.1")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
  });

});

test.describe("Policy workflow decisions (single mocked session)", () => {
  test("reject, resubmit, approve, archive, traceability and audit", async ({
    page,
  }) => {
    let actor: "submitter" | "approver" = "submitter";
    const companyLocal = company;
    let lifecycleStatus = "ACTIVE";
    let versions: VersionState[] = [
      {
        id: "a1000000-0000-4000-8000-000000000001",
        policyId: "a0000000-0000-4000-8000-000000000001",
        sequence: 1,
        version: "1.0",
        versionMajor: 1,
        versionMinor: 0,
        content: "Initial policy content",
        purpose: "Protect information assets",
        scope: "All staff",
        changeSummary: "Initial draft",
        status: "DRAFT",
        effectiveDate: "2026-08-01",
        reviewDate: "2027-08-01",
        requiresEvidence: false,
        requestedApprover: {
          id: approver.id,
          code: approver.code,
          name: approver.name,
        },
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        supersededById: null,
        frameworks: [
          {
            id: "af000000-0000-4000-8000-000000000001",
            frameworkId: frameworkA.id,
            isActive: true,
            framework: {
              id: frameworkA.id,
              code: frameworkA.code,
              name: frameworkA.name,
              version: frameworkA.version,
            },
          },
        ],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
      },
    ];
    let currentApprovedId: string | null = null;

    const currentActor = () => (actor === "approver" ? approver : submitter);
    const policyDto = () => {
      const latest = [...versions].sort((a, b) => b.sequence - a.sequence)[0]!;
      const approved = currentApprovedId
        ? versions.find((entry) => entry.id === currentApprovedId) ?? null
        : null;
      return {
        id: "a0000000-0000-4000-8000-000000000001",
        code: "POL-001",
        title: "Information Security Policy",
        description: "Baseline",
        lifecycleStatus,
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
        archivedAt:
          lifecycleStatus === "ARCHIVED" ? "2026-07-31T00:00:00.000Z" : null,
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z",
      };
    };

    await page.route("**/api/v1/**", async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const me = currentActor();

      if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              accessToken: "mock-access-token",
              user: {
                id: me.id,
                code: me.code,
                name: me.name,
                email: me.email,
                phone: null,
                status: "ACTIVE",
                lastLogin: null,
                permissions: ["*"],
                activeCompany: companyLocal,
                companies: [companyLocal],
              },
            }),
          ),
        });
      }
      if (path === "/api/v1/users") {
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
      if (path === "/api/v1/organisation/departments") {
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
      if (path === "/api/v1/frameworks") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success([frameworkA, frameworkB])),
        });
      }
      if (
        path === "/api/v1/policies/a0000000-0000-4000-8000-000000000001" &&
        method === "GET"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(policyDto())),
        });
      }
      if (
        path ===
          "/api/v1/policies/a0000000-0000-4000-8000-000000000001/versions" &&
        method === "GET"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success([...versions].sort((a, b) => b.sequence - a.sequence)),
          ),
        });
      }
      if (path.endsWith("/submit") && method === "POST") {
        const versionId = path.split("/")[4]!;
        versions = versions.map((entry) =>
          entry.id === versionId
            ? {
                ...entry,
                status: "SUBMITTED",
                submittedBy: {
                  id: submitter.id,
                  code: submitter.code,
                  name: submitter.name,
                },
                submittedAt: "2026-07-31T04:00:00.000Z",
              }
            : entry,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success(versions.find((entry) => entry.id === versionId)!),
          ),
        });
      }
      if (path.endsWith("/reject") && method === "POST") {
        const versionId = path.split("/")[4]!;
        const body = request.postDataJSON() as { comments?: string };
        if (!body.comments || body.comments.trim().length < 2) {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Request validation failed",
                details: [{ path: "comments", message: "Required" }],
              },
            }),
          });
        }
        versions = versions.map((entry) =>
          entry.id === versionId ? { ...entry, status: "REJECTED" } : entry,
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success(versions.find((entry) => entry.id === versionId)!),
          ),
        });
      }
      if (path.endsWith("/approve") && method === "POST") {
        const versionId = path.split("/")[4]!;
        const version = versions.find((entry) => entry.id === versionId)!;
        if (version.submittedBy?.id === me.id) {
          const denied = failure(
            403,
            "POLICY_SELF_APPROVAL_FORBIDDEN",
            "Policy Version self-approval is prohibited",
          );
          return route.fulfill({
            status: denied.status,
            contentType: "application/json",
            body: JSON.stringify(denied.body),
          });
        }
        if (version.requiresEvidence) {
          const blocked = failure(
            501,
            "EVIDENCE_GATE_NOT_IMPLEMENTED",
            "Evidence unavailable",
          );
          return route.fulfill({
            status: blocked.status,
            contentType: "application/json",
            body: JSON.stringify(blocked.body),
          });
        }
        versions = versions.map((entry) =>
          entry.id === versionId
            ? {
                ...entry,
                status: "APPROVED",
                approvedBy: { id: me.id, code: me.code, name: me.name },
                approvedAt: "2026-07-31T05:00:00.000Z",
              }
            : entry,
        );
        currentApprovedId = versionId;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success(versions.find((entry) => entry.id === versionId)!),
          ),
        });
      }
      if (path.endsWith("/archive") && method === "POST") {
        lifecycleStatus = "ARCHIVED";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(policyDto())),
        });
      }
      if (path.endsWith("/traceability") && method === "GET") {
        const policy = policyDto();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              policy,
              focusVersion:
                policy.currentApprovedVersion ?? policy.latestVersion,
              controlMappings: [
                {
                  id: "ac000000-0000-4000-8000-000000000001",
                  isActive: true,
                  control: {
                    id: "c0000000-0000-4000-8000-000000000001",
                    code: "CTL-001",
                    title: "Access control",
                    lifecycleStatus: "ACTIVE",
                  },
                },
              ],
            }),
          ),
        });
      }
      if (path.includes("/audit-events") && method === "GET") {
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
                  entityId: "a0000000-0000-4000-8000-000000000001",
                  metadata: { code: "POL-001", fromStatus: "ACTIVE", toStatus: "ACTIVE" },
                  createdAt: "2026-07-28T00:00:00.000Z",
                  userId: submitter.id,
                },
              ],
              { page: 1, pageSize: 20, total: 1, totalPages: 1 },
            ),
          ),
        });
      }
      if (path.includes("/policy-versions/") && path.endsWith("/frameworks")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(versions[0])),
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

    await page.goto(policyUrl);
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "SUBMITTED",
    );

    actor = "approver";
    await page.reload();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Reject" })
      .click();
    await page.getByLabel("Rejection comments (required)").fill("Needs clearer scope");
    await page.getByTestId("policy-decision-reject-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "REJECTED",
    );

    actor = "submitter";
    await page.reload();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Resubmit" })
      .click();
    await page.getByTestId("policy-decision-submit-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "SUBMITTED",
    );

    actor = "approver";
    await page.reload();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Approve" })
      .click();
    await page.getByTestId("policy-decision-approve-confirm").click();
    await expect(page.getByTestId("policy-version-row-1.0")).toContainText(
      "APPROVED",
    );
    await expect(page.getByTestId("policy-version-history")).toContainText(
      "Current approved Version",
    );
    await expect(page.getByTestId("policy-summary")).toContainText("1.0");

    await expect(page.getByTestId("policy-traceability")).toContainText(
      "CTL-001",
    );
    await expect(page.getByTestId("policy-audit-history")).toContainText(
      "POLICY CREATED",
    );

    await page.getByTestId("policy-archive-open").click();
    await page.getByTestId("policy-decision-archive-confirm").click();
    await expect(page.getByTestId("policy-archived-banner")).toBeVisible();
    await expect(page.getByTestId("policy-edit-open")).toHaveCount(0);
  });

  test("maps Evidence gate on approve", async ({ page }) => {
    await installPolicyWorkflowMock(page, { actor: "approver" });
    // Force a submitted evidence-required version via a dedicated route override.
    await page.unroute("**/api/v1/**");
    const version = {
      id: "a1000000-0000-4000-8000-000000000001",
      policyId: "a0000000-0000-4000-8000-000000000001",
      sequence: 1,
      version: "1.0",
      versionMajor: 1,
      versionMinor: 0,
      content: "Evidence body",
      purpose: null,
      scope: null,
      changeSummary: null,
      status: "SUBMITTED",
      effectiveDate: "2026-08-01",
      reviewDate: "2027-08-01",
      requiresEvidence: true,
      requestedApprover: {
        id: approver.id,
        code: approver.code,
        name: approver.name,
      },
      submittedBy: {
        id: submitter.id,
        code: submitter.code,
        name: submitter.name,
      },
      submittedAt: "2026-07-31T04:00:00.000Z",
      approvedBy: null,
      approvedAt: null,
      supersededById: null,
      frameworks: [],
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-31T04:00:00.000Z",
    };
    await page.route("**/api/v1/**", async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              accessToken: "mock-access-token",
              user: {
                id: approver.id,
                code: approver.code,
                name: approver.name,
                email: approver.email,
                phone: null,
                status: "ACTIVE",
                lastLogin: null,
                permissions: ["*"],
                activeCompany: company,
                companies: [company],
              },
            }),
          ),
        });
      }
      if (path.includes("/policies/") && path.endsWith(version.policyId)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              id: version.policyId,
              code: "POL-001",
              title: "Evidence Policy",
              description: null,
              lifecycleStatus: "ACTIVE",
              owner: null,
              department: null,
              currentApprovedVersion: null,
              latestVersion: version,
              archivedAt: null,
              createdAt: version.createdAt,
              updatedAt: version.updatedAt,
            }),
          ),
        });
      }
      if (path.endsWith("/versions") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success([version])),
        });
      }
      if (path.endsWith("/approve") && method === "POST") {
        const blocked = failure(
          501,
          "EVIDENCE_GATE_NOT_IMPLEMENTED",
          "Evidence unavailable",
        );
        return route.fulfill({
          status: blocked.status,
          contentType: "application/json",
          body: JSON.stringify(blocked.body),
        });
      }
      if (path.endsWith("/traceability")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              policy: {
                id: version.policyId,
                code: "POL-001",
                title: "Evidence Policy",
                description: null,
                lifecycleStatus: "ACTIVE",
                owner: null,
                department: null,
                currentApprovedVersion: null,
                latestVersion: version,
                archivedAt: null,
                createdAt: version.createdAt,
                updatedAt: version.updatedAt,
              },
              focusVersion: version,
              controlMappings: [],
            }),
          ),
        });
      }
      if (path.includes("/audit-events")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success([], { page: 1, pageSize: 20, total: 0, totalPages: 1 }),
          ),
        });
      }
      if (path === "/api/v1/users" || path.includes("/organisation/") || path === "/api/v1/frameworks") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success([])),
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

    await page.goto(policyUrl);
    await expect(page.getByTestId("policy-detail-evidence-warning")).toBeVisible();
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Approve" })
      .click();
    await expect(page.getByTestId("policy-evidence-gate-warning")).toBeVisible();
    await page.getByTestId("policy-decision-approve-confirm").click();
    await expect(page.getByTestId("policy-decision-error")).toContainText(
      "Evidence Management is not available yet",
    );
  });

  test("surfaces immutable Version conflict", async ({ page }) => {
    await installPolicyWorkflowMock(page, {
      actor: "submitter",
      forceImmutable: true,
    });
    await page.goto(policyUrl);
    await page
      .getByTestId("policy-version-row-1.0")
      .getByRole("button", { name: "Edit" })
      .click();
    await page.getByLabel("Content (required, plain text)").fill(
      "Attempted edit after race",
    );
    await page.getByTestId("policy-version-form-save").click();
    await expect(page.getByTestId("policy-version-form-error")).toContainText(
      "can no longer be edited",
    );
  });

  test("shows Framework mapping field errors and preserves selection", async ({
    page,
  }) => {
    await installPolicyWorkflowMock(page, {
      actor: "submitter",
      failFrameworkMappingOnce: true,
    });
    await page.goto(policyUrl);

    const editor = page.getByTestId("policy-framework-editor");
    await expect(editor).toBeVisible();
    const iso27001 = editor.getByText("ISO 27001");
    await iso27001.click();
    await expect(editor.locator('input[type="checkbox"]').nth(1)).toBeChecked();

    await page.getByTestId("policy-framework-save").click();
    await expect(page.getByTestId("policy-framework-field-error")).toContainText(
      "One or more Frameworks are invalid for mapping",
    );
    await expect(page.getByTestId("policy-framework-mapping")).toBeVisible();
    await expect(editor.locator('input[type="checkbox"]').nth(1)).toBeChecked();
    await expect(page.getByTestId("policy-framework-editor")).toBeVisible();

    // Changing selection clears the field error; retry then succeeds.
    await iso27001.click();
    await expect(page.getByTestId("policy-framework-field-error")).toHaveCount(0);
    await iso27001.click();
    await page.getByTestId("policy-framework-save").click();
    await expect(page.getByTestId("policy-framework-field-error")).toHaveCount(0);
    await expect(page.getByTestId("policy-active-frameworks")).toContainText(
      "ISO 27001",
    );
  });
});
