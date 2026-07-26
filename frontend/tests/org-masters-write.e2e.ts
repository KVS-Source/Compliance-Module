import { expect, test, type Page, type Route } from "@playwright/test";

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};

type OrgRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  headName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  type?: string | null;
};

const success = (data: unknown) => ({ success: true, data });
const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, error: { code, message } },
});

async function installOrgWriteMock(
  page: Page,
  options: {
    permissions: string[];
    resource: "departments" | "locations" | "units";
  },
) {
  const writePermission = `${options.resource}:write`;
  const canWrite =
    options.permissions.includes("*") ||
    options.permissions.includes(writePermission);

  let rows: OrgRow[] =
    options.resource === "departments"
      ? [
          {
            id: "30000000-0000-4000-8000-000000000001",
            code: "DEP-001",
            name: "Compliance",
            headName: "User 002",
            status: "ACTIVE",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ]
      : options.resource === "locations"
        ? [
            {
              id: "40000000-0000-4000-8000-000000000001",
              code: "LOC-001",
              name: "Location 001",
              city: "City 001",
              state: "State 001",
              country: "Country 001",
              type: "Office",
              status: "ACTIVE",
              createdAt: "2026-07-01T00:00:00.000Z",
            },
          ]
        : [
            {
              id: "50000000-0000-4000-8000-000000000001",
              code: "UNIT-001",
              name: "Organisation Unit 001",
              status: "ACTIVE",
              createdAt: "2026-07-01T00:00:00.000Z",
            },
          ];

  const identity = () => ({
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
  });

  const basePath = `/api/v1/organisation/${options.resource}`;

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/auth/refresh" || path === "/api/v1/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({ accessToken: "mock-access-token", user: identity() }),
        ),
      });
    }

    if (path === basePath && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(success(rows)),
      });
    }

    if (path === basePath && method === "POST") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const payload = request.postDataJSON() as OrgRow & { code: string };
      if (rows.some((entry) => entry.code === payload.code)) {
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
      const created: OrgRow = {
        id: `90000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
        code: payload.code,
        name: payload.name,
        status: payload.status ?? "ACTIVE",
        createdAt: new Date().toISOString(),
        headName: payload.headName ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        country: payload.country ?? null,
        type: payload.type ?? null,
      };
      rows = [...rows, created];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(success(created)),
      });
    }

    if (path.startsWith(`${basePath}/`) && method === "PATCH") {
      if (!canWrite) {
        const denied = failure(403, "FORBIDDEN", "Permission denied");
        return route.fulfill({
          status: denied.status,
          contentType: "application/json",
          body: JSON.stringify(denied.body),
        });
      }
      const id = path.split("/").pop()!;
      const index = rows.findIndex((entry) => entry.id === id);
      if (index < 0) {
        const missing = failure(404, "NOT_FOUND", "Not found");
        return route.fulfill({
          status: missing.status,
          contentType: "application/json",
          body: JSON.stringify(missing.body),
        });
      }
      const payload = request.postDataJSON() as Partial<OrgRow>;
      const updated = { ...rows[index]!, ...payload, id, code: rows[index]!.code };
      rows = rows.map((entry, entryIndex) =>
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

const resources = [
  {
    resource: "departments" as const,
    path: "/admin/departments",
    heading: "Department Setup",
    singular: "Department",
    addLabel: "Add Department",
    seedId: "30000000-0000-4000-8000-000000000001",
    createCode: "DEP-100",
    createName: "Department Writer 100",
    seedCode: "DEP-001",
    extra: async (page: Page) => {
      await page.locator("#org-headName").fill("Head Writer 100");
    },
  },
  {
    resource: "locations" as const,
    path: "/admin/locations",
    heading: "Location Setup",
    singular: "Location",
    addLabel: "Add Location",
    seedId: "40000000-0000-4000-8000-000000000001",
    createCode: "LOC-100",
    createName: "Location Writer 100",
    seedCode: "LOC-001",
    extra: async (page: Page) => {
      await page.locator("#org-city").fill("City 100");
      await page.locator("#org-country").fill("Country 001");
    },
  },
  {
    resource: "units" as const,
    path: "/admin/organisation-units",
    heading: "Organisation Units",
    singular: "Organisation Unit",
    addLabel: "Add Organisation Unit",
    seedId: "50000000-0000-4000-8000-000000000001",
    createCode: "UNIT-100",
    createName: "Unit Writer 100",
    seedCode: "UNIT-001",
    extra: async () => undefined,
  },
];

for (const entry of resources) {
  test.describe(`${entry.resource} write UI`, () => {
    test(`creates a ${entry.singular.toLowerCase()}`, async ({ page }) => {
      await installOrgWriteMock(page, {
        permissions: ["*", "organisation:read"],
        resource: entry.resource,
      });
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { name: entry.heading })).toBeVisible();
      await expect(page.getByTestId("prototype-module-banner")).toHaveCount(0);

      await page.getByRole("button", { name: entry.addLabel }).click();
      await page.locator("#org-code").fill(entry.createCode);
      await page.locator("#org-name").fill(entry.createName);
      await entry.extra(page);
      await page.getByRole("button", { name: "Save" }).click();

      await expect(
        page.getByText(`${entry.singular} created`, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("table", { name: new RegExp(entry.heading) })
          .getByText(entry.createName, { exact: true }),
      ).toBeVisible();
    });

    test(`edits a ${entry.singular.toLowerCase()}`, async ({ page }) => {
      await installOrgWriteMock(page, {
        permissions: ["*"],
        resource: entry.resource,
      });
      await page.goto(entry.path);
      await page.getByRole("button", { name: `Edit ${entry.seedId}` }).click();
      await page.locator("#org-name").fill(`${entry.singular} Revised`);
      await page.getByRole("button", { name: "Save" }).click();

      await expect(
        page.getByText(`${entry.singular} updated`, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("table", { name: new RegExp(entry.heading) })
          .getByText(`${entry.singular} Revised`, { exact: true }),
      ).toBeVisible();
    });

    test(`shows a field error for duplicate ${entry.singular.toLowerCase()} code`, async ({
      page,
    }) => {
      await installOrgWriteMock(page, {
        permissions: ["*"],
        resource: entry.resource,
      });
      await page.goto(entry.path);
      await page.getByRole("button", { name: entry.addLabel }).click();
      await page.locator("#org-code").fill(entry.seedCode);
      await page.locator("#org-name").fill("Duplicate Name");
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.locator("#org-code-error")).toHaveText(
        "A record with this code already exists in the active Company",
      );
      await expect(page.locator("#org-code")).toHaveClass(/invalid/);
      await expect(page.getByText(`${entry.singular} created`)).toHaveCount(0);
    });

    test(`hides write actions without ${entry.resource}:write`, async ({
      page,
    }) => {
      await installOrgWriteMock(page, {
        permissions: ["organisation:read"],
        resource: entry.resource,
      });
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { name: entry.heading })).toBeVisible();
      await expect(page.getByRole("button", { name: entry.addLabel })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: `Edit ${entry.seedId}` }),
      ).toHaveCount(0);

      const denied = await page.evaluate(
        async ({ path }) => {
          const response = await fetch(path, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: "FORBIDDEN-001",
              name: "Forbidden",
            }),
          });
          return {
            status: response.status,
            body: (await response.json()) as {
              success: boolean;
              error?: { code: string };
            },
          };
        },
        { path: `/api/v1/organisation/${entry.resource}` },
      );
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({
        success: false,
        error: { code: "FORBIDDEN" },
      });
    });
  });
}
