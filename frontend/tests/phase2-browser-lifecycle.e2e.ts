import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Mocked browser coverage: requests exercise the React API clients and forms,
 * while backend integration tests separately exercise PostgreSQL.
 */

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};
const currentUser = {
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
};
const owner = {
  id: "20000000-0000-4000-8000-000000000003",
  code: "USR-003",
  name: "User 003",
};
const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Department 001",
  headName: null,
  status: "ACTIVE",
  createdAt: "2026-08-01T00:00:00.000Z",
};
const registerCode = "AUDIT_SCHEDULE";
const registerId = "90000000-0000-4000-8000-000000000001";
const initialRecordId = "91000000-0000-4000-8000-000000000001";
const createdRecordId = "91000000-0000-4000-8000-000000000002";
const createdRiskId = "92000000-0000-4000-8000-000000000001";

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const pageMeta = (total: number) => ({
  page: 1,
  pageSize: 20,
  total,
  totalPages: total === 0 ? 0 : 1,
});

const identity = {
  ...currentUser,
  email: "user001@example.test",
  phone: null,
  status: "ACTIVE",
  lastLogin: null,
  permissions: [
    "dashboard:read",
    "registers:read",
    "registers:write",
    "risk:read",
    "risk:write",
    "users:read",
    "organisation:read",
    "kpis:read",
    "gaps:read",
    "capa:read",
  ],
  activeCompany: company,
  companies: [company],
};

const userRows = [currentUser, owner].map((user) => ({
  ...user,
  email: `${user.code.toLowerCase()}@example.test`,
  phone: null,
  department: null,
  roles: [],
  status: "ACTIVE",
  lastLogin: null,
}));

const registerType = {
  id: registerId,
  code: registerCode,
  name: "Audit Schedule",
  description: "Anonymized audit register.",
  active: true,
  recordCount: 1,
  fields: [{ key: "Lead Auditor", label: "Lead Auditor", type: "string" }],
};

const initialRecord = {
  id: initialRecordId,
  businessRecordCode: "AUD-001",
  title: "Initial audit record",
  status: "Open",
  owner: null,
  sourceOwnerRef: null,
  department: null,
  recordDate: "2026-08-01",
  dueDate: "2026-09-01",
  overdue: false,
  fields: { "Lead Auditor": "User 001" },
  register: { id: registerId, code: registerCode, name: "Audit Schedule" },
};

const manualRisk = {
  id: createdRiskId,
  code: "RSK-043",
  title: "Manual review meeting risk",
  description: "Risk identified during the quarterly review meeting.",
  category: "Operations",
  kpiRiskClass: null,
  generalLevel: "CRITICAL",
  inherentLikelihood: 4,
  inherentImpact: 5,
  inherentScore: 20,
  status: "OPEN",
  source: { actual: null, configuration: null, target: null },
  residualLikelihood: null,
  residualImpact: null,
  residualScore: null,
  owner,
  treatmentStrategy: null,
  reviewDate: null,
  closedAt: null,
  closureReason: null,
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

async function installPhase2Mock(
  page: Page,
  permissions: string[] = identity.permissions,
) {
  const records = [{ ...initialRecord }];
  const risks: Array<typeof manualRisk> = [];
  const writes: string[] = [];

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

    if (path === "/api/v1/auth/refresh") {
      return json(
        route,
        200,
        success({
          accessToken: "phase2-token",
          user: { ...identity, permissions },
        }),
      );
    }
    if (path === "/api/v1/dashboard/summary") {
      return json(
        route,
        200,
        success({
          kpis: { pendingApprovals: 2 },
          gaps: { open: 3 },
          capas: { overdue: 1 },
          analytics: {
            actionQueue: [
              {
                key: "gap-open",
                label: "Open Gaps",
                description: "Compliance gaps still awaiting remediation.",
                count: 3,
                to: "/compliance/gaps",
                tone: "amber",
              },
              {
                key: "kpi-approval",
                label: "KPI actuals awaiting approval",
                description: "Submitted KPI actuals with no approval decision.",
                count: 2,
                to: "/kpi/approval",
                tone: "blue",
              },
              {
                key: "capa-overdue",
                label: "Overdue CAPAs",
                description: "Open corrective actions past their due date.",
                count: 1,
                to: "/compliance/capa",
                tone: "red",
              },
            ],
          },
        }),
      );
    }
    if (path === "/api/v1/users" && method === "GET") {
      return json(route, 200, success(userRows, pageMeta(userRows.length)));
    }
    if (path === "/api/v1/organisation/departments" && method === "GET") {
      return json(route, 200, success([department], pageMeta(1)));
    }
    if (path === "/api/v1/operational-registers" && method === "GET") {
      return json(
        route,
        200,
        success(
          [{ ...registerType, recordCount: records.length }],
          pageMeta(1),
        ),
      );
    }
    if (
      path === `/api/v1/operational-registers/${registerCode}/records` &&
      method === "GET"
    ) {
      return json(route, 200, success(records, pageMeta(records.length)));
    }
    if (
      path === `/api/v1/operational-registers/${registerCode}/records` &&
      method === "POST"
    ) {
      writes.push(`${method} ${path}`);
      const body = request.postDataJSON() as {
        businessRecordCode: string;
        title: string;
        status: string | null;
        ownerId: string | null;
        departmentId: string | null;
        recordDate: string | null;
        dueDate: string | null;
        payload: Record<string, string>;
      };
      const created = {
        ...initialRecord,
        ...body,
        id: createdRecordId,
        owner: body.ownerId === owner.id ? owner : null,
        department: body.departmentId === department.id ? department : null,
        sourceOwnerRef: null,
        overdue: false,
        fields: body.payload,
      };
      records.unshift(created);
      return json(route, 201, success(created));
    }
    if (
      path ===
        `/api/v1/operational-registers/${registerCode}/records/${createdRecordId}` &&
      method === "PATCH"
    ) {
      writes.push(`${method} ${path}`);
      const body = request.postDataJSON() as Record<string, unknown>;
      const index = records.findIndex((record) => record.id === createdRecordId);
      records[index] = {
        ...records[index]!,
        ...body,
        fields: (body.payload as Record<string, string>) ?? records[index]!.fields,
      };
      return json(route, 200, success(records[index]));
    }
    if (path === "/api/v1/risks" && method === "GET") {
      return json(route, 200, success(risks, pageMeta(risks.length)));
    }
    if (path === "/api/v1/risks" && method === "POST") {
      writes.push(`${method} ${path}`);
      risks.unshift(manualRisk);
      return json(route, 201, success(manualRisk));
    }

    return json(route, 404, {
      success: false,
      error: { code: "NOT_FOUND", message: "Mock route not found" },
    });
  });

  return { writes };
}

test("creates and edits an operational-register record", async ({ page }) => {
  const { writes } = await installPhase2Mock(page);
  await page.goto("/compliance/operational-registers");
  await page.getByRole("button", { name: "Add record" }).click();

  const dialog = page.getByRole("dialog", { name: "Add Audit Schedule record" });
  await dialog.getByLabel("Record code").fill("AUD-002");
  await dialog.getByLabel("Status").fill("Open");
  await dialog.getByLabel("Title").fill("Manual audit record");
  await dialog.getByLabel("Owner").selectOption(owner.id);
  await dialog.getByLabel("Department").selectOption(department.id);
  await dialog.getByLabel("Due date").fill("2026-10-01");
  await dialog.getByLabel("Lead Auditor").fill("User 003");
  await dialog.getByRole("button", { name: "Create record" }).click();

  const surface = page.locator(
    '[data-testid="operational-registers-table"]:visible, [data-testid="operational-registers-cards"]:visible',
  );
  await expect(surface).toContainText("Manual audit record");
  await expect(surface).toContainText("AUD-002");

  await page.locator('button[aria-label="Edit AUD-002"]:visible').click();
  const editDialog = page.getByRole("dialog", { name: "Edit AUD-002" });
  await editDialog.getByLabel("Status").fill("Closed");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(surface).toContainText("Closed");
  expect(writes).toEqual([
    `POST /api/v1/operational-registers/${registerCode}/records`,
    `PATCH /api/v1/operational-registers/${registerCode}/records/${createdRecordId}`,
  ]);
});

test("creates a manual risk and shows the live work-queue count", async ({ page }) => {
  const { writes } = await installPhase2Mock(page);
  await page.goto("/compliance/risks");

  await expect(page.locator(".top-notifications .counter")).toHaveText("6");
  await page.getByRole("button", { name: "Notifications" }).click();
  const queue = page.getByRole("dialog", { name: "Notifications" });
  await expect(queue).toContainText("2 KPI actuals awaiting approval");
  await expect(queue).toContainText("3 Open Gaps");
  await expect(queue).toContainText("1 Overdue CAPA");
  await page.getByRole("button", { name: "Notifications" }).click();

  await page.getByRole("button", { name: "Add risk" }).click();
  const dialog = page.getByRole("dialog", { name: "Add manual risk" });
  await dialog.getByLabel("Title").fill("Manual review meeting risk");
  await dialog
    .getByLabel("Description")
    .fill("Risk identified during the quarterly review meeting.");
  await dialog.getByLabel("Category").fill("Operations");
  await dialog.getByLabel("Owner").selectOption(owner.id);
  await dialog.getByLabel("Inherent likelihood").selectOption("4");
  await dialog.getByLabel("Inherent impact").selectOption("5");
  await dialog.getByRole("button", { name: "Create risk" }).click();

  const surface = page.locator(
    '[data-testid="risk-register-table"]:visible, [data-testid="risk-register-cards"]:visible',
  );
  await expect(surface).toContainText("Manual review meeting risk");
  await expect(surface).toContainText("RSK-043");
  await expect(surface).toContainText("CRITICAL");
  expect(writes).toEqual(["POST /api/v1/risks"]);
});

test("hides register and risk create controls without write permissions", async ({
  page,
}) => {
  await installPhase2Mock(page, [
    "dashboard:read",
    "registers:read",
    "risk:read",
  ]);
  await page.goto("/compliance/operational-registers");
  await expect(page.getByRole("button", { name: "Add record" })).toHaveCount(0);
  await expect(page.locator('button[aria-label^="Edit "]')).toHaveCount(0);

  await page.goto("/compliance/risks");
  await expect(page.getByRole("button", { name: "Add risk" })).toHaveCount(0);
});
