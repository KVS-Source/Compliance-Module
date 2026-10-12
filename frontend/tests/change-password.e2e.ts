import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser-intercepted API responses. This verifies the Change Password screen
 * and its request contract, not Express/Prisma/PostgreSQL integration.
 */

const company = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "COM-001",
  name: "Company 001",
};

const identity = {
  id: "20000000-0000-4000-8000-000000000002",
  code: "USR-002",
  name: "User 002",
  email: "user001@example.test",
  phone: "+00 00000 00002",
  status: "ACTIVE",
  lastLogin: null,
  // Deliberately a non-admin permission set: self-service must not need
  // users:write or any other administrative permission.
  permissions: ["dashboard:read"],
  activeCompany: company,
  companies: [company],
};

const success = (data: unknown) => ({ success: true, data });

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

interface MockOptions {
  initialAuthenticated?: boolean;
  /** Response for POST /auth/change-password. Defaults to success. */
  changePassword?: {
    status: number;
    body: unknown;
  };
}

async function installMockApi(page: Page, options: MockOptions = {}) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let authenticated = options.initialAuthenticated ?? true;

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    requests.push({ method: request.method(), path, body });

    if (path === "/api/v1/auth/refresh") {
      if (!authenticated) {
        return json(route, 401, {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid refresh token" },
        });
      }
      return json(
        route,
        200,
        success({ accessToken: "mock-access-token", user: identity }),
      );
    }
    if (path === "/api/v1/auth/login") {
      authenticated = true;
      return json(
        route,
        200,
        success({ accessToken: "mock-access-token", user: identity }),
      );
    }
    if (path === "/api/v1/auth/logout") {
      authenticated = false;
      return json(route, 200, success({ loggedOut: true }));
    }
    if (path === "/api/v1/auth/change-password") {
      const configured = options.changePassword;
      if (configured) return json(route, configured.status, configured.body);
      // Server revoked every session for this user.
      authenticated = false;
      return json(route, 200, success({ passwordChanged: true }));
    }
    if (path === "/api/v1/dashboard/summary") {
      return json(route, 200, success({}));
    }
    return json(route, 200, success([]));
  });

  return requests;
}

const openChangePassword = async (page: Page) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "User profile" }).click();
  await page.getByTestId("profile-change-password").click();
  await expect(page).toHaveURL(/\/account\/change-password$/);
  await expect(page.getByTestId("change-password-card")).toBeVisible();
};

test("public account recovery explains the secure administrator path", async ({
  page,
}) => {
  await installMockApi(page, { initialAuthenticated: false });
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();

  const dialog = page.getByRole("dialog", { name: "Account Recovery" });
  await expect(dialog).toContainText("Contact your Company Administrator to reset your password.");
  await expect(dialog).toContainText("Change Password from your account menu.");
  await expect(dialog.locator("input")).toHaveCount(0);
});

test("reaches Change Password from the account menu without a sidebar entry", async ({
  page,
}) => {
  await installMockApi(page);
  await openChangePassword(page);

  await expect(
    page.getByRole("heading", { name: "Change Password" }),
  ).toBeVisible();
  // The sidebar contract is unchanged: this route is account-menu only.
  await expect(
    page.locator('.sidebar a[href="/account/change-password"]'),
  ).toHaveCount(0);
});

test("successful change signs the user out and redirects to login", async ({
  page,
}) => {
  const requests = await installMockApi(page);
  await openChangePassword(page);

  await page.locator("#current-password").fill("Original001!Secure");
  await page.locator("#new-password").fill("Rotated001!Secure");
  await page.locator("#confirm-password").fill("Rotated001!Secure");
  await page.getByRole("button", { name: "Change Password" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("login-notice")).toContainText(
    "Your password was changed",
  );
  await expect(page.getByTestId("login-notice")).toContainText(
    "Sign in again",
  );
  // The sign-in form is presented, so auth state really was cleared.
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  const change = requests.find(
    (entry) => entry.path === "/api/v1/auth/change-password",
  );
  expect(change?.method).toBe("POST");
  expect(change?.body).toEqual({
    currentPassword: "Original001!Secure",
    newPassword: "Rotated001!Secure",
  });
  // The client must never try to name the account it is changing.
  expect(JSON.stringify(change?.body)).not.toContain(identity.id);

  // No credential material is left in browser storage.
  const stored = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(stored)).not.toContain("Rotated001!Secure");
  expect(JSON.stringify(stored)).not.toContain("Original001!Secure");
});

test("displays a server validation error and stays on the page", async ({
  page,
}) => {
  await installMockApi(page, {
    changePassword: {
      status: 400,
      body: {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "New password must be different from the current password",
        },
      },
    },
  });
  await openChangePassword(page);

  await page.locator("#current-password").fill("Original001!Secure");
  await page.locator("#new-password").fill("Original001!Secure");
  await page.locator("#confirm-password").fill("Original001!Secure");
  await page.getByRole("button", { name: "Change Password" }).click();

  await expect(page.getByTestId("change-password-error")).toContainText(
    "New password must be different from the current password",
  );
  await expect(page).toHaveURL(/\/account\/change-password$/);
  // Still signed in — no redirect on failure.
  await expect(page.getByTestId("change-password-card")).toBeVisible();
});

test("rejects a mismatched confirmation before calling the API", async ({
  page,
}) => {
  const requests = await installMockApi(page);
  await openChangePassword(page);

  await page.locator("#current-password").fill("Original001!Secure");
  await page.locator("#new-password").fill("Rotated001!Secure");
  await page.locator("#confirm-password").fill("Different001!Secure");
  await page.getByRole("button", { name: "Change Password" }).click();

  await expect(page.getByTestId("change-password-error")).toContainText(
    "do not match",
  );
  expect(
    requests.filter(
      (entry) => entry.path === "/api/v1/auth/change-password",
    ),
  ).toHaveLength(0);
});
