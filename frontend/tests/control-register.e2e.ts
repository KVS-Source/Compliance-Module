/**
 * Control Register UI Playwright suite.
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

const framework = {
  id: "60000000-0000-4000-8000-000000000001",
  code: "FRM-001",
  name: "ISO 9001",
  version: "2025",
  description: "Quality management system",
  status: "ACTIVE",
};

const activeControl = {
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
  activePolicyVersionMappingCount: 1,
  activeFrameworkMappingCount: 1,
  activeFrameworkRuleMappingCount: 0,
  activeCheckpointCount: 0,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const inactiveControl = {
  ...activeControl,
  id: "c0000000-0000-4000-8000-000000000002",
  code: "CTL-002",
  title: "Inactive Backup Control",
  lifecycleStatus: "INACTIVE",
  implementationStatus: "NOT_STARTED",
  nextReviewDate: null,
  activePolicyVersionMappingCount: 0,
  activeFrameworkMappingCount: 0,
};

const companyTwoControl = {
  ...activeControl,
  id: "c0000000-0000-4000-8000-000000000201",
  code: "CTL-201",
  title: "Company Two Control",
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

const detailOf = (control: typeof activeControl) => ({
  ...control,
  description: "Control description",
  objective: "Protect access pathways",
  implementationNotes: null,
  verificationMethod: "Sample verification",
  inactiveCheckpointCount: 0,
  archivedCheckpointCount: 0,
});

async function installControlRegisterMock(
  page: Page,
  options: {
    permissions: string[];
    mode?: "populated" | "empty" | "filtered-empty" | "error";
  },
) {
  const canRead =
    options.permissions.includes("*") ||
    options.permissions.includes("controls:read");
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes("controls:write");
  const mode = options.mode ?? "populated";
  const listUrls: string[] = [];
  let activeCompany = company;
  let companyAControls =
    mode === "populated" ? [activeControl, inactiveControl] : [];
  const companyBControls = mode === "populated" ? [companyTwoControl] : [];
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

    if (path === "/api/v1/frameworks" && method === "GET") {
      if (
        !options.permissions.includes("*") &&
        !options.permissions.includes("frameworks:read")
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
        body: JSON.stringify(success([framework])),
      });
    }

    if (path === "/api/v1/policies" && method === "GET") {
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

    if (path === "/api/v1/controls" && method === "GET") {
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
            ? [...companyBControls]
            : [...companyAControls];

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

    if (path === "/api/v1/controls" && method === "POST") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const body = request.postDataJSON() as {
        title?: string;
        objective?: string;
        verificationMethod?: string;
        implementationStatus?: string;
        controlType?: string;
        frequency?: string;
      };
      if (
        !body.title?.trim() ||
        !body.objective?.trim() ||
        !body.verificationMethod?.trim()
      ) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Validation failed",
              details: [
                { path: "title", message: "Required" },
                { path: "objective", message: "Required" },
                { path: "verificationMethod", message: "Required" },
              ],
            },
          }),
        });
      }
      const created = detailOf({
        ...activeControl,
        id: "c0000000-0000-4000-8000-000000000099",
        code: "CTL-099",
        title: body.title.trim(),
        implementationStatus: body.implementationStatus ?? "NOT_STARTED",
        controlType: body.controlType ?? "PREVENTIVE",
        frequency: body.frequency ?? "MONTHLY",
      });
      companyAControls = [created, ...companyAControls];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    if (path.startsWith("/api/v1/controls/") && method === "GET") {
      const id = path.split("/")[4]!;
      if (path.endsWith("/traceability")) {
        const found = [...companyAControls, ...companyBControls].find(
          (row) => row.id === id,
        );
        if (!found) {
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
          body: JSON.stringify(
            success({
              control: detailOf(found),
              policyVersionMappings: [],
              frameworkMappings: [],
              frameworkRuleMappings: [],
              checkpointCounts: { active: 0, inactive: 0, archived: 0 },
            }),
          ),
        });
      }
      if (path.endsWith("/audit-events")) {
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
      const found = [...companyAControls, ...companyBControls].find(
        (row) => row.id === id,
      );
      if (!found || (found.id === companyTwoControl.id && activeCompany.id !== companyTwo.id)) {
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

test.describe("Control Register UI (mocked browser APIs)", () => {
  test("shows the live register without a prototype banner", async ({
    page,
  }) => {
    await installControlRegisterMock(page, {
      permissions: ["*", "controls:read", "controls:write"],
    });
    await page.goto("/compliance/controls");
    await expect(
      page.getByRole("heading", { name: "Control Register" }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(page.getByTestId("module-status-page")).toHaveCount(0);
    await expect(
      page.getByText("CTL-001").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText("Access Control Review")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("sends filters and search to the API and opens detail", async ({
    page,
  }) => {
    const { listUrls } = await installControlRegisterMock(page, {
      permissions: [
        "*",
        "controls:read",
        "controls:write",
        "users:read",
        "organisation:read",
        "frameworks:read",
      ],
    });
    await page.goto("/compliance/controls");
    await page
      .getByLabel("Search controls by code or title")
      .fill("CTL-001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect
      .poll(() => listUrls.some((url) => url.includes("q=CTL-001")))
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
    await page.getByRole("button", { name: "View CTL-001" }).first().click();
    await expect(page).toHaveURL(
      /\/compliance\/controls\/c0000000-0000-4000-8000-000000000001$/,
    );
    await expect(
      page.getByRole("heading", { name: "Access Control Review" }),
    ).toBeVisible();
    await expect(page.getByTestId("control-summary")).toBeVisible();
  });

  test("shows permission denied without requesting Control data", async ({
    page,
  }) => {
    const { listUrls } = await installControlRegisterMock(page, {
      permissions: ["kpis:read"],
    });
    await page.goto("/compliance/controls");
    await expect(page.getByText("Permission required")).toBeVisible();
    await expect(page.getByText("controls:read")).toBeVisible();
    expect(listUrls).toEqual([]);
  });

  test("hides write actions for read-only users", async ({ page }) => {
    await installControlRegisterMock(page, {
      permissions: [
        "controls:read",
        "users:read",
        "organisation:read",
        "frameworks:read",
      ],
    });
    await page.goto("/compliance/controls");
    await expect(page.getByTestId("control-create-open")).toHaveCount(0);
    await expect(page.getByLabel("Edit CTL-001")).toHaveCount(0);
    await expect(page.getByLabel("Archive CTL-001")).toHaveCount(0);
  });

  test("shows empty and filtered-empty states", async ({ page }) => {
    await installControlRegisterMock(page, {
      permissions: ["*", "controls:read"],
      mode: "empty",
    });
    await page.goto("/compliance/controls");
    await expect(page.getByText("No Controls yet")).toBeVisible();
  });

  test("shows a filtered-empty register state", async ({ page }) => {
    await installControlRegisterMock(page, {
      permissions: ["*", "controls:read"],
      mode: "filtered-empty",
    });
    await page.goto("/compliance/controls");
    await page.getByLabel("Search controls by code or title").fill("missing");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByText("No Controls match these filters"),
    ).toBeVisible();
  });

  test("shows safe error and retry", async ({ page }) => {
    await installControlRegisterMock(page, {
      permissions: ["*", "controls:read"],
      mode: "error",
    });
    await page.goto("/compliance/controls");
    await expect(page.getByTestId("control-register-error")).toBeVisible();
    await expect(
      page.getByTestId("control-register-error").getByRole("button", {
        name: "Retry",
      }),
    ).toBeVisible();
  });

  test("create modal validates required fields and navigates on success", async ({
    page,
  }) => {
    await installControlRegisterMock(page, {
      permissions: [
        "*",
        "controls:read",
        "controls:write",
        "users:read",
        "organisation:read",
        "frameworks:read",
        "policies:read",
      ],
    });
    await page.goto("/compliance/controls");
    await page.getByTestId("control-create-open").click();
    await expect(
      page.getByRole("heading", { name: "Create Control" }),
    ).toBeVisible();
    await page.getByTestId("control-form-save").click();
    await expect(page.locator("#control-title:invalid")).toBeVisible();

    await page.locator("#control-title").fill("New Network Control");
    await page.locator("#control-objective").fill("Segment critical networks.");
    await page
      .locator("#control-verification")
      .fill("Quarterly configuration review.");
    await page.getByTestId("control-form-save").click();
    await expect(page).toHaveURL(
      /\/compliance\/controls\/c0000000-0000-4000-8000-000000000099$/,
    );
    await expect(
      page.getByRole("heading", { name: "New Network Control" }),
    ).toBeVisible();
  });

  test("company switch reloads register and ignores stale held responses", async ({
    page,
  }) => {
    const { armCompanyAListHold, releaseHeldLists, listUrls } =
      await installControlRegisterMock(page, {
        permissions: ["*", "controls:read"],
      });
    await page.goto("/compliance/controls");
    await expect(page.getByText("CTL-001").first()).toBeVisible();

    armCompanyAListHold(1);
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect
      .poll(() =>
        listUrls.some((url) => url.includes("/api/v1/controls")),
      )
      .toBeTruthy();
    await expect(
      page.getByText("CTL-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("CTL-001")).toHaveCount(0);

    releaseHeldLists();
    await expect(
      page.getByText("CTL-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("CTL-001")).toHaveCount(0);
  });
});
