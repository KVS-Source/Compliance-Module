/**
 * Control detail and workflow Playwright suite (mocked `/api/v1/**` only).
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
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

const framework = {
  id: "60000000-0000-4000-8000-000000000001",
  code: "FRM-001",
  name: "ISO 9001",
  version: "2025",
  description: "Quality management system",
  status: "ACTIVE",
};

const frameworkTwo = {
  id: "60000000-0000-4000-8000-000000000002",
  code: "FRM-002",
  name: "ISO 27001",
  version: "2022",
  description: "Information security",
  status: "ACTIVE",
};

const ruleOne = {
  id: "70000000-0000-4000-8000-000000000001",
  frameworkId: framework.id,
  code: "RUL-001",
  title: "Documented information control",
  description: "Control documented information.",
  status: "ACTIVE",
};

const ruleTwo = {
  id: "70000000-0000-4000-8000-000000000002",
  frameworkId: frameworkTwo.id,
  code: "RUL-002",
  title: "Access review evidence",
  description: "Review access evidence periodically.",
  status: "ACTIVE",
};

const rulesById: Record<
  string,
  {
    id: string;
    frameworkId: string;
    code: string;
    title: string;
    description: string;
    status: string;
  }
> = {
  [ruleOne.id]: ruleOne,
  [ruleTwo.id]: ruleTwo,
};

const approvedVersion = {
  id: "a1000000-0000-4000-8000-000000000001",
  policyId: "a0000000-0000-4000-8000-000000000001",
  sequence: 1,
  version: "1.0",
  versionMajor: 1,
  versionMinor: 0,
  status: "APPROVED",
  effectiveDate: "2026-01-01",
  reviewDate: "2026-12-01",
  requiresEvidence: false,
  requestedApprover: null,
  submittedBy: null,
  submittedAt: null,
  approvedBy: { id: userOne.id, code: userOne.code, name: userOne.name },
  approvedAt: "2026-01-02T00:00:00.000Z",
  supersededById: null,
  frameworks: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const policy = {
  id: "a0000000-0000-4000-8000-000000000001",
  code: "POL-001",
  title: "Information Security Policy",
  description: "Baseline security policy",
  lifecycleStatus: "ACTIVE",
  owner: { id: userOne.id, code: userOne.code, name: userOne.name },
  department: {
    id: department.id,
    code: department.code,
    name: department.name,
  },
  currentApprovedVersion: approvedVersion,
  latestVersion: approvedVersion,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

let control = {
  id: "c0000000-0000-4000-8000-000000000001",
  code: "CTL-001",
  title: "Access Control Review",
  description: "Control description",
  objective: "Protect access pathways",
  owner: { id: userOne.id, code: userOne.code, name: userOne.name },
  department: {
    id: department.id,
    code: department.code,
    name: department.name,
  },
  implementationStatus: "IN_PROGRESS",
  implementationNotes: null as string | null,
  controlType: "PREVENTIVE",
  frequency: "MONTHLY",
  verificationMethod: "Sample verification",
  requiresEvidence: false,
  lifecycleStatus: "ACTIVE",
  lastReviewDate: null as string | null,
  nextReviewDate: "2026-08-15" as string | null,
  activePolicyVersionMappingCount: 0,
  activeFrameworkMappingCount: 1,
  activeFrameworkRuleMappingCount: 1,
  activeCheckpointCount: 1,
  inactiveCheckpointCount: 0,
  archivedCheckpointCount: 0,
  archivedAt: null as string | null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

let policyMappings = [] as Array<{
  id: string;
  isActive: boolean;
  policyId: string;
  policyVersionId: string;
  policy: { id: string; code: string; title: string };
  policyVersion: {
    id: string;
    version: string;
    versionMajor: number;
    versionMinor: number;
    status: string;
  };
}>;

let frameworkMappings = [
  {
    id: "cf000000-0000-4000-8000-000000000001",
    isActive: true,
    frameworkId: framework.id,
    framework: {
      id: framework.id,
      code: framework.code,
      name: framework.name,
      version: framework.version,
    },
  },
];

let ruleMappings = [
  {
    id: "cr000000-0000-4000-8000-000000000001",
    isActive: true,
    frameworkId: framework.id,
    frameworkRuleId: ruleOne.id,
    frameworkRule: {
      id: ruleOne.id,
      frameworkId: ruleOne.frameworkId,
      code: ruleOne.code,
      title: ruleOne.title,
    },
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

async function installControlWorkflowMock(
  page: Page,
  options: { orphanRulesOnFrameworkRemoval?: boolean } = {},
) {
  const putBodies: Array<{ path: string; body: unknown }> = [];
  let failNextFrameworkRulesPut:
    | { status: number; code: string; message: string }
    | null = null;

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const identity = {
      id: userOne.id,
      code: userOne.code,
      name: userOne.name,
      email: userOne.email,
      phone: null,
      status: "ACTIVE",
      lastLogin: null,
      permissions: ["*"],
      activeCompany: company,
      companies: [company],
    };

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity }),
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

    if (path === "/api/v1/frameworks" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([framework, frameworkTwo])),
      });
    }

    if (path === `/api/v1/frameworks/${framework.id}/rules`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([ruleOne])),
      });
    }

    if (path === `/api/v1/frameworks/${frameworkTwo.id}/rules`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([ruleTwo])),
      });
    }

    if (path.startsWith("/api/v1/frameworks/") && path.endsWith("/rules")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([])),
      });
    }

    if (path === "/api/v1/policies" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([policy], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/controls" && method === "GET") {
      const listRow = {
        id: control.id,
        code: control.code,
        title: control.title,
        owner: control.owner,
        department: control.department,
        implementationStatus: control.implementationStatus,
        controlType: control.controlType,
        frequency: control.frequency,
        requiresEvidence: control.requiresEvidence,
        lifecycleStatus: control.lifecycleStatus,
        lastReviewDate: control.lastReviewDate,
        nextReviewDate: control.nextReviewDate,
        activePolicyVersionMappingCount: control.activePolicyVersionMappingCount,
        activeFrameworkMappingCount: control.activeFrameworkMappingCount,
        activeFrameworkRuleMappingCount:
          control.activeFrameworkRuleMappingCount,
        activeCheckpointCount: control.activeCheckpointCount,
        archivedAt: control.archivedAt,
        createdAt: control.createdAt,
        updatedAt: control.updatedAt,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([listRow], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === `/api/v1/controls/${control.id}` && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (path === `/api/v1/controls/${control.id}` && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (body.implementationStatus === "NOT_APPLICABLE") {
        const notes =
          typeof body.implementationNotes === "string"
            ? body.implementationNotes
            : "";
        if (notes.trim().length < 2) {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "NOT_APPLICABLE Controls require implementation notes",
              },
            }),
          });
        }
      }
      control = {
        ...control,
        ...body,
        title: typeof body.title === "string" ? body.title : control.title,
        objective:
          typeof body.objective === "string" ? body.objective : control.objective,
        implementationStatus:
          (body.implementationStatus as string) ??
          control.implementationStatus,
        implementationNotes:
          body.implementationNotes === undefined
            ? control.implementationNotes
            : (body.implementationNotes as string | null),
        updatedAt: "2026-07-29T00:00:00.000Z",
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (path === `/api/v1/controls/${control.id}/activate` && method === "POST") {
      control = { ...control, lifecycleStatus: "ACTIVE", archivedAt: null };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (
      path === `/api/v1/controls/${control.id}/deactivate` &&
      method === "POST"
    ) {
      control = { ...control, lifecycleStatus: "INACTIVE", archivedAt: null };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (path === `/api/v1/controls/${control.id}/archive` && method === "POST") {
      if (control.activeCheckpointCount > 0) {
        const blocked = failure(
          409,
          "CONTROL_HAS_ACTIVE_CHECKPOINTS",
          "Control cannot be archived while active Checkpoints exist",
        );
        return route.fulfill({
          status: blocked.status,
          contentType: "application/json",
          body: JSON.stringify(blocked.body),
        });
      }
      control = {
        ...control,
        lifecycleStatus: "ARCHIVED",
        archivedAt: "2026-07-30T00:00:00.000Z",
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (
      path === `/api/v1/controls/${control.id}/policy-versions` &&
      method === "PUT"
    ) {
      const body = request.postDataJSON() as { policyVersionIds: string[] };
      putBodies.push({ path, body });
      policyMappings = body.policyVersionIds.map((id, index) => ({
        id: `cpv-${index}`,
        isActive: true,
        policyId: policy.id,
        policyVersionId: id,
        policy: {
          id: policy.id,
          code: policy.code,
          title: policy.title,
        },
        policyVersion: {
          id: approvedVersion.id,
          version: approvedVersion.version,
          versionMajor: approvedVersion.versionMajor,
          versionMinor: approvedVersion.versionMinor,
          status: approvedVersion.status,
        },
      }));
      control = {
        ...control,
        activePolicyVersionMappingCount: policyMappings.length,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (
      path === `/api/v1/controls/${control.id}/frameworks` &&
      method === "PUT"
    ) {
      const body = request.postDataJSON() as { frameworkIds: string[] };
      putBodies.push({ path, body });
      const removing = frameworkMappings
        .filter((mapping) => mapping.isActive)
        .map((mapping) => mapping.frameworkId)
        .filter((id) => !body.frameworkIds.includes(id));
      const dependent = removing.some((frameworkId) =>
        ruleMappings.some(
          (mapping) => mapping.isActive && mapping.frameworkId === frameworkId,
        ),
      );
      if (dependent && !options.orphanRulesOnFrameworkRemoval) {
        const blocked = failure(
          409,
          "CONTROL_INVALID_STATE",
          "Framework mapping cannot be removed while active Framework Rule mappings depend on it",
        );
        return route.fulfill({
          status: blocked.status,
          contentType: "application/json",
          body: JSON.stringify(blocked.body),
        });
      }
      frameworkMappings = body.frameworkIds.map((frameworkId, index) => {
        const master =
          frameworkId === frameworkTwo.id ? frameworkTwo : framework;
        return {
          id: `cfm-${index}`,
          isActive: true,
          frameworkId,
          framework: {
            id: master.id,
            code: master.code,
            name: master.name,
            version: master.version,
          },
        };
      });
      control = {
        ...control,
        activeFrameworkMappingCount: frameworkMappings.length,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (
      path === `/api/v1/controls/${control.id}/framework-rules` &&
      method === "PUT"
    ) {
      const body = request.postDataJSON() as { frameworkRuleIds: string[] };
      putBodies.push({ path, body });
      if (failNextFrameworkRulesPut) {
        const err = failNextFrameworkRulesPut;
        failNextFrameworkRulesPut = null;
        return route.fulfill({
          status: err.status,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: err.code, message: err.message },
          }),
        });
      }
      for (const ruleId of body.frameworkRuleIds) {
        const rule = rulesById[ruleId];
        if (!rule) {
          const invalid = failure(
            400,
            "CONTROL_MAPPING_INVALID",
            "Unknown Framework Rule",
          );
          return route.fulfill({
            status: invalid.status,
            contentType: "application/json",
            body: JSON.stringify(invalid.body),
          });
        }
        const hasFramework = frameworkMappings.some(
          (mapping) =>
            mapping.isActive && mapping.frameworkId === rule.frameworkId,
        );
        if (!hasFramework) {
          const invalid = failure(
            400,
            "CONTROL_MAPPING_INVALID",
            "Framework Rule requires an active Control Framework mapping",
          );
          return route.fulfill({
            status: invalid.status,
            contentType: "application/json",
            body: JSON.stringify(invalid.body),
          });
        }
      }
      ruleMappings = body.frameworkRuleIds.map((ruleId, index) => {
        const rule = rulesById[ruleId]!;
        return {
          id: `crm-${index}`,
          isActive: true,
          frameworkId: rule.frameworkId,
          frameworkRuleId: rule.id,
          frameworkRule: {
            id: rule.id,
            frameworkId: rule.frameworkId,
            code: rule.code,
            title: rule.title,
          },
        };
      });
      control = {
        ...control,
        activeFrameworkRuleMappingCount: ruleMappings.length,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(control)),
      });
    }

    if (path === `/api/v1/controls/${control.id}/traceability`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            control,
            policyVersionMappings: policyMappings,
            frameworkMappings,
            frameworkRuleMappings: ruleMappings,
            checkpointCounts: {
              active: control.activeCheckpointCount,
              inactive: control.inactiveCheckpointCount,
              archived: control.archivedCheckpointCount,
            },
          }),
        ),
      });
    }

    if (path === `/api/v1/controls/${control.id}/audit-events`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success(
            [
              {
                id: "ae000000-0000-4000-8000-000000000001",
                action: "CONTROL_CREATED",
                entityType: "CONTROL",
                entityId: control.id,
                metadata: { code: control.code },
                createdAt: control.createdAt,
                userId: userOne.id,
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
    putBodies,
    failNextFrameworkRulesPut: (error: {
      status: number;
      code: string;
      message: string;
    }) => {
      failNextFrameworkRulesPut = error;
    },
  };
}

function seedDualFrameworkRuleMappings() {
  frameworkMappings = [
    {
      id: "cf000000-0000-4000-8000-000000000001",
      isActive: true,
      frameworkId: framework.id,
      framework: {
        id: framework.id,
        code: framework.code,
        name: framework.name,
        version: framework.version,
      },
    },
    {
      id: "cf000000-0000-4000-8000-000000000002",
      isActive: true,
      frameworkId: frameworkTwo.id,
      framework: {
        id: frameworkTwo.id,
        code: frameworkTwo.code,
        name: frameworkTwo.name,
        version: frameworkTwo.version,
      },
    },
  ];
  ruleMappings = [
    {
      id: "cr000000-0000-4000-8000-000000000001",
      isActive: true,
      frameworkId: framework.id,
      frameworkRuleId: ruleOne.id,
      frameworkRule: {
        id: ruleOne.id,
        frameworkId: ruleOne.frameworkId,
        code: ruleOne.code,
        title: ruleOne.title,
      },
    },
    {
      id: "cr000000-0000-4000-8000-000000000002",
      isActive: true,
      frameworkId: frameworkTwo.id,
      frameworkRuleId: ruleTwo.id,
      frameworkRule: {
        id: ruleTwo.id,
        frameworkId: ruleTwo.frameworkId,
        code: ruleTwo.code,
        title: ruleTwo.title,
      },
    },
  ];
  control = {
    ...control,
    activeFrameworkMappingCount: 2,
    activeFrameworkRuleMappingCount: 2,
  };
}

async function removeFrameworkTwoLeavingOrphanRule(page: Page) {
  const editor = page.getByTestId("control-framework-editor");
  await editor.getByText("FRM-002 · ISO 27001").click();
  await page.getByTestId("control-framework-confirm-invalidation").click();
  await expect(page.getByTestId("control-framework-force-remove")).toHaveText(
    "Remove selected Frameworks",
  );
  await page.getByTestId("control-framework-force-remove").click();
  await page.getByTestId("control-framework-save").click();
  await expect(
    page.getByTestId("control-framework-rule-invalidated"),
  ).toBeVisible();
  await expect(
    page.getByTestId("control-framework-rule-invalidated"),
  ).toContainText("RUL-002");
}

test.describe("Control workflow UI (mocked browser APIs)", () => {
  test.beforeEach(() => {
    control = {
      ...control,
      title: "Access Control Review",
      lifecycleStatus: "ACTIVE",
      activeCheckpointCount: 1,
      archivedAt: null,
      implementationStatus: "IN_PROGRESS",
      implementationNotes: null,
      activePolicyVersionMappingCount: 0,
      activeFrameworkMappingCount: 1,
      activeFrameworkRuleMappingCount: 1,
    };
    policyMappings = [];
    frameworkMappings = [
      {
        id: "cf000000-0000-4000-8000-000000000001",
        isActive: true,
        frameworkId: framework.id,
        framework: {
          id: framework.id,
          code: framework.code,
          name: framework.name,
          version: framework.version,
        },
      },
    ];
    ruleMappings = [
      {
        id: "cr000000-0000-4000-8000-000000000001",
        isActive: true,
        frameworkId: framework.id,
        frameworkRuleId: ruleOne.id,
        frameworkRule: {
          id: ruleOne.id,
          frameworkId: ruleOne.frameworkId,
          code: ruleOne.code,
          title: ruleOne.title,
        },
      },
    ];
  });

  test("edits scalars and surfaces NOT_APPLICABLE notes validation", async ({
    page,
  }) => {
    await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await page.getByTestId("control-edit-open").click();
    await page.locator("#control-title").fill("Updated Access Control");
    await page
      .locator("#control-implementation")
      .selectOption("NOT_APPLICABLE");
    await page.locator("#control-notes").fill("");
    await page.getByTestId("control-form-save").click();
    await expect(page.getByTestId("control-form-error")).toHaveCount(0);
    await expect(
      page.getByText("NOT_APPLICABLE Controls require implementation notes."),
    ).toBeVisible();

    await page.locator("#control-notes").fill("Not applicable for this site.");
    await page.getByTestId("control-form-save").click();
    await expect(
      page.getByRole("heading", { name: "Updated Access Control" }),
    ).toBeVisible();
  });

  test("deactivates and activates a Control", async ({ page }) => {
    await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await page.getByTestId("control-deactivate-open").click();
    await page.getByTestId("control-lifecycle-deactivate-confirm").click();
    await expect(page.getByTestId("control-activate-open")).toBeVisible();
    await page.getByTestId("control-activate-open").click();
    await page.getByTestId("control-lifecycle-activate-confirm").click();
    await expect(page.getByTestId("control-deactivate-open")).toBeVisible();
  });

  test("blocks archive when active Checkpoints exist", async ({ page }) => {
    await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await page.getByTestId("control-archive-open").click();
    await page.getByTestId("control-lifecycle-archive-confirm").click();
    await expect(page.getByTestId("control-lifecycle-error")).toContainText(
      "This Control still has active Checkpoints",
    );
  });

  test("archives after Checkpoint count is cleared", async ({ page }) => {
    await installControlWorkflowMock(page);
    control = { ...control, activeCheckpointCount: 0 };
    await page.goto(`/compliance/controls/${control.id}`);
    await page.getByTestId("control-archive-open").click();
    await page.getByTestId("control-lifecycle-archive-confirm").click();
    await expect(page.getByTestId("control-archived-banner")).toBeVisible();
  });

  test("updates Policy Version mappings from approved Policy options", async ({
    page,
  }) => {
    const { putBodies } = await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await expect(page.getByTestId("control-policy-version-mapping")).toBeVisible();
    await page
      .getByTestId("control-policy-version-editor")
      .getByText("POL-001")
      .click();
    await page.getByTestId("control-policy-version-save").click();
    await expect
      .poll(() =>
        putBodies.some((entry) => entry.path.endsWith("/policy-versions")),
      )
      .toBeTruthy();
    await expect(page.getByTestId("control-active-policy-versions")).toContainText(
      "POL-001",
    );
  });

  test("blocks Framework removal while Rules depend on it", async ({
    page,
  }) => {
    await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    const editor = page.getByTestId("control-framework-editor");
    await expect(editor).toBeVisible();
    await editor.getByText("FRM-001 · ISO 9001").click();
    await expect(page.getByTestId("control-framework-mapping")).toContainText(
      "This Framework cannot be removed while active Framework Rule mappings still depend on it.",
    );
  });

  test("shows Framework Rule field error when Framework is missing", async ({
    page,
  }) => {
    await installControlWorkflowMock(page);
    ruleMappings = [];
    frameworkMappings = [];
    control = {
      ...control,
      activeFrameworkMappingCount: 0,
      activeFrameworkRuleMappingCount: 0,
    };
    await page.goto(`/compliance/controls/${control.id}`);
    await expect(
      page.getByText("Map at least one Framework before selecting Framework Rules."),
    ).toBeVisible();
  });

  test("renders checkpoint counts, traceability and audit panels", async ({
    page,
  }) => {
    await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await expect(page.getByTestId("control-checkpoint-active")).toHaveText("1");
    await expect(page.getByTestId("control-traceability")).toBeVisible();
    await expect(page.getByTestId("control-audit-history")).toContainText(
      "CONTROL CREATED",
    );
    await expect(
      page.getByRole("link", { name: "POL-001" }),
    ).toHaveCount(0);
  });

  test("links mapped Policies from Control traceability", async ({ page }) => {
    await installControlWorkflowMock(page);
    policyMappings = [
      {
        id: "cpv-0",
        isActive: true,
        policyId: policy.id,
        policyVersionId: approvedVersion.id,
        policy: {
          id: policy.id,
          code: policy.code,
          title: policy.title,
        },
        policyVersion: {
          id: approvedVersion.id,
          version: approvedVersion.version,
          versionMajor: approvedVersion.versionMajor,
          versionMinor: approvedVersion.versionMinor,
          status: approvedVersion.status,
        },
      },
    ];
    await page.goto(`/compliance/controls/${control.id}`);
    await page
      .getByTestId("control-traceability-policies")
      .getByRole("link", { name: "POL-001" })
      .click();
    await expect(page).toHaveURL(`/compliance/policies/${policy.id}`);
  });

  test("confirms drop of invalidated Rules and PUTs valid-only body", async ({
    page,
  }) => {
    seedDualFrameworkRuleMappings();
    const { putBodies } = await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await removeFrameworkTwoLeavingOrphanRule(page);

    const ruleSave = page.getByTestId("control-framework-rule-save");
    await expect(ruleSave).toBeDisabled();
    const beforeConfirm = putBodies.filter((entry) =>
      entry.path.endsWith("/framework-rules"),
    ).length;
    await ruleSave.click({ force: true });
    await expect
      .poll(
        () =>
          putBodies.filter((entry) => entry.path.endsWith("/framework-rules"))
            .length,
      )
      .toBe(beforeConfirm);

    await page.getByTestId("control-framework-rule-confirm-invalidated").click();
    await expect(ruleSave).toBeEnabled();
    await ruleSave.click();

    await expect
      .poll(() =>
        putBodies.filter((entry) => entry.path.endsWith("/framework-rules")),
      )
      .toHaveLength(1);
    const rulePuts = putBodies.filter((entry) =>
      entry.path.endsWith("/framework-rules"),
    );
    expect(rulePuts).toHaveLength(1);
    expect(rulePuts[0]?.path).toBe(
      `/api/v1/controls/${control.id}/framework-rules`,
    );
    expect(rulePuts[0]?.body).toEqual({ frameworkRuleIds: [ruleOne.id] });

    await expect(
      page.getByTestId("control-framework-rule-invalidated"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("control-active-framework-rules"),
    ).toContainText("RUL-001");
    await expect(
      page.getByTestId("control-active-framework-rules"),
    ).not.toContainText("RUL-002");
    await expect(
      page.getByTestId("control-traceability"),
    ).toContainText("RUL-001");
  });

  test("explicitly removes invalidated Rules before save", async ({ page }) => {
    seedDualFrameworkRuleMappings();
    const { putBodies } = await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await removeFrameworkTwoLeavingOrphanRule(page);

    await page.getByTestId("control-framework-rule-remove-invalidated").click();
    await expect(
      page.getByTestId("control-framework-rule-invalidated"),
    ).toHaveCount(0);
    await expect(page.getByTestId("control-framework-rule-save")).toBeEnabled();
    await page.getByTestId("control-framework-rule-save").click();

    await expect
      .poll(() =>
        putBodies.filter((entry) => entry.path.endsWith("/framework-rules")),
      )
      .toHaveLength(1);
    expect(
      putBodies.filter((entry) => entry.path.endsWith("/framework-rules"))[0]
        ?.body,
    ).toEqual({ frameworkRuleIds: [ruleOne.id] });
  });

  test("does not PUT when Framework Rule mappings are unchanged", async ({
    page,
  }) => {
    const { putBodies } = await installControlWorkflowMock(page);
    await page.goto(`/compliance/controls/${control.id}`);
    await expect(page.getByTestId("control-framework-rule-save")).toBeDisabled();
    await page.getByTestId("control-framework-rule-save").click({ force: true });
    await expect
      .poll(() =>
        putBodies.filter((entry) => entry.path.endsWith("/framework-rules"))
          .length,
      )
      .toBe(0);
  });

  test("preserves Rule selection after backend mapping error", async ({
    page,
  }) => {
    seedDualFrameworkRuleMappings();
    const mock = await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await removeFrameworkTwoLeavingOrphanRule(page);
    await page.getByTestId("control-framework-rule-confirm-invalidated").click();
    mock.failNextFrameworkRulesPut({
      status: 409,
      code: "CONTROL_MAPPING_INVALID",
      message: "Framework Rule mapping conflict",
    });
    await page.getByTestId("control-framework-rule-save").click();
    await expect(page.getByRole("alert")).toContainText(
      "Framework Rule mapping conflict",
    );
    await expect(
      page.getByTestId("control-framework-rule-invalidated"),
    ).toBeVisible();
    await expect(page.getByTestId("control-framework-rule-save")).toBeEnabled();
    await expect
      .poll(() =>
        mock.putBodies.filter((entry) => entry.path.endsWith("/framework-rules"))
          .length,
      )
      .toBe(1);
  });

  test("clears drop confirmation when Rule selection changes", async ({
    page,
  }) => {
    seedDualFrameworkRuleMappings();
    await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await removeFrameworkTwoLeavingOrphanRule(page);
    await page.getByTestId("control-framework-rule-confirm-invalidated").click();
    await expect(page.getByTestId("control-framework-rule-save")).toBeEnabled();

    await page
      .getByTestId("control-framework-rule-editor")
      .getByText("RUL-001 · Documented information control")
      .click();
    await expect(page.getByTestId("control-framework-rule-save")).toBeDisabled();
    await expect(
      page.getByTestId("control-framework-rule-save-hint"),
    ).toContainText("Remove invalidated Rules or confirm");
  });

  test("re-adding a Framework clears Rule invalidation", async ({ page }) => {
    seedDualFrameworkRuleMappings();
    await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await removeFrameworkTwoLeavingOrphanRule(page);

    await page
      .getByTestId("control-framework-editor")
      .getByText("FRM-002 · ISO 27001")
      .click();
    await page.getByTestId("control-framework-save").click();
    await expect(
      page.getByTestId("control-framework-rule-invalidated"),
    ).toHaveCount(0);
    await expect(page.getByTestId("control-framework-rule-save")).toBeDisabled();
  });

  test("Framework force-remove button label matches action", async ({
    page,
  }) => {
    seedDualFrameworkRuleMappings();
    await installControlWorkflowMock(page, {
      orphanRulesOnFrameworkRemoval: true,
    });
    await page.goto(`/compliance/controls/${control.id}`);
    await page
      .getByTestId("control-framework-editor")
      .getByText("FRM-002 · ISO 27001")
      .click();
    await page.getByTestId("control-framework-confirm-invalidation").click();
    await expect(page.getByTestId("control-framework-force-remove")).toHaveText(
      "Remove selected Frameworks",
    );
  });
});
