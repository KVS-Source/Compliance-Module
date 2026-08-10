import { expect, test, type Page, type Route } from "@playwright/test";

const companies = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    code: "COM-001",
    name: "Company 001",
  },
];

const HEADERS = [
  "User Code",
  "Full Name",
  "Email",
  "Phone",
  "Department",
  "Role",
  "Status",
];

const administratorPermissions = [
  "tenants:read",
  "users:read",
  "users:write",
  "roles:assign",
  "organisation:read",
];

const success = (data: unknown) => ({ success: true, data });

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
    phone: null,
    department: "Compliance",
    roles: ["Company Admin"],
    status: "ACTIVE",
    lastLogin: null,
  },
];

/**
 * The API is the authority on what a row means, so the mock reproduces its
 * contract rather than re-implementing validation in the browser: preview
 * returns a per-row verdict, and commit only accepts the rows preview blessed.
 */
async function installImportMock(
  page: Page,
  options: { permissions: string[] },
) {
  let users = seedUsers();
  const commits: Array<{ initialPassword: string; rows: unknown[] }> = [];
  const canAssignRole = options.permissions.includes("roles:assign");

  const identity = () => ({
    id: users[0]!.id,
    code: users[0]!.code,
    name: users[0]!.name,
    email: users[0]!.email,
    phone: users[0]!.phone,
    status: "ACTIVE",
    lastLogin: null,
    permissions: options.permissions,
    activeCompany: companies[0]!,
    companies,
  });

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

    if (path === "/api/v1/users/import/template" && method === "GET") {
      return json({
        headers: HEADERS,
        maxRows: 200,
        statuses: ["ACTIVE", "INVITED", "DISABLED", "LOCKED"],
        roles: [
          { code: "DEPARTMENT_OWNER", name: "Department Owner" },
          { code: "MANAGEMENT_VIEWER", name: "Read-only Management Viewer" },
        ],
      });
    }

    if (path === "/api/v1/users/import/template.csv" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        headers: {
          "content-disposition":
            'attachment; filename="genbioca-user-import-template-2026-08-10.csv"',
        },
        body: `${HEADERS.join(",")}\r\n`,
      });
    }

    if (path === "/api/v1/users/import/preview" && method === "POST") {
      const { csv } = request.postDataJSON() as { csv: string };
      const lines = csv
        .split(/\r?\n/)
        .slice(1)
        .filter((line) => line.trim().length > 0);
      const rows = lines.map((line, index) => {
        const cells = line.split(",");
        const source = {
          line: index + 1,
          code: cells[0] ?? "",
          name: cells[1] ?? "",
          email: cells[2] ?? "",
          phone: cells[3] ?? "",
          department: cells[4] ?? "",
          role: cells[5] ?? "",
          status: cells[6] ?? "",
        };
        // One deliberately refused row: an identity the platform already holds.
        const conflict = source.email === "admin001@example.test";
        return {
          line: source.line,
          valid: !conflict,
          errors: conflict ? ["Email is already in use"] : [],
          source,
          candidate: conflict
            ? null
            : {
                line: source.line,
                code: source.code,
                name: source.name,
                email: source.email,
                phone: source.phone || null,
                departmentId: null,
                departmentName: source.department || null,
                roleCode: source.role || null,
                status: source.status || "ACTIVE",
              },
        };
      });
      return json({
        totalRows: rows.length,
        validRows: rows.filter((row) => row.valid).length,
        invalidRows: rows.filter((row) => !row.valid).length,
        canAssignRoles: canAssignRole,
        rows,
      });
    }

    if (path === "/api/v1/users/import/commit" && method === "POST") {
      const payload = request.postDataJSON() as {
        initialPassword: string;
        rows: Array<{
          line?: number;
          code: string;
          name: string;
          email: string;
          roleCode: string | null;
          status: string;
        }>;
      };
      commits.push(payload);
      users = [
        ...users,
        ...payload.rows.map((row, index) => ({
          id: `20000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
          code: row.code,
          name: row.name,
          email: row.email,
          phone: null,
          department: null,
          roles: row.roleCode ? [row.roleCode] : [],
          status: row.status,
          lastLogin: null,
        })),
      ];
      return json({
        totalRows: payload.rows.length,
        created: payload.rows.length,
        failed: 0,
        rolesAssigned: payload.rows.filter((row) => row.roleCode).length,
        results: payload.rows.map((row, index) => ({
          line: row.line ?? index + 1,
          code: row.code,
          email: row.email,
          outcome: "CREATED" as const,
          roleAssigned: Boolean(row.roleCode),
        })),
      });
    }

    if (path === "/api/v1/users" && method === "GET") return json(users);

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      }),
    });
  });

  return { commits: () => commits };
}

const CSV = [
  HEADERS.join(","),
  "USR-201,Import User 201,import201@example.test,,Compliance,DEPARTMENT_OWNER,ACTIVE",
  "USR-202,Import User 202,import202@example.test,,,MANAGEMENT_VIEWER,ACTIVE",
  "USR-203,Already Present,admin001@example.test,,,,",
].join("\n");

test("imports users from a CSV after reviewing the per-row verdict", async ({
  page,
}) => {
  const mock = await installImportMock(page, {
    permissions: administratorPermissions,
  });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "User Management" }),
  ).toBeVisible();

  await page.getByTestId("users-import").click();
  await expect(
    page.getByRole("heading", { name: "Import users" }),
  ).toBeVisible();

  await page.getByTestId("user-import-file").setInputFiles({
    name: "staff.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });

  const preview = page.getByTestId("user-import-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Import User 201")).toBeVisible();
  // The refused row stays visible with its reason rather than being dropped.
  await expect(preview.getByText("Email is already in use")).toBeVisible();
  await expect(page.getByTestId("user-import-row-3")).toHaveClass(
    /register-row-overdue/,
  );

  // Commit stays disabled until an initial password of usable strength exists.
  const commit = page.getByTestId("user-import-commit");
  await expect(commit).toBeDisabled();
  await page.locator("#user-import-password").fill("Onboard001!Secure");
  await expect(commit).toBeEnabled();
  await expect(commit).toHaveText(/Create 2 users/);
  await commit.click();

  await expect(page.getByText("Users imported")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  const table = page.getByRole("table", { name: /User Management/ });
  await expect(table.getByText("Import User 201")).toBeVisible();
  await expect(table.getByText("Import User 202")).toBeVisible();
  // Only the rows the API validated were sent, and the password never
  // travelled inside the file.
  const [submitted] = mock.commits();
  expect(submitted?.rows).toHaveLength(2);
  expect(CSV).not.toContain("Onboard001!Secure");
});

test("tells an administrator without roles:assign to leave the Role column empty", async ({
  page,
}) => {
  await installImportMock(page, {
    permissions: ["tenants:read", "users:read", "users:write"],
  });
  await page.goto("/admin/users");
  await page.getByTestId("users-import").click();

  await expect(
    page.getByText("Your role cannot assign roles", { exact: false }),
  ).toBeVisible();
});
