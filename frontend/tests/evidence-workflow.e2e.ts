import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * These tests drive the UI against mocked api/v1 browser routes. They are not
 * browser-to-database end-to-end tests.
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

const otherUser = {
  id: "20000000-0000-4000-8000-000000000003",
  code: "USR-003",
  name: "User 003",
};

const department = {
  id: "30000000-0000-4000-8000-000000000001",
  code: "DEP-001",
  name: "Operations",
};

const EVIDENCE_DRAFT = "a0000000-0000-4000-8000-000000000001";
const EVIDENCE_SUBMITTED = "a0000000-0000-4000-8000-000000000002";
const EVIDENCE_APPROVED = "a0000000-0000-4000-8000-000000000003";
const EVIDENCE_REJECTED = "a0000000-0000-4000-8000-000000000004";
const EVIDENCE_DRAFT_NO_FILE = "a0000000-0000-4000-8000-000000000005";

const FULL_PERMISSIONS = [
  "evidence:read",
  "evidence:write",
  "evidence:review",
  "evidence:download",
  "users:read",
  "organisation:read",
  "tenants:read",
];

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

const failure = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const pageMeta = (page: number, total: number, pageSize = 20) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

const fileSummary = (uploadedBy = currentUser) => ({
  originalFileName: "policy-proof.pdf",
  mimeType: "application/pdf",
  detectedMimeType: "application/pdf",
  byteSize: 2048,
  uploadedAt: "2026-07-10T10:00:00.000Z",
  uploadedBy,
});

const baseEvidence = (
  id: string,
  code: string,
  title: string,
  lifecycleStatus: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  code,
  title,
  description: "Sample compliance Evidence",
  lifecycleStatus,
  owner: currentUser,
  department,
  issueDate: "2026-07-01",
  expiresAt: "2027-07-01",
  supersedesEvidenceId: null,
  supersedes: null,
  hasFile: true,
  file: fileSummary(otherUser),
  submittedById: lifecycleStatus === "SUBMITTED" ? otherUser.id : null,
  submittedAt:
    lifecycleStatus === "SUBMITTED" ? "2026-07-11T09:00:00.000Z" : null,
  submittedBy: lifecycleStatus === "SUBMITTED" ? otherUser : null,
  reviewedById: null,
  reviewedAt: null,
  reviewedBy: null,
  archivedAt: null,
  createdById: otherUser.id,
  createdBy: otherUser,
  updatedById: currentUser.id,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  latestReviewDecision: null,
  ...overrides,
});

type Mode =
  | "default"
  | "empty"
  | "error"
  | "upload-fail"
  | "upload-delay"
  | "self-review"
  | "stale-review"
  | "read-only";

interface MockOptions {
  permissions?: string[];
  mode?: Mode;
}

interface MockState {
  records: Map<string, ReturnType<typeof baseEvidence>>;
  createdCount: number;
  uploadAttempts: number;
  listUrls: string[];
  uploadFailsRemaining: number;
}

async function installEvidenceMock(page: Page, options: MockOptions = {}) {
  const permissions = options.permissions ?? FULL_PERMISSIONS;
  const mode = options.mode ?? "default";
  const has = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);

  const state: MockState = {
    records: new Map(),
    createdCount: 0,
    uploadAttempts: 0,
    listUrls: [],
    uploadFailsRemaining: mode === "upload-fail" ? 1 : 0,
  };

  state.records.set(
    EVIDENCE_DRAFT,
    baseEvidence(EVIDENCE_DRAFT, "EVD-001", "Draft Evidence", "DRAFT"),
  );
  state.records.set(
    EVIDENCE_SUBMITTED,
    baseEvidence(
      EVIDENCE_SUBMITTED,
      "EVD-002",
      "Pending Evidence",
      "SUBMITTED",
    ),
  );
  state.records.set(
    EVIDENCE_APPROVED,
    baseEvidence(EVIDENCE_APPROVED, "EVD-003", "Approved Evidence", "APPROVED"),
  );
  state.records.set(
    EVIDENCE_REJECTED,
    baseEvidence(EVIDENCE_REJECTED, "EVD-004", "Rejected Evidence", "REJECTED", {
      latestReviewDecision: {
        id: "b0000000-0000-4000-8000-000000000001",
        decision: "REJECTED",
        reason: "Missing signature page.",
        decidedAt: "2026-07-12T10:00:00.000Z",
        actedBy: currentUser,
      },
    }),
  );
  state.records.set(
    EVIDENCE_DRAFT_NO_FILE,
    baseEvidence(
      EVIDENCE_DRAFT_NO_FILE,
      "EVD-005",
      "Draft without file",
      "DRAFT",
      { hasFile: false, file: null },
    ),
  );

  const identity = () => ({
    id: currentUser.id,
    code: currentUser.code,
    name: currentUser.name,
    email: "admin001@example.test",
    phone: null,
    status: "ACTIVE",
    lastLogin: null,
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

  const filterList = (url: URL) => {
    let rows = [...state.records.values()];
    const q = url.searchParams.get("q")?.toLowerCase();
    const lifecycleStatus = url.searchParams.get("lifecycleStatus");
    const expiresBefore = url.searchParams.get("expiresBefore");
    const expiresAfter = url.searchParams.get("expiresAfter");
    if (q) {
      rows = rows.filter(
        (row) =>
          row.code.toLowerCase().includes(q) ||
          row.title.toLowerCase().includes(q),
      );
    }
    if (lifecycleStatus) {
      rows = rows.filter((row) => row.lifecycleStatus === lifecycleStatus);
    }
    if (expiresBefore) {
      rows = rows.filter(
        (row) => row.expiresAt && row.expiresAt <= expiresBefore,
      );
    }
    if (expiresAfter) {
      rows = rows.filter(
        (row) => row.expiresAt && row.expiresAt >= expiresAfter,
      );
    }
    return rows;
  };

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
      return json(
        route,
        200,
        success({ accessToken: "mock-access-token", user: identity() }),
      );
    }

    if (path === "/api/v1/tenants") {
      return json(route, 200, success([company]));
    }

    if (path === "/api/v1/users") {
      return json(route, 200, success([currentUser, otherUser], pageMeta(1, 2)));
    }

    if (path === "/api/v1/organisation/departments") {
      return json(route, 200, success([department], pageMeta(1, 1)));
    }

    if (path === "/api/v1/evidence/review-queue" && method === "GET") {
      if (!has("evidence:review")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      let rows = [...state.records.values()].filter(
        (row) => row.lifecycleStatus === "SUBMITTED",
      );
      const q = url.searchParams.get("q")?.toLowerCase();
      if (q) {
        rows = rows.filter(
          (row) =>
            row.code.toLowerCase().includes(q) ||
            row.title.toLowerCase().includes(q),
        );
      }
      return json(route, 200, success(rows, pageMeta(1, rows.length)));
    }

    if (path === "/api/v1/evidence" && method === "GET") {
      state.listUrls.push(request.url());
      if (!has("evidence:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (mode === "error") {
        return json(route, 500, failure("INTERNAL_ERROR", "Synthetic failure"));
      }
      const rows = mode === "empty" ? [] : filterList(url);
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      return json(route, 200, success(rows, pageMeta(pageNumber, rows.length)));
    }

    if (path === "/api/v1/evidence" && method === "POST") {
      if (!has("evidence:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      state.createdCount += 1;
      const body = request.postDataJSON() as { title: string };
      const id = `a0000000-0000-4000-8000-${String(state.createdCount).padStart(12, "0")}`;
      const created = baseEvidence(
        id,
        `EVD-NEW-${state.createdCount}`,
        body.title,
        "DRAFT",
        {
          hasFile: false,
          file: null,
          createdById: currentUser.id,
          createdBy: currentUser,
        },
      );
      state.records.set(id, created);
      return json(route, 201, success(created));
    }

    const detailMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)$/);
    if (detailMatch && method === "GET") {
      if (!has("evidence:read")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const record = state.records.get(detailMatch[1]!);
      if (!record) {
        return json(route, 404, failure("EVIDENCE_NOT_FOUND", "Evidence not found"));
      }
      return json(route, 200, success(record));
    }

    if (detailMatch && method === "PATCH") {
      if (!has("evidence:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const record = state.records.get(detailMatch[1]!);
      if (!record) {
        return json(route, 404, failure("EVIDENCE_NOT_FOUND", "Evidence not found"));
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const updated = { ...record, ...body, updatedAt: new Date().toISOString() };
      state.records.set(detailMatch[1]!, updated);
      return json(route, 200, success(updated));
    }

    const fileMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/file$/);
    if (fileMatch && method === "POST") {
      state.uploadAttempts += 1;
      if (!has("evidence:write")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      if (state.uploadFailsRemaining > 0) {
        state.uploadFailsRemaining -= 1;
        return json(
          route,
          500,
          failure("EVIDENCE_STORAGE_FAILED", "The file could not be stored"),
        );
      }
      if (mode === "upload-delay") {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 800));
      }
      const record = state.records.get(fileMatch[1]!);
      if (!record) {
        return json(route, 404, failure("EVIDENCE_NOT_FOUND", "Evidence not found"));
      }
      const updated = {
        ...record,
        hasFile: true,
        file: fileSummary(currentUser),
      };
      state.records.set(fileMatch[1]!, updated);
      return json(route, 200, success(updated));
    }

    if (fileMatch && method === "GET") {
      if (!has("evidence:read") || !has("evidence:download")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="policy-proof.pdf"',
        },
        body: Buffer.from("%PDF-1.4 mock evidence file"),
      });
    }

    const submitMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/submit$/);
    if (submitMatch && method === "POST") {
      const record = state.records.get(submitMatch[1]!);
      if (!record?.hasFile) {
        return json(
          route,
          409,
          failure(
            "EVIDENCE_FILE_REQUIRED",
            "Evidence cannot be submitted until a file has been uploaded",
          ),
        );
      }
      const updated = {
        ...record,
        lifecycleStatus: "SUBMITTED",
        submittedById: currentUser.id,
        submittedBy: currentUser,
        submittedAt: new Date().toISOString(),
      };
      state.records.set(submitMatch[1]!, updated);
      return json(route, 200, success(updated));
    }

    const approveMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/approve$/);
    if (approveMatch && method === "POST") {
      if (!has("evidence:review")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const record = state.records.get(approveMatch[1]!);
      if (
        record?.submittedById === currentUser.id ||
        record?.createdById === currentUser.id ||
        record?.file?.uploadedBy?.id === currentUser.id
      ) {
        return json(
          route,
          403,
          failure(
            "EVIDENCE_SELF_REVIEW_FORBIDDEN",
            "Evidence submitter cannot review their own Evidence",
          ),
        );
      }
      if (mode === "stale-review") {
        return json(
          route,
          409,
          failure(
            "EVIDENCE_INVALID_STATE",
            "Only SUBMITTED Evidence can be reviewed",
          ),
        );
      }
      const updated = {
        ...record!,
        lifecycleStatus: "APPROVED",
        reviewedById: currentUser.id,
        reviewedBy: currentUser,
        reviewedAt: new Date().toISOString(),
      };
      state.records.set(approveMatch[1]!, updated);
      return json(route, 200, success(updated));
    }

    const rejectMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/reject$/);
    if (rejectMatch && method === "POST") {
      if (!has("evidence:review")) {
        return json(route, 403, failure("FORBIDDEN", "Permission denied"));
      }
      const body = request.postDataJSON() as { reason: string };
      if (!body.reason?.trim()) {
        return json(
          route,
          400,
          failure("EVIDENCE_REJECT_REASON_REQUIRED", "Rejection requires a reason"),
        );
      }
      const record = state.records.get(rejectMatch[1]!);
      const updated = {
        ...record!,
        lifecycleStatus: "REJECTED",
        reviewedById: currentUser.id,
        reviewedBy: currentUser,
        reviewedAt: new Date().toISOString(),
        latestReviewDecision: {
          id: "b0000000-0000-4000-8000-000000000099",
          decision: "REJECTED",
          reason: body.reason,
          decidedAt: new Date().toISOString(),
          actedBy: currentUser,
        },
      };
      state.records.set(rejectMatch[1]!, updated);
      return json(route, 200, success(updated));
    }

    const decisionsMatch = path.match(
      /^\/api\/v1\/evidence\/([^/]+)\/review-decisions$/,
    );
    if (decisionsMatch && method === "GET") {
      const record = state.records.get(decisionsMatch[1]!);
      const decisions = record?.latestReviewDecision
        ? [record.latestReviewDecision]
        : [];
      return json(route, 200, success(decisions, pageMeta(1, decisions.length)));
    }

    const auditMatch = path.match(/^\/api\/v1\/evidence\/([^/]+)\/audit-events$/);
    if (auditMatch && method === "GET") {
      return json(
        route,
        200,
        success(
          [
            {
              id: "c0000000-0000-4000-8000-000000000001",
              action: "EVIDENCE_CREATED",
              entityType: "Evidence",
              entityId: auditMatch[1],
              metadata: { code: "EVD-001", lifecycleStatus: "DRAFT" },
              createdAt: "2026-07-01T00:00:00.000Z",
              userId: currentUser.id,
            },
          ],
          pageMeta(1, 1),
        ),
      );
    }

    return json(route, 200, success([], pageMeta(1, 0)));
  });

  return state;
}

const gotoLibrary = async (page: Page) => {
  await page.goto("/evidence");
  await expect(
    page.getByRole("heading", { level: 1, name: /Evidence Library/ }),
  ).toBeVisible();
};

const shown = (locator: Locator) => locator.filter({ visible: true });

const fixturePath = resolve(
  new URL("./fixtures/sample-evidence.txt", import.meta.url).pathname,
);

test.describe("Evidence workflow (Slice 5.6A)", () => {
  test("1. Evidence navigation is LIVE", async ({ page }) => {
    await installEvidenceMock(page);
    await gotoLibrary(page);
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(shown(page.getByText("EVD-001")).first()).toBeVisible();
  });

  test("2. Evidence Library loading", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence");
    await expect(shown(page.getByText("EVD-001")).first()).toBeVisible();
  });

  test("3. Server search query", async ({ page }) => {
    const state = await installEvidenceMock(page);
    await gotoLibrary(page);
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/v1/evidence") &&
      response.url().includes("q=Approved"),
    );
    await page.getByLabel("Search Evidence by code or title").fill("Approved");
    await responsePromise;
    await expect(page).toHaveURL(/q=Approved/);
    expect(state.listUrls.some((entry) => entry.includes("q=Approved"))).toBeTruthy();
  });

  test("4. Lifecycle filter", async ({ page }) => {
    const state = await installEvidenceMock(page);
    await gotoLibrary(page);
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("lifecycleStatus=APPROVED"),
    );
    await page.getByLabel("Filter by lifecycle status").selectOption("APPROVED");
    await expect(page).toHaveURL(/lifecycleStatus=APPROVED/);
    await responsePromise;
    expect(
      state.listUrls.some((entry) => entry.includes("lifecycleStatus=APPROVED")),
    ).toBeTruthy();
  });

  test("5. Expiry filter", async ({ page }) => {
    const state = await installEvidenceMock(page);
    await gotoLibrary(page);
    await page.getByLabel("Expires on or after").fill("2027-01-01");
    await page.waitForResponse((response) =>
      response.url().includes("expiresAfter=2027-01-01"),
    );
    expect(
      state.listUrls.some((entry) => entry.includes("expiresAfter=2027-01-01")),
    ).toBeTruthy();
  });

  test("6. Pagination controls render", async ({ page }) => {
    await installEvidenceMock(page);
    await gotoLibrary(page);
    await expect(page.getByTestId("evidence-library-cards")).toContainText(
      "Page 1 of",
    );
  });

  test("7. URL query synchronization", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence?lifecycleStatus=REJECTED&q=EVD");
    await expect(page.getByLabel("Search Evidence by code or title")).toHaveValue(
      "EVD",
    );
    await expect(page.getByLabel("Filter by lifecycle status")).toHaveValue(
      "REJECTED",
    );
  });

  test("8. Permission-aware Library/Create/Review actions", async ({ page }) => {
    await installEvidenceMock(page, {
      permissions: ["evidence:read"],
    });
    await gotoLibrary(page);
    await expect(page.getByTestId("evidence-create-open")).toHaveCount(0);
    await expect(page.getByTestId("evidence-review-queue-link")).toHaveCount(0);
  });

  test("9–10. Create metadata and successful upload", async ({ page }) => {
    const state = await installEvidenceMock(page);
    await page.goto("/evidence/new");
    await page.getByLabel("Title (required)").fill("New compliance proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await expect(page).toHaveURL(/\/evidence\/a0000000-/);
    expect(state.createdCount).toBe(1);
    expect(state.uploadAttempts).toBe(1);
  });

  test("11. Upload progress UI", async ({ page }) => {
    await installEvidenceMock(page, { mode: "upload-delay" });
    await page.goto("/evidence/new");
    await page.getByLabel("Title (required)").fill("Slow upload proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await expect(page.getByTestId("evidence-upload-status")).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("12. Upload cancellation", async ({ page }) => {
    await installEvidenceMock(page, { mode: "upload-delay" });
    await page.goto("/evidence/new");
    await page.getByLabel("Title (required)").fill("Cancel upload proof");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await page.getByTestId("evidence-upload-cancel").click();
    await expect(page.getByTestId("evidence-upload-recovery")).toBeVisible();
  });

  test("13–14. Upload failure preserves one DRAFT and retry does not create another", async ({
    page,
  }) => {
    const state = await installEvidenceMock(page, { mode: "upload-fail" });
    await page.goto("/evidence/new");
    await page.getByLabel("Title (required)").fill("Recoverable draft");
    await page.getByLabel("Evidence file (required)").setInputFiles({
      name: "sample-evidence.txt",
      mimeType: "text/plain",
      buffer: readFileSync(fixturePath),
    });
    await page.getByTestId("evidence-create-save").click();
    await expect(page.getByTestId("evidence-upload-recovery")).toBeVisible();
    expect(state.createdCount).toBe(1);

    await page.getByTestId("evidence-retry-upload").click();
    await expect(page).toHaveURL(/\/evidence\/a0000000-/);
    expect(state.createdCount).toBe(1);
    expect(state.uploadAttempts).toBe(2);
  });

  test("15. Submit blocked before file exists", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT_NO_FILE}`);
    await expect(page.getByTestId("evidence-submit-open")).toHaveCount(0);
    await expect(page.getByTestId("evidence-submit-blocked")).toBeVisible();
  });

  test("16. Submit succeeds after file exists", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    await page.getByTestId("evidence-submit-open").click();
    await page.getByTestId("evidence-submit-confirm").click();
    await expect(page.getByTestId("evidence-lifecycle-section")).toContainText(
      "Pending review",
    );
  });

  test("17. Review Queue loads", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/review");
    await expect(
      page.getByRole("heading", { level: 1, name: /Evidence Review/ }),
    ).toBeVisible();
    await expect(shown(page.getByText("EVD-002")).first()).toBeVisible();
  });

  test("18. Approve succeeds", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/review");
    await shown(
      page.getByTestId(`evidence-queue-approve-${EVIDENCE_SUBMITTED}`),
    ).click();
    await page.getByTestId("evidence-review-approve-confirm").click();
    await expect(page.getByText("Evidence approved")).toBeVisible();
  });

  test("19. Reject requires a reason", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/review");
    await shown(
      page.getByTestId(`evidence-queue-reject-${EVIDENCE_SUBMITTED}`),
    ).click();
    await page.getByTestId("evidence-review-reject-confirm").click();
    await expect(page.getByTestId("evidence-reject-reason")).toBeVisible();
  });

  test("20. Self-review error", async ({ page }) => {
    const state = await installEvidenceMock(page);
    const selfId = "a0000000-0000-4000-8000-000000000099";
    state.records.set(
      selfId,
      baseEvidence(selfId, "EVD-SELF", "Self submitted", "SUBMITTED", {
        createdById: currentUser.id,
        createdBy: currentUser,
        submittedBy: currentUser,
        submittedById: currentUser.id,
      }),
    );
    await page.goto(`/evidence/${selfId}`);
    await page.getByTestId("evidence-approve-open").click();
    await expect(page.getByTestId("evidence-self-review-hint")).toBeVisible();
    await page.getByTestId("evidence-review-approve-confirm").click();
    await expect(page.getByTestId("evidence-review-error")).toContainText(
      /cannot review/i,
    );
  });

  test("21. Stale lifecycle conflict refresh", async ({ page }) => {
    await installEvidenceMock(page, { mode: "stale-review" });
    await page.goto("/evidence/review");
    await shown(
      page.getByTestId(`evidence-queue-approve-${EVIDENCE_SUBMITTED}`),
    ).click();
    await page.getByTestId("evidence-review-approve-confirm").click();
    await expect(page.getByTestId("evidence-review-queue-error")).toBeVisible();
  });

  test("22–23. Authenticated download without token in URL", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto(`/evidence/${EVIDENCE_APPROVED}`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("evidence-download").click();
    const download = await downloadPromise;
    expect(download.url()).not.toContain("token");
    expect(await download.suggestedFilename()).toContain("policy-proof");
    await expect(page.locator("body")).not.toContainText("storageKey");
  });

  test("24. REJECTED offers superseding workflow, not resubmit", async ({
    page,
  }) => {
    await installEvidenceMock(page);
    await page.goto(`/evidence/${EVIDENCE_REJECTED}`);
    await expect(page.getByTestId("evidence-overview")).toBeVisible();
    await expect(page.getByTestId("evidence-supersedes-nav")).toBeVisible();
    await expect(page.getByTestId("evidence-submit-open")).toHaveCount(0);
    await expect(page.getByText(/cannot be resubmitted/i)).toBeVisible();
  });

  test("25. /evidence/review renders Review Queue rather than Detail", async ({
    page,
  }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/review");
    await expect(
      page.getByRole("heading", { level: 1, name: /Evidence Review/ }),
    ).toBeVisible();
    await expect(page.getByTestId("evidence-detail-loading")).toHaveCount(0);
  });

  test("26. Compatibility redirects work", async ({ page }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/register");
    await expect(page).toHaveURL("/evidence/new");
    await page.goto("/evidence/upload");
    await expect(page).toHaveURL("/evidence/new");
  });

  // Approved and Rejected are now navigation entries in their own right: the
  // Evidence Library with one lifecycle status pinned, rather than a redirect
  // that dropped the user on a page whose heading said something else.
  test("26b. Approved and Rejected Evidence pin their lifecycle status", async ({
    page,
  }) => {
    await installEvidenceMock(page);
    await page.goto("/evidence/approved");
    await expect(page).toHaveURL("/evidence/approved");
    await expect(
      page.getByRole("heading", { level: 1, name: /Approved Evidence/ }),
    ).toBeVisible();
    await expect(page.getByTestId("evidence-fixed-status")).toContainText(
      /Approved/i,
    );
    await page.goto("/evidence/rejected");
    await expect(page).toHaveURL("/evidence/rejected");
    await expect(
      page.getByRole("heading", { level: 1, name: /Rejected Evidence/ }),
    ).toBeVisible();
    await expect(page.getByTestId("evidence-fixed-status")).toContainText(
      /Rejected/i,
    );
  });

  test("27. Mobile cards render", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await installEvidenceMock(page);
    await gotoLibrary(page);
    await expect(page.getByTestId("evidence-library-cards")).toBeVisible();
  });

  test("28. No material horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installEvidenceMock(page);
    await gotoLibrary(page);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 2,
    );
    expect(overflow).toBeTruthy();
  });

  test("29. No obsolete Evidence development banner", async ({ page }) => {
    await installEvidenceMock(page);
    await gotoLibrary(page);
    await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: /Evidence Library/ }),
    ).toBeVisible();
  });

  test("30. No unexpected console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installEvidenceMock(page);
    await gotoLibrary(page);
    await page.goto("/evidence/new");
    await page.goto("/evidence/review");
    await page.goto(`/evidence/${EVIDENCE_DRAFT}`);
    expect(errors).toEqual([]);
  });
});
