import { expect, test, type Page, type Route } from "@playwright/test";

const companies = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    code: "COM-001",
    name: "Company 001",
  },
];

const administratorPermissions = [
  "tenants:read",
  "users:read",
  "users:write",
  "organisation:read",
];

const readOnlyPermissions = ["tenants:read", "users:read", "organisation:read"];

const success = (data: unknown) => ({ success: true, data });

const TARGET_ID = "20000000-0000-4000-8000-000000000002";

type MockSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

const seedSessions = (): MockSession[] => [
  {
    id: "30000000-0000-4000-8000-00000000000a",
    ipAddress: "203.0.113.10",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    createdAt: "2026-08-09T09:00:00.000Z",
    lastUsedAt: "2026-08-10T08:30:00.000Z",
    expiresAt: "2026-08-16T09:00:00.000Z",
    current: true,
  },
  {
    id: "30000000-0000-4000-8000-00000000000b",
    ipAddress: null,
    userAgent: null,
    createdAt: "2026-08-01T11:00:00.000Z",
    lastUsedAt: "2026-08-05T14:15:00.000Z",
    expiresAt: "2026-08-12T11:00:00.000Z",
    current: false,
  },
];

/**
 * A session id is a refresh family, so revoking one must remove that whole
 * family from the list rather than a single rotated token. The mock reproduces
 * that contract; the UI is only responsible for reflecting it.
 */
async function installSessionMock(
  page: Page,
  options: { permissions: string[]; failRevoke?: boolean },
) {
  let sessions = seedSessions();
  const calls: string[] = [];

  const actor = {
    id: "20000000-0000-4000-8000-000000000001",
    code: "USR-001",
    name: "User 001",
    email: "admin001@example.test",
    phone: null,
    department: "Compliance",
    roles: [
      {
        id: "r0",
        code: "CLIENT_COMPANY_ADMINISTRATOR",
        name: "Company Administrator",
      },
    ],
    status: "ACTIVE",
    lastLogin: null,
  };

  const identity = () => ({
    id: actor.id,
    code: actor.code,
    name: actor.name,
    email: actor.email,
    phone: actor.phone,
    status: "ACTIVE",
    lastLogin: null,
    permissions: options.permissions,
    activeCompany: companies[0]!,
    companies,
  });

  const target = {
    id: TARGET_ID,
    code: "USR-002",
    name: "User 002",
    email: "user002@example.test",
    phone: null,
    department: "Compliance",
    roles: [{ id: "r1", code: "DEPARTMENT_OWNER", name: "Department Owner" }],
    status: "ACTIVE",
    lastLogin: null,
  };

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
      return json({ accessToken: "mock-access-token", user: identity() });
    }
    if (path === "/api/v1/auth/logout") return json({ loggedOut: true });
    if (path === "/api/v1/organisation/departments") return json([]);

    if (path === `/api/v1/users/${TARGET_ID}/sessions` && method === "GET") {
      calls.push("list");
      return json(sessions);
    }

    if (
      path === `/api/v1/users/${TARGET_ID}/sessions/revoke-all` &&
      method === "POST"
    ) {
      calls.push("revoke-all");
      const sessionCount = sessions.length;
      sessions = [];
      return json({ revoked: true, sessionCount, tokensRevoked: 4 });
    }

    const revokeOne = path.match(
      new RegExp(`^/api/v1/users/${TARGET_ID}/sessions/([^/]+)/revoke$`),
    );
    if (revokeOne && method === "POST") {
      const familyId = revokeOne[1]!;
      calls.push(`revoke:${familyId}`);
      if (options.failRevoke) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "SESSION_ALREADY_REVOKED",
              message: "That session is no longer active",
            },
          }),
        });
      }
      // Revocation is family-wide, matching logout.
      sessions = sessions.filter((session) => session.id !== familyId);
      return json({ revoked: true, familyId, tokensRevoked: 2 });
    }

    if (path === `/api/v1/users/${TARGET_ID}` && method === "GET") {
      return json(target);
    }
    if (path === "/api/v1/users" && method === "GET") {
      return json([actor, target]);
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

  return { calls: () => calls };
}

const openSessions = async (page: Page) => {
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "User Management" }),
  ).toBeVisible();
  await page.getByRole("button", { name: `View ${TARGET_ID}` }).click();
  await expect(page.getByTestId("user-sessions-panel")).toBeVisible();
};

test("lists a user's active sessions and marks the current browser", async ({
  page,
}) => {
  await installSessionMock(page, { permissions: administratorPermissions });
  await openSessions(page);

  const panel = page.getByTestId("user-sessions-panel");
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByText("203.0.113.10")).toBeVisible();
  await expect(panel.getByText("This browser")).toHaveCount(1);
  // A session with no recorded client metadata still renders truthfully.
  await expect(panel.getByText("Unknown device")).toBeVisible();
  await expect(panel.getByText("IP not recorded")).toBeVisible();

  // The token hash is never part of the response and must never reach the DOM.
  await expect(panel).not.toContainText("tokenHash");
});

test("revokes one session and reflects the family-wide result", async ({
  page,
}) => {
  const mock = await installSessionMock(page, {
    permissions: administratorPermissions,
  });
  await openSessions(page);

  await page
    .getByTestId("user-session-revoke-30000000-0000-4000-8000-00000000000b")
    .click();

  await expect(page.getByText("Session revoked")).toBeVisible();
  await expect(
    page.getByTestId("user-sessions-panel").getByRole("listitem"),
  ).toHaveCount(1);
  // The list is re-read from the API rather than patched in the browser.
  // Asserted as ordering, not a call count: StrictMode double-invokes the
  // mount effect in dev, so the number of loads is not a stable contract.
  const calls = mock.calls();
  const revokedAt = calls.indexOf(
    "revoke:30000000-0000-4000-8000-00000000000b",
  );
  expect(revokedAt).toBeGreaterThanOrEqual(0);
  expect(calls.slice(revokedAt + 1)).toContain("list");
});

test("revokes every session and falls back to the empty state", async ({
  page,
}) => {
  const mock = await installSessionMock(page, {
    permissions: administratorPermissions,
  });
  await openSessions(page);

  await page.getByTestId("user-sessions-revoke-all").click();

  await expect(page.getByText("All sessions revoked")).toBeVisible();
  await expect(page.getByText("2 sessions ended")).toBeVisible();
  await expect(page.getByTestId("user-sessions-empty")).toBeVisible();
  // With nothing left to revoke the bulk control is withdrawn.
  await expect(page.getByTestId("user-sessions-revoke-all")).toHaveCount(0);
  expect(mock.calls()).toContain("revoke-all");
});

test("reports a refused revocation without dropping the session from view", async ({
  page,
}) => {
  await installSessionMock(page, {
    permissions: administratorPermissions,
    failRevoke: true,
  });
  await openSessions(page);

  await page
    .getByTestId("user-session-revoke-30000000-0000-4000-8000-00000000000b")
    .click();

  await expect(page.getByText("Session not revoked")).toBeVisible();
  await expect(
    page.getByText("That session is no longer active"),
  ).toBeVisible();
  // The row stays until the API confirms it is gone.
  await expect(
    page.getByTestId("user-sessions-panel").getByRole("listitem"),
  ).toHaveCount(2);
});

test("hides revocation controls without users:write", async ({ page }) => {
  await installSessionMock(page, { permissions: readOnlyPermissions });
  await openSessions(page);

  const panel = page.getByTestId("user-sessions-panel");
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("user-sessions-revoke-all")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Revoke" })).toHaveCount(0);
});
