import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};

const GAP_ID = "40000000-0000-4000-8000-000000000001";

const success = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

type MockComment = {
  id: string;
  entityType: string;
  entityId: string;
  body: string;
  createdAt: string;
  author: { id: string; code: string; name: string } | null;
};

const seedComments = (): MockComment[] => [
  {
    id: "50000000-0000-4000-8000-00000000000a",
    entityType: "GAP",
    entityId: GAP_ID,
    body: "Access review evidence was requested from IT on 3 August.",
    createdAt: "2026-08-03T09:15:00.000Z",
    author: { id: "u1", code: "USR-002", name: "User 002" },
  },
  {
    id: "50000000-0000-4000-8000-00000000000b",
    entityType: "GAP",
    entityId: GAP_ID,
    body: "Author left the Company; the note stays in the trail.",
    createdAt: "2026-08-04T11:00:00.000Z",
    // A withdrawn account must not erase the comment it left behind.
    author: null,
  },
];

const gap = {
  id: GAP_ID,
  code: "GAP-001",
  title: "Privileged access review is not evidenced",
  description: "Quarterly privileged access review has no record.",
  severity: "MAJOR",
  status: "OPEN",
  source: "Internal Audit",
  sourceOwnerRef: null,
  dueDate: "2026-12-31",
  overdue: false,
  owner: null,
  framework: null,
  frameworkRule: null,
  control: null,
  checkpoint: null,
  capas: [],
  evidence: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/**
 * The API decides whether a caller may comment, so the mock reproduces that:
 * a POST from a role without `gaps:write` is refused with 403 rather than the
 * browser being trusted to hide the control.
 */
async function installMock(page: Page, options: { permissions: string[] }) {
  let comments = seedComments();
  const posted: string[] = [];
  const canWrite = options.permissions.includes("gaps:write");

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(success(data)),
      });

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return json({
        accessToken: "token",
        user: {
          id: "20000000-0000-4000-8000-000000000001",
          code: "USR-001",
          name: "User 001",
          email: "admin001@example.test",
          phone: null,
          status: "ACTIVE",
          lastLogin: null,
          permissions: options.permissions,
          activeCompany: company,
          companies: [company],
        },
      });
    }
    if (path === "/api/v1/auth/logout") return json({ loggedOut: true });
    if (path === "/api/v1/organisation/departments") return json([]);
    if (path === `/api/v1/gaps/${GAP_ID}` && method === "GET") return json(gap);

    const commentsPath = `/api/v1/records/GAP/${GAP_ID}/comments`;
    if (path === commentsPath && method === "GET") return json(comments);
    if (path === commentsPath && method === "POST") {
      if (!canWrite) {
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "Forbidden" },
          }),
        });
      }
      const { body } = request.postDataJSON() as { body: string };
      posted.push(body);
      const added: MockComment = {
        id: `50000000-0000-4000-8000-0000000000${10 + posted.length}`,
        entityType: "GAP",
        entityId: GAP_ID,
        body,
        createdAt: new Date().toISOString(),
        author: { id: "u0", code: "USR-001", name: "User 001" },
      };
      comments = [...comments, added];
      return json(added);
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

  return { posted: () => posted };
}

const writer = [
  "gaps:read",
  "gaps:write",
  "capa:write",
  "users:read",
  "organisation:read",
];
const reader = ["gaps:read", "users:read", "organisation:read"];

test("shows the conversation oldest first and names a withdrawn author honestly", async ({
  page,
}) => {
  await installMock(page, { permissions: writer });
  await page.goto(`/compliance/gaps/${GAP_ID}`);

  const panel = page.getByTestId("record-comments");
  await expect(panel).toBeVisible();
  const items = panel.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("requested from IT on 3 August");
  await expect(items.nth(1)).toContainText("Withdrawn account");
  // The panel must state the append-only rule rather than implying an edit.
  await expect(panel).toContainText("cannot be edited or deleted");
});

test("adds a comment and re-reads the thread from the API", async ({
  page,
}) => {
  const mock = await installMock(page, { permissions: writer });
  await page.goto(`/compliance/gaps/${GAP_ID}`);

  await page
    .getByTestId("record-comment-input")
    .fill("Evidence attached, ready for review.");
  await page.getByTestId("record-comment-submit").click();

  await expect(
    page.getByTestId("record-comments").getByRole("listitem"),
  ).toHaveCount(3);
  expect(mock.posted()).toEqual(["Evidence attached, ready for review."]);
  // The box clears so the same note cannot be posted twice by accident.
  await expect(page.getByTestId("record-comment-input")).toHaveValue("");
});

test("keeps the submit control inert until there is something to say", async ({
  page,
}) => {
  await installMock(page, { permissions: writer });
  await page.goto(`/compliance/gaps/${GAP_ID}`);

  const submit = page.getByTestId("record-comment-submit");
  await expect(submit).toBeDisabled();
  await page.getByTestId("record-comment-input").fill("   ");
  await expect(submit).toBeDisabled();
  await page.getByTestId("record-comment-input").fill("Real note");
  await expect(submit).toBeEnabled();
});

test("offers no comment box to a role that cannot write", async ({ page }) => {
  await installMock(page, { permissions: reader });
  await page.goto(`/compliance/gaps/${GAP_ID}`);

  const panel = page.getByTestId("record-comments");
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("record-comments-readonly")).toBeVisible();
  await expect(page.getByTestId("record-comment-input")).toHaveCount(0);
  await expect(page.getByTestId("record-comment-submit")).toHaveCount(0);
});

test("shows no edit or delete affordance on any comment", async ({ page }) => {
  await installMock(page, { permissions: writer });
  await page.goto(`/compliance/gaps/${GAP_ID}`);

  const panel = page.getByTestId("record-comments");
  await expect(panel.getByRole("button", { name: /edit/i })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /delete/i })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /remove/i })).toHaveCount(0);
});
