/**
 * Policy Register UI Playwright suite.
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
  email: "approver001@example.test",
  phone: null,
  department: "Compliance",
  roles: ["Approver"],
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

const draftVersion = {
  id: "a1000000-0000-4000-8000-000000000001",
  policyId: "a0000000-0000-4000-8000-000000000001",
  sequence: 1,
  version: "1.0",
  versionMajor: 1,
  versionMinor: 0,
  status: "DRAFT",
  effectiveDate: null,
  reviewDate: null,
  requiresEvidence: false,
  requestedApprover: null,
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
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
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const activePolicy = {
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
  currentApprovedVersion: null,
  latestVersion: draftVersion,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

const archivedPolicy = {
  ...activePolicy,
  id: "a0000000-0000-4000-8000-000000000002",
  code: "POL-002",
  title: "Archived Quality Policy",
  lifecycleStatus: "ARCHIVED",
  archivedAt: "2026-07-20T00:00:00.000Z",
  latestVersion: {
    ...draftVersion,
    id: "a1000000-0000-4000-8000-000000000002",
    policyId: "a0000000-0000-4000-8000-000000000002",
    status: "APPROVED",
  },
  currentApprovedVersion: {
    ...draftVersion,
    id: "a1000000-0000-4000-8000-000000000002",
    policyId: "a0000000-0000-4000-8000-000000000002",
    status: "APPROVED",
  },
};

const companyTwoPolicy = {
  id: "b0000000-0000-4000-8000-000000000001",
  code: "POL-201",
  title: "Company Two Access Policy",
  description: "Tenant-B only policy",
  lifecycleStatus: "ACTIVE",
  owner: { id: userOne.id, code: userOne.code, name: userOne.name },
  department: {
    id: department.id,
    code: department.code,
    name: department.name,
  },
  currentApprovedVersion: null,
  latestVersion: {
    ...draftVersion,
    id: "b1000000-0000-4000-8000-000000000001",
    policyId: "b0000000-0000-4000-8000-000000000001",
    frameworks: [],
  },
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
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

async function installPolicyRegisterMock(
  page: Page,
  options: {
    permissions: string[];
    mode?: "populated" | "empty" | "filtered-empty" | "error";
  },
) {
  const canRead =
    options.permissions.includes("*") ||
    options.permissions.includes("policies:read");
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes("policies:write");
  const mode = options.mode ?? "populated";
  const listUrls: string[] = [];
  let activeCompany = company;
  let companyAPolicies =
    mode === "populated" ? [activePolicy, archivedPolicy] : [];
  let companyBPolicies = mode === "populated" ? [companyTwoPolicy] : [];
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

  const policiesForActive = () =>
    activeCompany.id === companyTwo.id ? companyBPolicies : companyAPolicies;

  const allPolicies = () => [...companyAPolicies, ...companyBPolicies];

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

      let rows: typeof companyAPolicies =
        mode === "empty" || mode === "filtered-empty"
          ? []
          : respondingFor.id === companyTwo.id
            ? [...companyBPolicies]
            : [...companyAPolicies];

      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const lifecycle = url.searchParams.get("lifecycleStatus");
      const versionStatus = url.searchParams.get("versionStatus");
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
      if (versionStatus) {
        rows = rows.filter(
          (row) => row.latestVersion?.status === versionStatus,
        );
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

    if (path === "/api/v1/policies" && method === "POST") {
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
        content?: string;
      };
      if (!body.title?.trim() || !body.content?.trim()) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: [
                ...(!body.title?.trim()
                  ? [{ path: "title", message: "Required" }]
                  : []),
                ...(!body.content?.trim()
                  ? [{ path: "content", message: "Required" }]
                  : []),
              ],
            },
          }),
        });
      }
      const created = {
        ...activePolicy,
        id: "a0000000-0000-4000-8000-000000000099",
        code: "POL-099",
        title: body.title.trim(),
        latestVersion: {
          ...draftVersion,
          id: "a1000000-0000-4000-8000-000000000099",
          policyId: "a0000000-0000-4000-8000-000000000099",
          content: body.content.trim(),
          purpose: null,
          scope: null,
          changeSummary: null,
        },
        currentApprovedVersion: null,
      };
      if (activeCompany.id === companyTwo.id) {
        companyBPolicies = [
          {
            ...companyTwoPolicy,
            ...created,
            id: created.id,
            code: created.code,
            title: created.title,
            latestVersion: {
              ...companyTwoPolicy.latestVersion,
              ...created.latestVersion,
            },
          },
          ...companyBPolicies,
        ];
      } else {
        companyAPolicies = [created, ...companyAPolicies];
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    const detailMatch = /^\/api\/v1\/policies\/([^/]+)$/.exec(path);
    if (detailMatch && method === "GET") {
      if (!canRead) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const id = detailMatch[1]!;
      const found = allPolicies().find((row) => row.id === id);
      const belongsToActive =
        found &&
        ((activeCompany.id === company.id &&
          companyAPolicies.some((row) => row.id === id)) ||
          (activeCompany.id === companyTwo.id &&
            companyBPolicies.some((row) => row.id === id)));
      if (!found || !belongsToActive) {
        const missing = failure(404, "POLICY_NOT_FOUND", "Policy not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      const detail = {
        ...found,
        latestVersion: {
          ...found.latestVersion!,
          content: "Policy body content",
          purpose: "Purpose text",
          scope: "Scope text",
          changeSummary: "Initial draft",
        },
        currentApprovedVersion: found.currentApprovedVersion
          ? {
              ...found.currentApprovedVersion,
              content: "Approved body",
              purpose: null,
              scope: null,
              changeSummary: null,
            }
          : null,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(detail)),
      });
    }

    const versionsMatch = /^\/api\/v1\/policies\/([^/]+)\/versions$/.exec(path);
    if (versionsMatch && method === "GET") {
      const id = versionsMatch[1]!;
      const found = policiesForActive().find((row) => row.id === id);
      if (!found) {
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
        body: JSON.stringify(
          success([
            {
              ...found.latestVersion!,
              content: "Policy body content",
              purpose: "Purpose text",
              scope: "Scope text",
              changeSummary: "Initial draft",
            },
          ]),
        ),
      });
    }

    if (
      /^\/api\/v1\/policies\/([^/]+)\/(traceability|audit-events)$/.test(path) &&
      method === "GET"
    ) {
      const id = path.split("/")[4]!;
      const found = policiesForActive().find((row) => row.id === id);
      if (!found) {
        const missing = failure(404, "POLICY_NOT_FOUND", "Policy not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      if (path.endsWith("/traceability")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            success({
              policy: {
                ...found,
                latestVersion: {
                  ...found.latestVersion!,
                  content: "Policy body content",
                  purpose: null,
                  scope: null,
                  changeSummary: null,
                },
              },
              focusVersion: {
                ...found.latestVersion!,
                content: "Policy body content",
                purpose: null,
                scope: null,
                changeSummary: null,
              },
              controlMappings: [],
            }),
          ),
        });
      }
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

test.describe("Policy Register UI (mocked browser APIs)", () => {
  test("shows the live register without a prototype banner", async ({
    page,
  }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read", "policies:write"],
    });
    await page.goto("/compliance/policy-register");
    await expect(
      page.getByRole("heading", { name: "Policy Register" }),
    ).toBeVisible();
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(page.getByTestId("module-status-page")).toHaveCount(0);
    await expect(
      page.getByText("POL-001").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText("Information Security Policy")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("sends filters and search to the API and opens detail", async ({
    page,
  }) => {
    const { listUrls } = await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read", "policies:write", "users:read", "organisation:read", "frameworks:read"],
    });
    await page.goto("/compliance/policy-register");
    await page
      .getByLabel("Search policies by code or title")
      .fill("POL-001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect
      .poll(() => listUrls.some((url) => url.includes("q=POL-001")))
      .toBeTruthy();

    await page
      .getByLabel("Filter by lifecycle status")
      .selectOption("ARCHIVED");
    await expect
      .poll(() =>
        listUrls.some((url) => url.includes("lifecycleStatus=ARCHIVED")),
      )
      .toBeTruthy();

    await page.getByLabel("Filter by lifecycle status").selectOption("");
    await page.getByRole("button", { name: "View POL-001" }).first().click();
    await expect(page).toHaveURL(
      /\/compliance\/policies\/a0000000-0000-4000-8000-000000000001$/,
    );
    await expect(
      page.getByRole("heading", { name: "Information Security Policy" }),
    ).toBeVisible();
    await expect(page.getByTestId("policy-summary")).toBeVisible();
  });

  test("shows permission denied without requesting Policy data", async ({
    page,
  }) => {
    const { listUrls } = await installPolicyRegisterMock(page, {
      permissions: ["kpis:read"],
    });
    await page.goto("/compliance/policy-register");
    await expect(page.getByText("Permission required")).toBeVisible();
    await expect(page.getByText("policies:read")).toBeVisible();
    expect(listUrls).toEqual([]);
  });

  test("hides write actions for read-only users", async ({ page }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["policies:read", "users:read", "organisation:read", "frameworks:read"],
    });
    await page.goto("/compliance/policy-register");
    await expect(page.getByTestId("policy-create-open")).toHaveCount(0);
    await expect(page.getByLabel("Edit POL-001")).toHaveCount(0);
    await expect(page.getByLabel("Archive POL-001")).toHaveCount(0);
  });

  test("shows empty and filtered-empty states", async ({ page }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
      mode: "empty",
    });
    await page.goto("/compliance/policy-register");
    await expect(page.getByText("No Policies yet")).toBeVisible();
  });

  test("shows a filtered-empty register state", async ({ page }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
      mode: "filtered-empty",
    });
    await page.goto("/compliance/policy-register");
    await page.getByLabel("Search policies by code or title").fill("missing");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByText("No Policies match these filters"),
    ).toBeVisible();
  });

  test("shows safe error and retry", async ({ page }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
      mode: "error",
    });
    await page.goto("/compliance/policy-register");
    await expect(page.getByTestId("policy-register-error")).toBeVisible();
    await expect(
      page.getByTestId("policy-register-error").getByRole("button", {
        name: "Retry",
      }),
    ).toBeVisible();
  });

  test("create modal validates required fields and navigates on success", async ({
    page,
  }) => {
    await installPolicyRegisterMock(page, {
      permissions: [
        "*",
        "policies:read",
        "policies:write",
        "users:read",
        "organisation:read",
        "frameworks:read",
      ],
    });
    await page.goto("/compliance/policy-register");
    await page.getByTestId("policy-create-open").click();
    await expect(
      page.getByRole("heading", { name: "Create Policy" }),
    ).toBeVisible();
    await page.getByTestId("policy-form-save").click();
    await expect(page.locator("#policy-title:invalid")).toBeVisible();

    await page.getByLabel("Title (required)").fill("New Access Policy");
    await page
      .getByLabel("Content (required, plain text)")
      .fill("Access control requirements.");
    await page.getByTestId("policy-form-save").click();
    await expect(page).toHaveURL(
      /\/compliance\/policies\/a0000000-0000-4000-8000-000000000099$/,
    );
  });

  test("archived Policy remains readable via deep link", async ({ page }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
    });
    await page.goto(
      `/compliance/policies/${archivedPolicy.id}`,
    );
    await expect(
      page.getByRole("heading", { name: "Archived Quality Policy" }),
    ).toBeVisible();
    await expect(page.getByTestId("policy-archived-banner")).toBeVisible();
    await expect(page.getByTestId("policy-edit-open")).toHaveCount(0);
  });

  test("mobile cards render Policy register rows", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
    });
    await page.goto("/compliance/policy-register");
    const cards = page.getByTestId("policy-register-cards");
    await expect(cards).toBeVisible();
    await expect(
      cards.getByText("Information Security Policy").first(),
    ).toBeVisible();
  });

  test("clears previous-Company policies immediately on Company switch", async ({
    page,
  }) => {
    const { listUrls } = await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read", "policies:write"],
    });
    await page.goto("/compliance/policy-register");
    await expect(
      page.getByText("POL-001").filter({ visible: true }).first(),
    ).toBeVisible();

    await page.getByTestId("policy-create-open").click();
    await expect(
      page.getByRole("heading", { name: "Create Policy" }),
    ).toBeVisible();

    const before = listUrls.length;
    await page.locator("#company-switcher").selectOption(companyTwo.id);

    await expect(
      page.getByRole("heading", { name: "Create Policy" }),
    ).toHaveCount(0);
    await expect(page.getByText("POL-001")).toHaveCount(0);
    await expect(
      page.getByText("POL-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Company Two Access Policy").filter({ visible: true }).first(),
    ).toBeVisible();
    expect(listUrls.length).toBeGreaterThan(before);
  });

  test("drops Company A detail and related panels on Company switch", async ({
    page,
  }) => {
    await installPolicyRegisterMock(page, {
      permissions: ["*", "policies:read"],
    });
    await page.goto(`/compliance/policies/${activePolicy.id}`);
    await expect(
      page.getByRole("heading", { name: "Information Security Policy" }),
    ).toBeVisible();
    await expect(page.getByTestId("policy-summary")).toBeVisible();
    await expect(page.getByTestId("policy-version-history")).toBeVisible();
    await expect(page.getByTestId("policy-traceability")).toBeVisible();
    await expect(page.getByTestId("policy-audit-history")).toBeVisible();

    await page.locator("#company-switcher").selectOption(companyTwo.id);

    await expect(page.getByText("Policy not found")).toBeVisible();
    await expect(page.getByTestId("policy-summary")).toHaveCount(0);
    await expect(page.getByTestId("policy-version-history")).toHaveCount(0);
    await expect(page.getByTestId("policy-traceability")).toHaveCount(0);
    await expect(page.getByTestId("policy-audit-history")).toHaveCount(0);
    await expect(page.getByText("Information Security Policy")).toHaveCount(0);
  });

  test("reloads Company A after switching back and ignores stale late responses", async ({
    page,
  }) => {
    const { listUrls, armCompanyAListHold, releaseHeldLists } =
      await installPolicyRegisterMock(page, {
        permissions: ["*", "policies:read"],
      });
    await page.goto("/compliance/policy-register");
    await expect(
      page.getByText("POL-001").filter({ visible: true }).first(),
    ).toBeVisible();

    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(
      page.getByText("POL-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("POL-001")).toHaveCount(0);

    armCompanyAListHold(1);
    const afterB = listUrls.length;
    // Switch back to A — list is held — then immediately to B again.
    await page.locator("#company-switcher").selectOption(company.id);
    await expect.poll(() => listUrls.length).toBeGreaterThan(afterB);
    await page.locator("#company-switcher").selectOption(companyTwo.id);
    await expect(
      page.getByText("POL-201").filter({ visible: true }).first(),
    ).toBeVisible();

    releaseHeldLists();
    await expect
      .poll(() => page.getByText("POL-001").count())
      .toBe(0);
    await expect(
      page.getByText("POL-201").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Information Security Policy")).toHaveCount(0);

    // Fresh switch back to A succeeds without stale overwrite.
    await page.locator("#company-switcher").selectOption(company.id);
    await expect(
      page.getByText("POL-001").filter({ visible: true }).first(),
    ).toBeVisible();
  });
});
