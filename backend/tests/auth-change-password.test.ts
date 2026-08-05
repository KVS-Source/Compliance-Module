import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/security/password.js";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

const ORIGINAL_PASSWORD = "ChangeMe001!Secure";

describe("self-service password change", () => {
  let app: Express;
  let prisma: PrismaClient;
  let companyOneId: string;
  let companyUserRoleId: string;
  let adminUserId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = (email: string, password: string) =>
    request(app).post("/api/v1/auth/login").send({ email, password });

  const loginOk = async (email: string, password: string) => {
    const response = await login(email, password).expect(200);
    const cookies = response.headers["set-cookie"] as unknown as
      string[] | undefined;
    return {
      accessToken: response.body.data.accessToken as string,
      refreshCookie: (cookies ?? []).find((value) =>
        value.startsWith("genbioca_refresh="),
      ),
    };
  };

  const hashFor = async (userId: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true },
      })
    ).passwordHash;

  /**
   * Creates a throwaway user holding the seeded COMPANY_USER role, which does
   * not carry `users:write` or `*`. Dedicated users keep this suite from
   * mutating the shared fixture accounts other suites sign in with.
   */
  const createUser = async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        code: `PWD-${suffix.toUpperCase()}`,
        email: `pwd-${suffix}@example.test`,
        fullName: `Password Subject ${suffix}`,
        passwordHash: await hashPassword(ORIGINAL_PASSWORD),
        status: "ACTIVE",
        defaultTenantId: companyOneId,
      },
      select: { id: true, email: true },
    });
    await prisma.userCompany.create({
      data: { userId: user.id, tenantId: companyOneId, status: "ACTIVE" },
    });
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: companyUserRoleId,
        tenantId: companyOneId,
        status: "ACTIVE",
        assignedBy: adminUserId,
      },
    });
    return user;
  };

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));

    const admin = await login(
      "admin001@example.test",
      "Admin001!Secure",
    ).expect(200);
    adminUserId = admin.body.data.user.id as string;
    const company = (
      admin.body.data.user.companies as Array<{ id: string; code: string }>
    ).find((entry) => entry.code === "COM-001");
    if (!company) throw new Error("COM-001 fixture missing");
    companyOneId = company.id;

    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: companyOneId, code: "COMPANY_USER" },
      },
      select: { id: true },
    });
    companyUserRoleId = role.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("changes the hash so the new password authenticates and the old one does not", async () => {
    const user = await createUser();
    const before = await hashFor(user.id);
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated001!Secure",
      })
      .expect(200);
    expect(response.body.success).toBe(true);
    // Minimal body — no credential material echoed back.
    expect(JSON.stringify(response.body)).not.toContain("Rotated001!Secure");

    const after = await hashFor(user.id);
    expect(after).not.toBe(before);

    await login(user.email, "Rotated001!Secure").expect(200);
    await login(user.email, ORIGINAL_PASSWORD).expect(401);
  });

  it("rejects a wrong current password and leaves the hash unchanged", async () => {
    const user = await createUser();
    const before = await hashFor(user.id);
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: "NotTheRightOne1!",
        newPassword: "Rotated002!Secure",
      })
      .expect(401);
    // Structurally identical to every other auth failure.
    expect(response.body).toEqual({
      success: false,
      error: expect.objectContaining({ code: "UNAUTHORIZED" }),
    });

    expect(await hashFor(user.id)).toBe(before);
    await login(user.email, ORIGINAL_PASSWORD).expect(200);
  });

  it("rejects a new password identical to the current one", async () => {
    const user = await createUser();
    const before = await hashFor(user.id);
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: ORIGINAL_PASSWORD,
      })
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await hashFor(user.id)).toBe(before);
  });

  it("rejects a weak new password using the shared users-module rule", async () => {
    const user = await createUser();
    const before = await hashFor(user.id);
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({ currentPassword: ORIGINAL_PASSWORD, newPassword: "short7!" })
      .expect(400);
    expect(response.body.success).toBe(false);
    expect(await hashFor(user.id)).toBe(before);

    // The same value is refused by the admin path, proving one shared rule.
    const admin = await loginOk("admin001@example.test", "Admin001!Secure");
    await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(auth(admin.accessToken))
      .send({ password: "short7!" })
      .expect(400);
  });

  it("revokes every refresh token for the user, including the caller's own session", async () => {
    const user = await createUser();
    const first = await loginOk(user.email, ORIGINAL_PASSWORD);
    const second = await loginOk(user.email, ORIGINAL_PASSWORD);
    expect(first.refreshCookie).toBeDefined();
    expect(second.refreshCookie).toBeDefined();

    const live = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(live).toBeGreaterThanOrEqual(2);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(second.accessToken))
      .set("Cookie", second.refreshCookie!)
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated003!Secure",
      })
      .expect(200);

    // The refresh cookie is cleared on the response.
    const cleared =
      (response.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(
      cleared.some((value) => value.startsWith("genbioca_refresh=;")),
    ).toBe(true);

    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);

    // A previously issued refresh token no longer works.
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", first.refreshCookie!)
      .expect(401);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", second.refreshCookie!)
      .expect(401);
  });

  it("cannot target another user through any request field", async () => {
    const caller = await createUser();
    const victim = await createUser();
    const victimBefore = await hashFor(victim.id);
    const { accessToken } = await loginOk(caller.email, ORIGINAL_PASSWORD);

    await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated004!Secure",
        // All ignored: identity comes from the token only.
        userId: victim.id,
        id: victim.id,
        email: victim.email,
        targetUserId: victim.id,
      })
      .expect(200);

    // The victim is untouched and still signs in with the original password.
    expect(await hashFor(victim.id)).toBe(victimBefore);
    await login(victim.email, ORIGINAL_PASSWORD).expect(200);
    await login(victim.email, "Rotated004!Secure").expect(401);
    // Only the caller changed.
    await login(caller.email, "Rotated004!Secure").expect(200);
  });

  it("writes exactly one audit event carrying no password material", async () => {
    const user = await createUser();
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated005!Secure",
      })
      .expect(200);

    const events = await prisma.auditEvent.findMany({
      where: { userId: user.id, action: "PASSWORD_CHANGED" },
      select: {
        tenantId: true,
        userId: true,
        metadata: true,
        entityType: true,
      },
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event!.tenantId).toBe(companyOneId);
    expect(event!.userId).toBe(user.id);
    expect(event!.entityType).toBe("AUTH");

    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain(ORIGINAL_PASSWORD);
    expect(serialised).not.toContain("Rotated005!Secure");
    expect(serialised.toLowerCase()).not.toContain("argon2");
    expect(serialised).not.toContain("passwordHash");
  });

  it("rejects an unauthenticated request", async () => {
    await request(app)
      .post("/api/v1/auth/change-password")
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated006!Secure",
      })
      .expect(401);
  });

  it("works for a non-admin role that lacks users:write", async () => {
    const user = await createUser();
    const { accessToken } = await loginOk(user.email, ORIGINAL_PASSWORD);

    // Prove the role really cannot administer users.
    await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set(auth(accessToken))
      .send({ password: "Rotated007!Secure" })
      .expect(403);

    // The same caller can still change their own password.
    await request(app)
      .post("/api/v1/auth/change-password")
      .set(auth(accessToken))
      .send({
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: "Rotated007!Secure",
      })
      .expect(200);
    await login(user.email, "Rotated007!Secure").expect(200);
  });
});
