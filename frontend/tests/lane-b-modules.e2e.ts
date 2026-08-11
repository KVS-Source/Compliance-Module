/** Mocked browser acceptance for saved views, in-app notifications and Tasks. */
import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};
const userId = "20000000-0000-4000-8000-000000000001";
const gapId = "91000000-0000-4000-8000-000000000001";
const notificationId = "92000000-0000-4000-8000-000000000001";
const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});
const meta = (total: number) => ({ page: 1, pageSize: 20, total, totalPages: total ? 1 : 0 });

async function installMocks(page: Page) {
  let views: Array<Record<string, unknown>> = [];
  let tasks: Array<Record<string, unknown>> = [];
  let notificationRead = false;
  const writes: string[] = [];

  const gap = {
    id: gapId,
    code: "GAP-001",
    title: "Overdue critical gap",
    description: null,
    severity: "CRITICAL",
    status: "OPEN",
    source: null,
    clauseRef: null,
    recommendedAction: null,
    owner: { id: userId, code: "USR-001", name: "User 001" },
    sourceOwnerRef: null,
    department: null,
    framework: null,
    frameworkRule: null,
    control: null,
    checkpoint: null,
    identifiedOn: "2026-01-01",
    dueDate: "2026-01-31",
    overdue: true,
    closedAt: null,
    closureNote: null,
    needsReview: false,
    reviewReason: null,
    capas: [],
    evidence: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const fulfill = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/v1/auth/refresh") {
      return fulfill(200, success({
        accessToken: "token",
        user: {
          id: userId,
          code: "USR-001",
          name: "User 001",
          email: "user001@example.test",
          phone: null,
          status: "ACTIVE",
          lastLogin: null,
          permissions: [
            "dashboard:read",
            "gaps:read",
            "registers:read",
            "registers:write",
            "users:read",
          ],
          activeCompany: company,
          companies: [company],
        },
      }));
    }
    if (path === "/api/v1/saved-views" && method === "GET") {
      const registerKey = url.searchParams.get("registerKey");
      return fulfill(200, success(views.filter((view) => view.registerKey === registerKey)));
    }
    if (path === "/api/v1/saved-views" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: "93000000-0000-4000-8000-000000000001",
        ...body,
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
      };
      views = [created];
      writes.push("saved-view-created");
      return fulfill(201, success(created));
    }
    if (path.startsWith("/api/v1/saved-views/") && method === "DELETE") {
      views = [];
      return fulfill(200, success({ deleted: true, id: path.split("/").at(-1) }));
    }
    if (path === "/api/v1/notifications" && method === "GET") {
      return fulfill(200, success({
        unreadCount: notificationRead ? 0 : 1,
        items: [{
          id: notificationId,
          kind: "OVERDUE_GAP",
          title: "Gap is overdue",
          message: "GAP-001 · Overdue critical gap",
          targetPath: `/compliance/gaps/${gapId}`,
          sourceType: "GAP",
          sourceId: gapId,
          read: notificationRead,
          readAt: notificationRead ? "2026-08-10T00:00:00.000Z" : null,
          createdAt: "2026-08-10T00:00:00.000Z",
        }],
      }, meta(1)));
    }
    if (path === `/api/v1/notifications/${notificationId}/read` && method === "PATCH") {
      notificationRead = true;
      writes.push("notification-read");
      return fulfill(200, success({ id: notificationId, read: true }));
    }
    if (path === "/api/v1/gaps" && method === "GET") {
      return fulfill(200, success([gap], meta(1)));
    }
    if (path === `/api/v1/gaps/${gapId}` && method === "GET") {
      return fulfill(200, success(gap));
    }
    if (/\/api\/v1\/records\/GAP\/[^/]+\/comments$/.test(path)) {
      return fulfill(200, success([]));
    }
    if (path === "/api/v1/users" && method === "GET") {
      return fulfill(200, success([{ id: userId, code: "USR-001", name: "User 001", email: "user001@example.test", phone: null, department: null, roles: [], status: "ACTIVE", lastLogin: null }]));
    }
    if (path === "/api/v1/tasks" && method === "GET") {
      return fulfill(200, success(tasks, meta(tasks.length)));
    }
    if (path === "/api/v1/tasks" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const task = {
        id: "94000000-0000-4000-8000-000000000001",
        title: body.title,
        description: body.description,
        status: body.status,
        dueDate: body.dueDate,
        overdue: false,
        owner: { id: userId, code: "USR-001", name: "User 001" },
        linked: { type: "GAP", id: gapId, code: "GAP-001", title: "Overdue critical gap" },
        createdBy: { id: userId, code: "USR-001", name: "User 001" },
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
      };
      tasks = [task];
      writes.push("task-created");
      return fulfill(201, success(task));
    }
    return fulfill(404, { success: false, error: { code: "NOT_FOUND", message: "Not mocked" } });
  });

  return { writes };
}

test("saves and reapplies exact Gap filters and sort after reload", async ({ page }) => {
  const { writes } = await installMocks(page);
  await page.goto(
    "/compliance/gaps?severity=CRITICAL&overdue=true&orderBy=dueDate&order=asc",
  );
  await page.getByRole("button", { name: "Save current view" }).click();
  await page.getByLabel("View name").fill("Overdue critical gaps");
  await page.getByRole("button", { name: "Save view" }).click();
  expect(writes).toContain("saved-view-created");

  await page.goto("/compliance/gaps");
  await page.getByLabel("Saved view", { exact: true }).selectOption({ label: "Overdue critical gaps" });
  await expect(page.getByLabel("Gap severity")).toHaveValue("CRITICAL");
  await expect(page.getByLabel("Overdue only")).toBeChecked();
  await expect(page).toHaveURL(/severity=CRITICAL/);
  await expect(page).toHaveURL(/overdue=true/);
  await expect(page).toHaveURL(/orderBy=dueDate/);
  await expect(page.locator('th[aria-sort="ascending"]').first()).toHaveCount(1);
});

test("bell renders durable in-app notifications and marks one read", async ({ page }) => {
  const { writes } = await installMocks(page);
  await page.goto("/dashboard");
  await expect(page.locator(".top-notifications .counter")).toHaveText("1");
  await page.getByRole("button", { name: "Notifications" }).click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toContainText("Gap is overdue");
  await expect(dialog).toContainText("In-app only · email delivery is not configured.");
  await dialog.getByRole("button", { name: /Gap is overdue/ }).click();
  await expect(page).toHaveURL(new RegExp(`/compliance/gaps/${gapId}$`));
  expect(writes).toContain("notification-read");
});

test("creates a real linked task from the Tasks register", async ({ page }) => {
  const { writes } = await installMocks(page);
  await page.goto("/tasks");
  await expect(page.locator(".page-head h1")).toContainText("Tasks");
  await page.getByRole("button", { name: "Create task" }).click();
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel("Title").fill("Review critical gap remediation");
  await dialog.getByLabel("Due date").fill("2026-12-31");
  await dialog.getByLabel("Owner").selectOption(userId);
  await dialog.getByLabel("Linked record id").fill(gapId);
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByTestId("tasks-register-table")).toContainText("Review critical gap remediation");
  await expect(page.getByTestId("tasks-register-table")).toContainText("GAP-001");
  expect(writes).toContain("task-created");
});
