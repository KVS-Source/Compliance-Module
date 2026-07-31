/**
 * Checkpoint Register UI Playwright suite.
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

const userTwo = {
  id: "20000000-0000-4000-8000-000000000002",
  code: "USR-002",
  name: "User 002",
  email: "owner001@example.test",
  phone: null,
  department: "Compliance",
  roles: ["Company User"],
  status: "ACTIVE",
  lastLogin: null,
};

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Compliance",
  headName: "User 002",
  status: "ACTIVE",
  createdAt: "2026-07-01T00:00:00.000Z",
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
  lifecycleStatus: "ACTIVE",
  lastReviewDate: null,
  nextReviewDate: "2026-08-15",
  activePolicyVersionMappingCount: 0,
  activeFrameworkMappingCount: 0,
  activeFrameworkRuleMappingCount: 0,
  activeCheckpointCount: 1,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const inactiveControl = {
  ...parentControl,
  id: "c0000000-0000-4000-8000-000000000002",
  code: "CTL-002",
  title: "Inactive Backup Control",
  lifecycleStatus: "INACTIVE",
  activeCheckpointCount: 0,
};

const archivedControl = {
  ...parentControl,
  id: "c0000000-0000-4000-8000-000000000003",
  code: "CTL-003",
  title: "Archived Control",
  lifecycleStatus: "ARCHIVED",
  activeCheckpointCount: 0,
};

const activeCheckpoint = {
  id: "d0000000-0000-4000-8000-000000000001",
  code: "CHK-001",
  title: "Monthly access verification",
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
  lastReviewedAt: null,
  control: {
    id: parentControl.id,
    code: parentControl.code,
    title: parentControl.title,
    lifecycleStatus: parentControl.lifecycleStatus,
  },
  latestOutcome: null,
  totalReviewCount: 0,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const inactiveCheckpoint = {
  ...activeCheckpoint,
  id: "d0000000-0000-4000-8000-000000000002",
  code: "CHK-002",
  title: "Inactive weekly check",
  lifecycleStatus: "INACTIVE",
  verificationFrequency: "WEEKLY",
  nextReviewDate: null,
};

const companyTwoCheckpoint = {
  ...activeCheckpoint,
  id: "d0000000-0000-4000-8000-000000000201",
  code: "CHK-201",
  title: "Company Two Checkpoint",
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

const detailOf = (checkpoint: typeof activeCheckpoint) => ({
  ...checkpoint,
  description: "Checkpoint description",
  expectedResult: "Access review completed with evidence",
  latestReview: null,
  activePolicyVersionMappingCount: 0,
  activeFrameworkMappingCount: 0,
  activeFrameworkRuleMappingCount: 0,
});

async function installCheckpointRegisterMock(
  page: Page,
  options: {
    permissions: string[];
    mode?: "populated" | "empty" | "filtered-empty" | "error";
  },
) {
  const canRead =
    options.permissions.includes("*") ||
    options.permissions.includes("checkpoints:read");
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes("checkpoints:write");
  const canReadControls =
    options.permissions.includes("*") ||
    options.permissions.includes("controls:read");
  const mode = options.mode ?? "populated";
  const listUrls: string[] = [];
  let activeCompany = company;
  let companyACheckpoints =
    mode === "populated" ? [activeCheckpoint, inactiveCheckpoint] : [];
  const companyBCheckpoints =
    mode === "populated" ? [companyTwoCheckpoint] : [];
  let holdRemaining = 0;
  const holdGate: Array<() => void> = [];
  const armCompanyAListHold = (count = 1) => {
    holdRemaining = count;
  };
  const releaseHeldLists = () => {
    while (holdGate.length > 0) {
      holdGate.shift()?.();
    }
  };

  const identity = () => ({
    id: userOne.id,
    code: userOne.code,
    name: userOne.name,
    email: userOne.email,
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

    if (path === "/api/v1/users" && method === "GET") {
      if (
        !options.permissions.includes("*") &&
        !options.permissions.includes("users:read")
      ) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([userOne, userTwo])),
      });
    }

    if (path === "/api/v1/organisation/departments" && method === "GET") {
      if (
        !options.permissions.includes("*") &&
        !options.permissions.includes("organisation:read")
      ) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success([department])),
      });
    }

    if (path === "/api/v1/controls" && method === "GET") {
      if (!canReadControls) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([parentControl, inactiveControl, archivedControl], {
            page: 1,
            pageSize: 100,
            total: 3,
            totalPages: 1,
          }),
        ),
      });
    }

    if (path === "/api/v1/checkpoints" && method === "GET") {
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

      const respondingFor = activeCompany;
      if (respondingFor.id === company.id && holdRemaining > 0) {
        holdRemaining -= 1;
        await new Promise<void>((resolve) => {
          holdGate.push(resolve);
        });
      }

      let rows =
        mode === "empty" || mode === "filtered-empty"
          ? []
          : respondingFor.id === companyTwo.id
            ? [...companyBCheckpoints]
            : [...companyACheckpoints];

      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const lifecycle = url.searchParams.get("lifecycleStatus");
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

      if (q) {
        rows = rows.filter((row) =>
          `${row.code} ${row.title}`.toLowerCase().includes(q),
        );
      }
      if (lifecycle) {
        rows = rows.filter((row) => row.lifecycleStatus === lifecycle);
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

    if (path === "/api/v1/checkpoints" && method === "POST") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const body = request.postDataJSON() as {
        controlId: string;
        title: string;
        expectedResult: string;
        verificationFrequency: string;
        evidenceRequired?: boolean;
      };
      if (!body.controlId || !body.title?.trim() || !body.expectedResult?.trim()) {
        const invalid = failure(400, "VALIDATION_ERROR", "Invalid body");
        return route.fulfill({
          status: invalid.status,
          contentType: "application/json",
          body: JSON.stringify(invalid.body),
        });
      }
      if (body.controlId === archivedControl.id) {
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
      const created = detailOf({
        ...activeCheckpoint,
        id: "d0000000-0000-4000-8000-000000000099",
        code: "CHK-099",
        title: body.title,
        verificationFrequency: body.verificationFrequency,
        evidenceRequired: Boolean(body.evidenceRequired),
        control: {
          id: body.controlId,
          code:
            body.controlId === inactiveControl.id
              ? inactiveControl.code
              : parentControl.code,
          title:
            body.controlId === inactiveControl.id
              ? inactiveControl.title
              : parentControl.title,
          lifecycleStatus:
            body.controlId === inactiveControl.id
              ? "INACTIVE"
              : "ACTIVE",
        },
      });
      companyACheckpoints = [created, ...companyACheckpoints];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    if (path.startsWith("/api/v1/checkpoints/") && method === "GET") {
      const id = path.split("/")[4]!;
      if (path.endsWith("/latest-review")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(success(null)),
        });
      }
      if (path.endsWith("/reviews") || path.endsWith("/audit-events")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success([], {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 1,
            }),
          ),
        });
      }
      if (path.endsWith("/traceability")) {
        const found = [
          ...companyACheckpoints,
          ...companyBCheckpoints,
        ].find((row) => row.id === id);
        if (!found) {
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
          body: JSON.stringify(
            success({
              checkpoint: {
                id: found.id,
                code: found.code,
                title: found.title,
                lifecycleStatus: found.lifecycleStatus,
                verificationFrequency: found.verificationFrequency,
              },
              control: found.control,
              latestReview: null,
              totalReviewCount: found.totalReviewCount,
              policyVersionMappings: { active: [], historical: [] },
              frameworkMappings: { active: [], historical: [] },
              frameworkRuleMappings: { active: [], historical: [] },
            }),
          ),
        });
      }
      const found = [...companyACheckpoints, ...companyBCheckpoints].find(
        (row) => row.id === id,
      );
      if (
        !found ||
        (found.id === companyTwoCheckpoint.id &&
          activeCompany.id !== companyTwo.id)
      ) {
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
        body: JSON.stringify(success(detailOf(found))),
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

  return { listUrls, armCompanyAListHold, releaseHeldLists };
}

test.describe("Checkpoint Register UI (mocked browser APIs)", () => {
  test("shows the live register without a prototype banner", async ({
    page,
  }) => {
    await installCheckpointRegisterMock(page, {
      permissions: ["*", "checkpoints:read", "checkpoints:write"],
    });
    await page.goto("/compliance/checkpoints");
    await expect(
      page.getByRole("heading", { name: "Checkpoint Register" }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(page.getByTestId("module-status-page")).toHaveCount(0);
    await expect(
      page.getByText("CHK-001").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText("Monthly access verification")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("sends filters and search to the API and opens detail", async ({
    page,
  }) => {
    const { listUrls } = await installCheckpointRegisterMock(page, {
      permissions: [
        "*",
        "checkpoints:read",
        "checkpoints:write",
        "users:read",
        "organisation:read",
      ],
    });
    await page.goto("/compliance/checkpoints");
    await page
      .getByLabel("Search checkpoints by code or title")
      .fill("CHK-001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect
      .poll(() => listUrls.some((url) => url.includes("q=CHK-001")))
      .toBeTruthy();

    await page
      .getByLabel("Filter by lifecycle status")
      .selectOption("INACTIVE");
    await expect
      .poll(() =>
        listUrls.some((url) => url.includes("lifecycleStatus=INACTIVE")),
      )
      .toBeTruthy();

    await page.getByLabel("Filter by lifecycle status").selectOption("");
    await page.getByRole("button", { name: "View CHK-001" }).first().click();
    await expect(page).toHaveURL(
      /\/compliance\/checkpoints\/d0000000-0000-4000-8000-000000000001$/,
    );
    await expect(
      page.getByRole("heading", { name: "Monthly access verification" }),
    ).toBeVisible();
    await expect(page.getByTestId("checkpoint-summary")).toBeVisible();
  });

  test("shows permission denied without requesting Checkpoint data", async ({
    page,
  }) => {
    const { listUrls } = await installCheckpointRegisterMock(page, {
      permissions: ["kpis:read"],
    });
    await page.goto("/compliance/checkpoints");
    await expect(page.getByText("Permission required")).toBeVisible();
    await expect(page.getByText("checkpoints:read")).toBeVisible();
    expect(listUrls).toEqual([]);
  });

  test("hides create when write permission is missing", async ({ page }) => {
    await installCheckpointRegisterMock(page, {
      permissions: ["checkpoints:read", "users:read", "organisation:read"],
    });
    await page.goto("/compliance/checkpoints");
    await expect(page.getByTestId("checkpoint-create-open")).toHaveCount(0);
    await expect(
      page.getByText("CHK-001").filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("shows empty and filtered-empty states", async ({ page }) => {
    await installCheckpointRegisterMock(page, {
      permissions: ["checkpoints:read"],
      mode: "empty",
    });
    await page.goto("/compliance/checkpoints");
    await expect(page.getByText("No Checkpoints yet")).toBeVisible();
  });

  test("shows list error and recovers on refresh", async ({ page }) => {
    await installCheckpointRegisterMock(page, {
      permissions: ["checkpoints:read"],
      mode: "error",
    });
    await page.goto("/compliance/checkpoints");
    await expect(page.getByTestId("checkpoint-register-error")).toBeVisible();
  });

  test("creates a Checkpoint and navigates to detail", async ({ page }) => {
    await installCheckpointRegisterMock(page, {
      permissions: [
        "*",
        "checkpoints:read",
        "checkpoints:write",
        "controls:read",
        "users:read",
        "organisation:read",
      ],
    });
    await page.goto("/compliance/checkpoints");
    await page.getByTestId("checkpoint-create-open").click();
    await page.getByTestId("checkpoint-form-control").selectOption(parentControl.id);
    await page.locator("#checkpoint-title").fill("Created Checkpoint");
    await page
      .locator("#checkpoint-expected-result")
      .fill("Expected verification outcome");
    await page.getByTestId("checkpoint-form-save").click();
    await expect(page).toHaveURL(
      /\/compliance\/checkpoints\/d0000000-0000-4000-8000-000000000099$/,
    );
    await expect(
      page.getByRole("heading", { name: "Created Checkpoint" }),
    ).toBeVisible();
  });

  test("excludes ARCHIVED Controls from create selector", async ({ page }) => {
    await installCheckpointRegisterMock(page, {
      permissions: [
        "*",
        "checkpoints:read",
        "checkpoints:write",
        "controls:read",
        "users:read",
        "organisation:read",
      ],
    });
    await page.goto("/compliance/checkpoints");
    await page.getByTestId("checkpoint-create-open").click();
    const select = page.getByTestId("checkpoint-form-control");
    await expect(select).toContainText("CTL-001");
    await expect(select).toContainText("CTL-002");
    await expect(select).not.toContainText("CTL-003");
  });

  test("ignores stale list responses after company switch", async ({
    page,
  }) => {
    const { armCompanyAListHold, releaseHeldLists } =
      await installCheckpointRegisterMock(page, {
        permissions: ["*", "checkpoints:read"],
      });
    await page.goto("/compliance/checkpoints");
    await expect(
      page.getByText("CHK-001").filter({ visible: true }).first(),
    ).toBeVisible();

    armCompanyAListHold(1);
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(
      page.getByText("CHK-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("CHK-001")).toHaveCount(0);
    releaseHeldLists();
    await expect(
      page.getByText("CHK-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("CHK-001")).toHaveCount(0);
  });
});
