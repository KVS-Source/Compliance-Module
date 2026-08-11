import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Slice 5.6B — Evidence links and gate-aware integration (mocked API).
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

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Operations",
};

const EVIDENCE_DRAFT = "a0000000-0000-4000-8000-000000000001";
const CONTROL_ID = "b0000000-0000-4000-8000-000000000001";
const CHECKPOINT_ID = "b0000000-0000-4000-8000-000000000002";
const KPI_ACTUAL_ID = "c0000000-0000-4000-8000-000000000001";

const FULL_PERMISSIONS = [
  "evidence:read",
  "evidence:write",
  "controls:read",
  "checkpoints:read",
  "kpi-actual:read",
  "users:read",
  "organisation:read",
  "tenants:read",
];

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
) => ({
  status,
  body: {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  },
});

const pageMeta = (total: number) => ({
  page: 1,
  pageSize: 20,
  total,
  totalPages: 1,
});

const baseEvidence = () => ({
  id: EVIDENCE_DRAFT,
  code: "EVD-001",
  title: "Draft Evidence",
  description: "Link test Evidence",
  lifecycleStatus: "DRAFT",
  owner: currentUser,
  department,
  issueDate: "2026-07-01",
  expiresAt: "2027-07-01",
  supersedesEvidenceId: null,
  supersedes: null,
  hasFile: true,
  file: {
    originalFileName: "proof.pdf",
    mimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    byteSize: 1024,
    uploadedAt: "2026-07-10T10:00:00.000Z",
    uploadedBy: currentUser,
  },
  submittedById: null,
  submittedAt: null,
  submittedBy: null,
  reviewedById: null,
  reviewedAt: null,
  reviewedBy: null,
  archivedAt: null,
  createdById: currentUser.id,
  createdBy: currentUser,
  updatedById: currentUser.id,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  latestReviewDecision: null,
  activeControlLinkCount: 0,
  activeCheckpointLinkCount: 0,
});

interface LinkMockState {
  controlLinks: Array<ReturnType<typeof controlLink>>;
  checkpointLinks: Array<ReturnType<typeof checkpointLink>>;
  kpiLinks: Array<ReturnType<typeof kpiLink>>;
  linkKpiCalls: number;
}

const controlLink = (controlId = CONTROL_ID) => ({
  id: "d0000000-0000-4000-8000-000000000001",
  isActive: true,
  control: {
    id: controlId,
    code: "CTL-001",
    title: "Access control",
    lifecycleStatus: "ACTIVE",
  },
  linkedAt: "2026-07-11T10:00:00.000Z",
  linkedBy: currentUser,
  updatedAt: "2026-07-11T10:00:00.000Z",
  updatedBy: currentUser,
});

const checkpointLink = (checkpointId = CHECKPOINT_ID) => ({
  id: "d0000000-0000-4000-8000-000000000002",
  isActive: true,
  checkpoint: {
    id: checkpointId,
    code: "CHK-001",
    title: "Monthly review",
    lifecycleStatus: "ACTIVE",
    controlId: CONTROL_ID,
  },
  linkedAt: "2026-07-11T10:00:00.000Z",
  linkedBy: currentUser,
  updatedAt: "2026-07-11T10:00:00.000Z",
  updatedBy: currentUser,
});

const kpiLink = () => ({
  id: "d0000000-0000-4000-8000-000000000003",
  isActive: true,
  evidence: {
    id: EVIDENCE_DRAFT,
    code: "EVD-001",
    title: "Draft Evidence",
    lifecycleStatus: "DRAFT",
  },
  kpiActual: {
    id: KPI_ACTUAL_ID,
    code: "ACT-001",
    period: "2026-Q3",
    approvalStatus: "PENDING_APPROVAL",
  },
  linkedAt: "2026-07-11T10:00:00.000Z",
  linkedBy: currentUser,
  updatedAt: "2026-07-11T10:00:00.000Z",
  updatedBy: currentUser,
});

async function installLinkMock(
  page: Page,
  options: { permissions?: string[]; lifecycleStatus?: string } = {},
) {
  const permissions = options.permissions ?? FULL_PERMISSIONS;
  const lifecycleStatus = options.lifecycleStatus ?? "DRAFT";
  const has = (permission: string) => permissions.includes(permission);

  const state: LinkMockState = {
    controlLinks: [],
    checkpointLinks: [],
    kpiLinks: [],
    linkKpiCalls: 0,
  };

  const identity = () => ({
    id: currentUser.id,
    code: currentUser.code,
    name: currentUser.name,
    email: "admin001@example.test",
    permissions,
    activeCompany: company,
    companies: [company],
  });

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    // Record comments render on every detail page; the mock answers with an
    // empty conversation so the panel shows its empty state rather than an
    // error that would collide with the page's own alerts.
    if (/\/api\/v1\/records\/[A-Z]+\/[^/]+\/comments$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
    }

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return json(route, 200, success({ accessToken: "token", user: identity() }));
    }
    if (path === "/api/v1/tenants") {
      return json(route, 200, success([company]));
    }
    if (path === "/api/v1/users") {
      return json(route, 200, success([currentUser], pageMeta(1)));
    }
    if (path === "/api/v1/organisation/departments") {
      return json(route, 200, success([department], pageMeta(1)));
    }
    if (path === "/api/v1/evidence" && method === "GET") {
      return json(route, 200, success([], pageMeta(0)));
    }

    const evidenceMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)$/);
    if (evidenceMatch && method === "GET") {
      if (!has("evidence:read")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return json(route, denied.status, denied.body);
      }
      return json(
        route,
        200,
        success({ ...baseEvidence(), lifecycleStatus }),
      );
    }

    const controlsList = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/controls$/,
    );
    if (controlsList && method === "GET") {
      return json(
        route,
        200,
        success(state.controlLinks, pageMeta(state.controlLinks.length)),
      );
    }

    const controlLinkMatch = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/controls\/([^/]+)$/,
    );
    if (controlLinkMatch && method === "POST") {
      if (!has("evidence:write")) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return json(route, denied.status, denied.body);
      }
      state.controlLinks = [controlLink(controlLinkMatch[2]!)];
      return json(route, 201, success(state.controlLinks[0]));
    }

    const controlUnlink = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/controls\/([^/]+)\/unlink$/,
    );
    if (controlUnlink && method === "POST") {
      state.controlLinks = [];
      return json(route, 200, success(controlLink(controlUnlink[2]!)));
    }

    const checkpointsList = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/checkpoints$/,
    );
    if (checkpointsList && method === "GET") {
      return json(
        route,
        200,
        success(state.checkpointLinks, pageMeta(state.checkpointLinks.length)),
      );
    }

    const checkpointLinkMatch = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/checkpoints\/([^/]+)$/,
    );
    if (checkpointLinkMatch && method === "POST") {
      state.checkpointLinks = [checkpointLink(checkpointLinkMatch[2]!)];
      return json(route, 201, success(state.checkpointLinks[0]));
    }

    const kpiList = path.match(/^\/api\/v1\/evidence\/([^/]+)\/kpi-actuals$/);
    if (kpiList && method === "GET") {
      return json(
        route,
        200,
        success(state.kpiLinks, pageMeta(state.kpiLinks.length)),
      );
    }

    const kpiLinkMatch = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/kpi-actuals\/([^/]+)$/,
    );
    if (kpiLinkMatch && method === "POST") {
      state.linkKpiCalls += 1;
      state.kpiLinks = [kpiLink()];
      return json(route, 201, success(state.kpiLinks[0]));
    }

    const kpiReverse = path.match(
      /^\/api\/v1\/kpi-actuals\/([^/]+)\/evidence-links$/,
    );
    if (kpiReverse && method === "GET") {
      return json(
        route,
        200,
        success(state.kpiLinks, pageMeta(state.kpiLinks.length)),
      );
    }

    if (path === "/api/v1/controls" && method === "GET") {
      return json(
        route,
        200,
        success(
          [
            {
              id: CONTROL_ID,
              code: "CTL-001",
              title: "Access control",
              lifecycleStatus: "ACTIVE",
            },
          ],
          pageMeta(1),
        ),
      );
    }

    if (path === "/api/v1/checkpoints" && method === "GET") {
      return json(
        route,
        200,
        success(
          [
            {
              id: CHECKPOINT_ID,
              code: "CHK-001",
              title: "Monthly review",
              lifecycleStatus: "ACTIVE",
              controlId: CONTROL_ID,
            },
          ],
          pageMeta(1),
        ),
      );
    }

    if (path === "/api/v1/kpi-actuals" && method === "GET") {
      return json(
        route,
        200,
        success(
          [
            {
              id: KPI_ACTUAL_ID,
              code: "ACT-001",
              period: "2026-Q3",
              approvalStatus: "PENDING_APPROVAL",
            },
          ],
          pageMeta(1),
        ),
      );
    }

    if (path === "/api/v1/evidence" && method === "POST") {
      return json(route, 201, success({ ...baseEvidence(), id: EVIDENCE_DRAFT }));
    }

    const uploadMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/file$/);
    if (uploadMatch && method === "POST") {
      return json(route, 200, success(baseEvidence()));
    }

    if (path.endsWith("/review-decisions") || path.endsWith("/audit-events")) {
      return json(route, 200, success([], pageMeta(0)));
    }

    return json(route, 200, success([], pageMeta(0)));
  });

  return state;
}

const fixturePath = resolve(
  new URL("./fixtures/sample-evidence.txt", import.meta.url).pathname,
);

test.describe("Evidence links and gates (Slice 5.6B)", () => {
  test("A. Control link section loads empty on DRAFT detail", async ({ page }) => {
    await installLinkMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await expect(page.getByTestId("evidence-control-links")).toBeVisible();
    await expect(page.getByTestId("evidence-control-links-empty")).toBeVisible();
  });

  test("B. Links and unlinks a Control on DRAFT Evidence", async ({ page }) => {
    const state = await installLinkMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await page.getByTestId("evidence-control-select").selectOption(CONTROL_ID);
    await page.getByTestId("evidence-control-link").click();
    await expect(page.getByTestId("evidence-control-link-list")).toContainText(
      "CTL-001",
    );
    expect(state.controlLinks.length).toBe(1);

    await page.getByTestId(`evidence-control-unlink-${CONTROL_ID}`).click();
    await page.getByTestId("evidence-unlink-confirm").click();
    await expect(page.getByTestId("evidence-control-links-empty")).toBeVisible();
  });

  test("C. Checkpoint link picker links ACTIVE checkpoint", async ({ page }) => {
    const state = await installLinkMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await page.getByTestId("evidence-checkpoint-select").selectOption(CHECKPOINT_ID);
    await page.getByTestId("evidence-checkpoint-link").click();
    await expect(page.getByTestId("evidence-checkpoint-link-list")).toContainText(
      "CHK-001",
    );
    expect(state.checkpointLinks.length).toBe(1);
  });

  test("D. KPI actual link section on Evidence detail", async ({ page }) => {
    await installLinkMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await expect(page.getByTestId("evidence-kpi-actual-links")).toBeVisible();
    await page.getByTestId("evidence-kpi-actual-select").selectOption(KPI_ACTUAL_ID);
    await page.getByTestId("evidence-kpi-actual-link").click();
    await expect(page.getByTestId("evidence-kpi-actual-link-list")).toContainText(
      "ACT-001",
    );
  });

  test("E. Control link refresh reloads the section", async ({ page }) => {
    const state = await installLinkMock(page);
    state.controlLinks = [controlLink()];
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await page.getByTestId("evidence-control-links-refresh").click();
    await expect(page.getByTestId("evidence-control-link-list")).toContainText(
      "CTL-001",
    );
  });

  test("F. Create from KPI asks before linking", async ({ page }) => {
    const state = await installLinkMock(page);
    await page.goto(
      `/evidence/new?returnTo=${encodeURIComponent("/kpis/approval")}&linkKpiActualId=${KPI_ACTUAL_ID}`,
    );
    await expect(page.getByTestId("evidence-create-kpi-context")).toBeVisible();
    await page.getByLabel("Title (required)").fill("KPI-linked proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await expect(page.getByTestId("evidence-link-kpi-confirm")).toBeVisible();
    await page.getByTestId("evidence-link-kpi-confirm").click();
    expect(state.linkKpiCalls).toBe(1);
  });

  test("G. Rejects unsafe returnTo values", async ({ page }) => {
    await installLinkMock(page);
    await page.goto(
      `/evidence/new?returnTo=${encodeURIComponent("//evil.example")}`,
    );
    await page.getByLabel("Title (required)").fill("Safe navigation proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await expect(page).toHaveURL(/\/evidence\/a0000000-/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/evil\.example/);
  });

  test("H. Non-DRAFT Evidence hides link pickers", async ({ page }) => {
    await installLinkMock(page, { lifecycleStatus: "SUBMITTED" });
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await expect(page.getByTestId("evidence-control-link-picker")).toHaveCount(0);
    await expect(
      page.getByTestId("evidence-control-links").getByText(
        "Links can be changed only while Evidence is DRAFT",
      ),
    ).toBeVisible();
  });

  test("I. Read-only user sees lists without pickers", async ({ page }) => {
    await installLinkMock(page, { permissions: ["evidence:read", "controls:read"] });
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await expect(page.getByTestId("evidence-control-link-picker")).toHaveCount(0);
  });

  test("J. Skip KPI link keeps DRAFT without linking", async ({ page }) => {
    const state = await installLinkMock(page);
    await page.goto(
      `/evidence/new?linkKpiActualId=${KPI_ACTUAL_ID}`,
    );
    await page.getByLabel("Title (required)").fill("Skip link proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await page.getByTestId("evidence-link-kpi-skip").click();
    expect(state.linkKpiCalls).toBe(0);
    await expect(page).toHaveURL(/\/evidence\/a0000000-/);
  });
});
