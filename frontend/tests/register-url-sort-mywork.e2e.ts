/**
 * Mocked browser coverage for URL-synced register filters/sort and My work.
 * These tests verify the React workflow against HTTP envelopes.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "DEMO-UAT",
  name: "Demo UAT",
};
const userId = "20000000-0000-4000-8000-000000000001";
const otherUserId = "20000000-0000-4000-8000-000000000099";

const permissions = [
  "dashboard:read",
  "gaps:read",
  "gaps:write",
  "capa:read",
  "risk:read",
  "evidence:read",
  "evidence:review",
  "kpis:read",
  "exports:read",
];

const gapOwned = {
  id: "91000000-0000-4000-8000-000000000001",
  code: "GAP-001",
  title: "My open gap",
  description: "Owned by the signed-in user",
  severity: "MAJOR",
  status: "OPEN",
  source: null,
  clauseRef: null,
  recommendedAction: null,
  owner: { id: userId, code: "USR-001", name: "UAT Admin" },
  sourceOwnerRef: null,
  department: null,
  framework: null,
  frameworkRule: null,
  control: null,
  checkpoint: null,
  identifiedOn: "2026-07-01",
  dueDate: "2026-07-20",
  overdue: true,
  closedAt: null,
  closureNote: null,
  needsReview: false,
  reviewReason: null,
  capas: [],
  evidence: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const gapOther = {
  ...gapOwned,
  id: "91000000-0000-4000-8000-000000000002",
  code: "GAP-002",
  title: "Someone else's gap",
  owner: { id: otherUserId, code: "USR-099", name: "Other User" },
  overdue: false,
  dueDate: "2026-09-01",
};

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

async function installMocks(page: Page) {
  const gapCalls: string[] = [];
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            accessToken: "token",
            user: {
              id: userId,
              code: "USR-001",
              name: "UAT Admin",
              email: "uat@example.test",
              phone: null,
              status: "ACTIVE",
              lastLogin: null,
              permissions,
              activeCompany: company,
              companies: [company],
            },
          }),
        ),
      });
    }

    if (path === "/api/v1/gaps" && method === "GET") {
      gapCalls.push(url.search);
      const ownerId = url.searchParams.get("ownerId");
      const status = url.searchParams.get("status");
      let rows = [gapOwned, gapOther];
      if (ownerId === userId) rows = [gapOwned];
      if (status === "OPEN") rows = rows.filter((row) => row.status === "OPEN");
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

    if (path === "/api/v1/capas" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 50, total: 0, totalPages: 0 }),
        ),
      });
    }
    if (path === "/api/v1/risks" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 50, total: 0, totalPages: 0 }),
        ),
      });
    }
    if (path === "/api/v1/evidence/review-queue" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 50, total: 0, totalPages: 0 }),
        ),
      });
    }
    if (path === "/api/v1/kpi-actuals" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success([], { page: 1, pageSize: 50, total: 0, totalPages: 0 }),
        ),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success([])),
    });
  });
  return gapCalls;
}

test("gap register filter and sort survive reload via the URL", async ({
  page,
}) => {
  const gapCalls = await installMocks(page);
  // Seed the filter+sort in the URL the way a shared link would, then confirm
  // the page restores that view and re-requests the server with those params.
  await page.goto("/compliance/gaps?status=OPEN&orderBy=dueDate&order=asc");
  await expect(page.getByRole("heading", { name: "Gap Register" })).toBeVisible();
  await expect(page.getByTestId("gap-register-table")).toContainText(
    "My open gap",
  );
  await expect(page.getByLabel("Gap status")).toHaveValue("OPEN");
  // Column headers sit in the desktop table (still present, may be CSS-hidden).
  await expect(page.locator('th[aria-sort="ascending"]').first()).toHaveCount(1);

  // Reload the same URL and confirm the view is reproduced.
  await page.goto("/compliance/gaps?status=OPEN&orderBy=dueDate&order=asc");
  await expect(page.getByRole("heading", { name: "Gap Register" })).toBeVisible();
  await expect(page.getByLabel("Gap status")).toHaveValue("OPEN");
  await expect(page.locator('th[aria-sort="ascending"]').first()).toHaveCount(1);
  await expect
    .poll(() =>
      gapCalls.some(
        (call) =>
          call.includes("status=OPEN") && call.includes("orderBy=dueDate"),
      ),
    )
    .toBe(true);
});

test("my work shows only the signed-in user's open gaps", async ({ page }) => {
  await installMocks(page);
  await page.goto("/my-work");
  await expect(page.getByTestId("my-work-grid")).toBeVisible();
  await expect(page.getByTestId("my-work-gaps")).toContainText("My open gap");
  await expect(page.getByTestId("my-work-gaps")).not.toContainText(
    "Someone else's gap",
  );
});
