/** Mocked final-client-completion UI coverage — no real workbook bytes or secrets. */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};
const company2 = {
  id: "10000000-0000-4000-8000-000000000002",
  code: "COM-002",
  name: "Company 002",
};
const importId = "93000000-0000-4000-8000-000000000001";
const auditId = "95000000-0000-4000-8000-000000000001";
const registerCode = "AUDIT_SCHEDULE";
const recordId = "96000000-0000-4000-8000-000000000001";

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const identity = (active = company) => ({
  id: "20000000-0000-4000-8000-000000000001",
  code: "USR-001",
  name: "User 001",
  email: "admin001@example.test",
  phone: null,
  status: "ACTIVE",
  lastLogin: null,
  permissions: ["*"],
  activeCompany: { id: active.id, code: active.code, name: active.name },
  companies: [
    { id: company.id, code: company.code, name: company.name },
    { id: company2.id, code: company2.code, name: company2.name },
  ],
});

const previewPayload = {
  importId,
  alreadyImported: false,
  preview: {
    workbook: {
      filename: "synthetic.xlsx",
      checksum: "a".repeat(64),
      byteSize: 2048,
      sheetCount: 1,
    },
    sheets: [
      {
        key: "gaps",
        sheetName: "Gaps",
        target: "normalised",
        present: true,
        totalRows: 2,
        validRows: 1,
        errorRows: 1,
        flaggedRows: 0,
        missingHeaders: [],
      },
    ],
    unmappedSheets: [],
    issues: [
      {
        sheet: "Gaps",
        rowNumber: 2,
        businessKey: "GAP-2",
        field: "owner",
        message: "Owner reference was not resolved",
      },
    ],
    totals: { totalRows: 2, validRows: 1, errorRows: 1, flaggedRows: 0 },
  },
};

const duplicatePreview = {
  ...previewPayload,
  alreadyImported: true,
};

const csvTemplates = [
  {
    type: "GAPS",
    label: "Gaps",
    headers: ["Gap ID", "Gap Description"],
    sheetKey: "gaps",
  },
];

const auditEvent = {
  id: auditId,
  action: "WORKBOOK_IMPORT_COMMITTED",
  entityType: "IMPORT_BATCH",
  entityId: importId,
  recordCode: null,
  source: "IMPORT",
  storedSource: "IMPORT",
  success: true,
  correlationId: null,
  requestId: "req-1",
  metadata: { originalFilename: "synthetic.xlsx" },
  ipAddress: null,
  userAgent: null,
  createdAt: "2026-08-04T10:00:00.000Z",
  user: { id: identity().id, code: "USR-001", name: "User 001" },
};

const registerType = {
  id: "97000000-0000-4000-8000-000000000001",
  code: registerCode,
  name: "Audit Schedule",
  description: null,
  active: true,
  recordCount: 1,
  fields: [{ key: "Owner", label: "Owner", type: "string" }],
};

const registerRecord = {
  id: recordId,
  businessRecordCode: "AUD-001",
  title: "Internal QMS audit",
  status: "Open",
  owner: null,
  sourceOwnerRef: null,
  department: null,
  recordDate: "2026-07-01",
  dueDate: "2026-08-01",
  overdue: false,
  fields: { Owner: "User 001" },
  register: { id: registerType.id, code: registerCode, name: "Audit Schedule" },
};

const genracStatus = {
  connection: {
    id: "90000000-0000-4000-8000-000000000001",
    systemCode: "GENRAC",
    displayName: "GenRAC",
    connectorType: "CSV_FILE",
    status: "NOT_CONFIGURED",
    secretRefKeys: [],
    config: {},
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestMessage: null,
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    configurationExplanation:
      "GenRAC credentials and connection settings are not configured.",
  },
  mappingCount: 0,
  lastSyncRun: null,
  liveAccess: false,
  adapters: { csvFile: false, rest: false, postgresReadonly: false },
};

async function installFinalMock(page: Page, options: { duplicate?: boolean } = {}) {
  let active = company;
  let previewCalls = 0;
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "token", user: identity(active) }),
        ),
      });
    }
    if (path === "/api/v1/auth/tenant-context" && method === "POST") {
      const payload = request.postDataJSON() as { companyId: string };
      active =
        [company, company2].find((item) => item.id === payload.companyId) ??
        active;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "switched", user: identity(active) }),
        ),
      });
    }
    if (path === "/api/v1/imports/csv/templates") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(csvTemplates)),
      });
    }
    if (path === "/api/v1/imports/workbook/preview" && method === "POST") {
      previewCalls += 1;
      const body =
        options.duplicate || previewCalls > 1 ? duplicatePreview : previewPayload;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(body)),
      });
    }
    if (path.startsWith("/api/v1/imports/csv/preview") && method === "POST") {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: 'CSV header mismatch at column 1: expected "Gap ID"',
          },
        }),
      });
    }
    if (path === "/api/v1/audit-events") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([auditEvent], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }
    if (path === "/api/v1/operational-registers") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([registerType], {
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }
    if (
      path ===
      `/api/v1/operational-registers/${registerCode}/records`
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([registerRecord], {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          }),
        ),
      });
    }
    if (
      path ===
      `/api/v1/operational-registers/${registerCode}/records/${recordId}`
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(registerRecord)),
      });
    }
    if (path === "/api/v1/integrations/genrac/status") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(genracStatus)),
      });
    }
    if (path === "/api/v1/integrations/genrac/history") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 10, total: 0, totalPages: 0 }),
        ),
      });
    }
    if (path === "/api/v1/dashboard/summary") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            kpis: {
              activeConfigurations: 0,
              meetingTarget: 0,
              amberActuals: 0,
              redActuals: 0,
              pendingApprovals: 0,
            },
            risks: {
              openRisks: 0,
              minorRisks: 0,
              majorRisks: 0,
              risksUnderTreatment: 0,
              closedRisks: 0,
            },
            organisation: { departments: 0, locations: 0, organisationUnits: 0 },
            frameworks: { activeFrameworks: 0 },
          }),
        ),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Not mocked" },
      }),
    });
  });
}

test("Data Import previews XLSX and surfaces CSV validation errors", async ({
  page,
}) => {
  await installFinalMock(page);
  await page.goto("/data/import");
  await expect(page.getByTestId("import-centre-form")).toBeVisible();

  await page.setInputFiles('input[type="file"]', {
    name: "synthetic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK-synthetic"),
  });
  await page.getByRole("button", { name: "Upload for preview" }).click();
  await expect(page.getByTestId("import-preview")).toBeVisible();
  await expect(page.getByTestId("import-row-errors")).toContainText(
    "Owner reference was not resolved",
  );

  const form = page.getByTestId("import-centre-form");
  await form.locator("select").nth(0).selectOption("CSV");
  await form.locator("select").nth(1).selectOption("GAPS");
  await page.setInputFiles('input[type="file"]', {
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Wrong,Headers\nA,B\n"),
  });
  await page.getByRole("button", { name: "Upload for preview" }).click();
  await expect(page.locator(".form-error")).toContainText(/header/i);
});

test("Data Import marks already-imported workbook duplicates", async ({
  page,
}) => {
  await installFinalMock(page, { duplicate: true });
  await page.goto("/data/import");
  await page.setInputFiles('input[type="file"]', {
    name: "dup.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK-dup"),
  });
  await page.getByRole("button", { name: "Upload for preview" }).click();
  await expect(page.getByRole("status")).toContainText("already imported");
  await expect(page.getByText("duplicate", { exact: true })).toBeVisible();
});

test("Audit Trail lists and filters company events", async ({ page }) => {
  await installFinalMock(page);
  await page.goto("/audit-trail");
  await expect(page.getByTestId("audit-trail-table")).toContainText(
    "WORKBOOK_IMPORT_COMMITTED",
  );
  await page.getByPlaceholder("Search action or entity…").fill("IMPORT");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("audit-trail-table")).toContainText(
    "WORKBOOK_IMPORT_COMMITTED",
  );
  await page.getByLabel("Source").selectOption("IMPORT");
  await expect(page.getByTestId("audit-trail-table")).toContainText("IMPORT");
});

test("Operational Registers selector, list, detail and write control", async ({
  page,
}) => {
  await installFinalMock(page);
  await page.goto("/compliance/operational-registers");
  await expect(page.getByRole("button", { name: "Add record" })).toBeVisible();
  await expect(page.getByTestId("operational-registers-table")).toContainText(
    "AUD-001",
  );
  await page
    .getByRole("button", { name: /View AUD-001|View detail/ })
    .first()
    .click();
  await expect(page.getByTestId("operational-register-detail")).toContainText(
    "AUD-001",
  );
  await expect(page.getByRole("heading", { name: "Internal QMS audit" })).toBeVisible();
});

test("GenRAC Not configured disables actions with explanatory titles", async ({
  page,
}) => {
  await installFinalMock(page);
  await page.goto("/data/genrac-integration");
  await expect(page.getByTestId("genrac-status")).toContainText(
    "Not configured",
  );
  await expect(page.getByRole("button", { name: "Test Connection" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preview Changes" })).toHaveAttribute(
    "title",
    /Not configured|Configure/,
  );
  await expect(page.getByRole("button", { name: "Run Sync" })).toHaveAttribute(
    "title",
    /Not configured/,
  );
});

test("desktop and mobile nav expose live modules and hide unfinished modules", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await installFinalMock(page);
    await page.goto("/dashboard");
    if (viewport.width <= 900) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await expect(page.locator(".nav-status-badge")).toHaveCount(0);
    // Role & Access is now a real read-only page, so it belongs in navigation.
    // Tasks is now live; deferred tenant-settings and Customer/Deal prototype routes are not.
    await expect(page.locator('a[href="/admin/roles"]')).toHaveCount(1);
    await expect(page.locator('a[href="/tasks"]')).toHaveCount(1);
    await expect(page.locator('a[href="/settings/tenant"]')).toHaveCount(0);
    await expect(page.locator('a[href="/master/customers"]')).toHaveCount(0);
    await expect(page.locator('a[href="/reports/deals"]')).toHaveCount(0);
    await expect(page.locator('a[href="/reports/attribution"]')).toHaveCount(0);
    await expect(page.locator('a[href="/data/import"]')).toHaveCount(1);
    const dataGroup = page.getByRole("button", {
      name: "Data Management",
      exact: true,
    });
    if ((await dataGroup.getAttribute("aria-expanded")) === "false") {
      await dataGroup.click();
    }
    await expect(page.locator('a[href="/data/import"]')).toBeVisible();
  }
});

test("company switch clears tenant-scoped import preview state", async ({
  page,
}) => {
  await installFinalMock(page);
  await page.goto("/data/import");
  await page.setInputFiles('input[type="file"]', {
    name: "synthetic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK-synthetic"),
  });
  await page.getByRole("button", { name: "Upload for preview" }).click();
  await expect(page.getByTestId("import-preview")).toBeVisible();

  await page.locator("#company-switcher").selectOption(company2.id);
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
  await expect(page.getByTestId("import-centre-form")).toBeVisible();
});
