import { expect, test, type Page, type Route } from "@playwright/test";

const companies = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    code: "COM-001",
    name: "Company 001",
    industry: "Life Sciences",
    country: "Country 001",
    status: "ACTIVE",
    created: "2026-07-01T00:00:00.000Z",
  },
];

const departments = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    code: "DEP-001",
    name: "Compliance",
    headName: "User 002",
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

type MockUser = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  roles: string[];
  status: string;
  lastLogin: string | null;
};

const seedUsers = (): MockUser[] => [
  {
    id: "20000000-0000-4000-8000-000000000001",
    code: "USR-001",
    name: "User 001",
    email: "admin001@example.test",
    phone: "+00 00000 00001",
    department: "Compliance",
    roles: ["Company Admin"],
    status: "ACTIVE",
    lastLogin: "2026-07-21T10:00:00.000Z",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    code: "USR-002",
    name: "User 002",
    email: "user001@example.test",
    phone: "+00 00000 00002",
    department: "Compliance",
    roles: ["Company User"],
    status: "ACTIVE",
    lastLogin: null,
  },
];

const success = (data: unknown) => ({ success: true, data });
const failure = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
) => ({
  status,
  body: {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  },
});

async function installUsersWriteMock(
  page: Page,
  options: { permissions: string[] },
) {
  let users = seedUsers();
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes("users:write");

  const identity = () => ({
    id: users[0]!.id,
    code: users[0]!.code,
    name: users[0]!.name,
    email: users[0]!.email,
    phone: users[0]!.phone,
    status: "ACTIVE",
    lastLogin: users[0]!.lastLogin,
    permissions: options.permissions,
    activeCompany: {
      id: companies[0]!.id,
      code: companies[0]!.code,
      name: companies[0]!.name,
    },
    companies: companies.map(({ id, code, name }) => ({ id, code, name })),
  });

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }
    if (path === "/api/v1/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }
    if (path === "/api/v1/auth/logout") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success({ loggedOut: true })),
      });
    }

    if (path === "/api/v1/organisation/departments") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(departments)),
      });
    }

    if (path === "/api/v1/users" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(users)),
      });
    }

    if (path === "/api/v1/users" && method === "POST") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const payload = request.postDataJSON() as {
        code: string;
        name: string;
        email: string;
        phone?: string | null;
        password: string;
        status?: string;
        departmentId?: string | null;
      };
      if (users.some((entry) => entry.email === payload.email.toLowerCase())) {
        const conflict = failure(
          409,
          "CONFLICT",
          "A record with these details already exists",
        );
        return route.fulfill({
          status: conflict.status,
          contentType: "application/json",
          body: JSON.stringify(conflict.body),
        });
      }
      const department = departments.find(
        (entry) => entry.id === payload.departmentId,
      );
      const created: MockUser = {
        id: `20000000-0000-4000-8000-${String(users.length + 1).padStart(12, "0")}`,
        code: payload.code,
        name: payload.name,
        email: payload.email.toLowerCase(),
        phone: payload.phone ?? null,
        department: department?.name ?? null,
        roles: [],
        status: payload.status ?? "ACTIVE",
        lastLogin: null,
      };
      users = [...users, created];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    if (path.startsWith("/api/v1/users/") && method === "GET") {
      const id = path.split("/").pop()!;
      const found = users.find((entry) => entry.id === id);
      if (!found) {
        const missing = failure(404, "NOT_FOUND", "User not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(found)),
      });
    }

    if (path.startsWith("/api/v1/users/") && method === "PATCH") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const id = path.split("/").pop()!;
      const index = users.findIndex((entry) => entry.id === id);
      if (index < 0) {
        const missing = failure(404, "NOT_FOUND", "User not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      const payload = request.postDataJSON() as {
        name?: string;
        email?: string;
        phone?: string | null;
        password?: string;
        status?: string;
        departmentId?: string | null;
      };
      if (
        payload.email &&
        users.some(
          (entry) =>
            entry.id !== id && entry.email === payload.email!.toLowerCase(),
        )
      ) {
        const conflict = failure(
          409,
          "CONFLICT",
          "A record with these details already exists",
        );
        return route.fulfill({
          status: conflict.status,
          contentType: "application/json",
          body: JSON.stringify(conflict.body),
        });
      }
      const current = users[index]!;
      const department =
        payload.departmentId === undefined
          ? undefined
          : payload.departmentId
            ? departments.find((entry) => entry.id === payload.departmentId)
            : null;
      const updated: MockUser = {
        ...current,
        name: payload.name ?? current.name,
        email: payload.email?.toLowerCase() ?? current.email,
        phone:
          payload.phone === undefined ? current.phone : (payload.phone ?? null),
        status: payload.status ?? current.status,
        department:
          department === undefined
            ? current.department
            : (department?.name ?? null),
      };
      users = users.map((entry, entryIndex) =>
        entryIndex === index ? updated : entry,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(updated)),
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
}

test("creates a Company user through the Users page", async ({ page }) => {
  await installUsersWriteMock(page, { permissions: ["*"] });
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);

  await page.getByRole("button", { name: "Add User" }).click();
  await page.locator("#user-code").fill("USR-100");
  await page.locator("#user-name").fill("User Writer 100");
  await page.locator("#user-email").fill("writer100@example.test");
  await page.locator("#user-password").fill("Writer100!Secure");
  await page.locator("#user-departmentId").selectOption(departments[0]!.id);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("User created")).toBeVisible();
  const table = page.getByRole("table", { name: /User Management/ });
  await expect(table.getByText("User Writer 100", { exact: true })).toBeVisible();
  await expect(table.getByText("writer100@example.test")).toBeVisible();
});

test("edits a Company user through the Users page", async ({ page }) => {
  await installUsersWriteMock(page, { permissions: ["*"] });
  await page.goto("/admin/users");

  await page
    .getByRole("button", { name: `Edit ${seedUsers()[1]!.id}` })
    .click();
  await expect(page.getByRole("heading", { name: "Edit User 002" })).toBeVisible();
  await page.locator("#user-name").fill("User 002 Updated");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("User updated")).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: /User Management/ })
      .getByText("User 002 Updated", { exact: true }),
  ).toBeVisible();
});

test("shows a field error when create email conflicts", async ({ page }) => {
  await installUsersWriteMock(page, { permissions: ["*"] });
  await page.goto("/admin/users");

  await page.getByRole("button", { name: "Add User" }).click();
  await page.locator("#user-code").fill("USR-DUP");
  await page.locator("#user-name").fill("Duplicate Email");
  await page.locator("#user-email").fill("admin001@example.test");
  await page.locator("#user-password").fill("Duplicate001!Secure");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("#user-email-error")).toHaveText(
    "A user with this email already exists",
  );
  await expect(page.locator("#user-email")).toHaveClass(/invalid/);
  await expect(page.getByText("User created")).toHaveCount(0);
});

test("hides write actions without users:write and rejects create safely", async ({
  page,
}) => {
  await installUsersWriteMock(page, {
    permissions: ["users:read", "organisation:read"],
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add User" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Edit ${seedUsers()[0]!.id}` }),
  ).toHaveCount(0);

  const denied = await page.evaluate(async () => {
    const response = await fetch("/api/v1/users", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: "USR-FORBIDDEN",
        name: "Forbidden User",
        email: "forbidden@example.test",
        password: "Forbidden001!Secure",
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        success: boolean;
        error?: { code: string };
      },
    };
  });
  expect(denied.status).toBe(403);
  expect(denied.body).toMatchObject({
    success: false,
    error: { code: "FORBIDDEN" },
  });
});
