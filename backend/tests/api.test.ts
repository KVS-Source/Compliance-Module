import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env.js";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";

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

describe("Milestone 1 API", () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  it("reports health in the safe envelope", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok" },
    });
    await request(app)
      .get("/api/v1/ready")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          data: { status: "ready" },
        });
      });
  });

  it("supports valid login, current user and pagination metadata", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    const token = response.body.data.accessToken as string;
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.data.email).toBe("admin001@example.test");
    const companies = await request(app)
      .get("/api/v1/tenants?page=1&pageSize=2")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(companies.body.meta).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it("rejects invalid and disabled login without leaking account details", async () => {
    const invalid = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "wrong-password" })
      .expect(401);
    expect(invalid.body).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Incorrect email or password" },
    });
    await prisma.user.update({
      where: { email: "user001@example.test" },
      data: { status: "DISABLED" },
    });
    const disabled = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(403);
    expect(disabled.body.error.code).toBe("FORBIDDEN");
    await prisma.user.update({
      where: { email: "user001@example.test" },
      data: { status: "ACTIVE" },
    });
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const originalCookie = login.headers["set-cookie"]?.[0] as string;
    const refresh = await agent.post("/api/v1/auth/refresh").expect(200);
    expect(refresh.body.data.accessToken).not.toBe(login.body.data.accessToken);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .expect(401);
    await agent.post("/api/v1/auth/refresh").expect(401);
  });

  it("revokes cookie sessions and always clears the logout cookie", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin001@example.test" },
    });
    const auditBefore = await prisma.auditEvent.count({
      where: { userId: admin.id, action: "AUTH_LOGOUT" },
    });
    const login = () =>
      request(app)
        .post("/api/v1/auth/login")
        .send({ email: "admin001@example.test", password: "Admin001!Secure" })
        .expect(200);
    const cookieFrom = (response: Awaited<ReturnType<typeof login>>) =>
      response.headers["set-cookie"]?.[0] as string;
    const expectCleared = (response: { headers: Record<string, unknown> }) => {
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(
        cookies?.some((cookie) => cookie.startsWith("genbioca_refresh=;")),
      ).toBe(true);
    };

    const validLogin = await login();
    const validCookie = cookieFrom(validLogin);
    const validLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${validLogin.body.data.accessToken}`)
      .set("Cookie", validCookie)
      .expect(200);
    expectCleared(validLogout);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", validCookie)
      .expect(401);

    const expiredLogin = await login();
    const expiredCookie = cookieFrom(expiredLogin);
    const expiredAccessToken = jwt.sign(
      {
        tenantId: expiredLogin.body.data.user.activeCompany.id,
        permissions: ["*"],
        type: "access",
      },
      env.JWT_ACCESS_SECRET,
      {
        subject: expiredLogin.body.data.user.id,
        expiresIn: -1,
        issuer: env.JWT_ISSUER,
        audience: "genbioca-frontend",
      },
    );
    const expiredLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${expiredAccessToken}`)
      .set("Cookie", expiredCookie)
      .expect(200);
    expectCleared(expiredLogout);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", expiredCookie)
      .expect(401);

    const cookieOnlyLogin = await login();
    const cookieOnly = cookieFrom(cookieOnlyLogin);
    const cookieOnlyLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieOnly)
      .expect(200);
    expectCleared(cookieOnlyLogout);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookieOnly)
      .expect(401);

    const repeatedLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieOnly)
      .expect(200);
    expectCleared(repeatedLogout);

    const unknownLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", "genbioca_refresh=synthetic-unknown-refresh-token")
      .expect(200);
    expectCleared(unknownLogout);

    const missingCookieLogout = await request(app)
      .post("/api/v1/auth/logout")
      .expect(200);
    expectCleared(missingCookieLogout);

    const auditAfter = await prisma.auditEvent.count({
      where: { userId: admin.id, action: "AUTH_LOGOUT" },
    });
    expect(auditAfter - auditBefore).toBe(3);

    const logoutAgent = request.agent(app);
    const logoutLogin = await logoutAgent
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const agentLogout = await logoutAgent
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${logoutLogin.body.data.accessToken}`)
      .expect(200);
    expectCleared(agentLogout);
    await logoutAgent.post("/api/v1/auth/refresh").expect(401);
  });

  it("allows only one concurrent refresh-token rotation", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const cookie = login.headers["set-cookie"]?.[0] as string;
    const responses = await Promise.all([
      request(app).post("/api/v1/auth/refresh").set("Cookie", cookie),
      request(app).post("/api/v1/auth/refresh").set("Cookie", cookie),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
  });

  it("blocks unauthorized Company switches", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    const response = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ companyId: randomUUID() })
      .expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("switches authorized context and isolates users and departments", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const company2 = login.body.data.user.companies.find(
      (company: { code: string }) => company.code === "COM-002",
    );
    const user2 = await prisma.user.findUniqueOrThrow({
      where: { email: "user001@example.test" },
    });
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ companyId: company2.id })
      .expect(200);
    const token = switched.body.data.accessToken as string;
    const users = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const company2Emails = users.body.data.map(
      (entry: { email: string }) => entry.email,
    );
    // COM-002 seed membership is admin only; user001 stays in COM-001.
    // Other suite files may create additional COM-002 users on the shared DB.
    expect(company2Emails).toContain("admin001@example.test");
    expect(company2Emails).not.toContain("user001@example.test");
    await request(app)
      .get(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    const departments = await request(app)
      .get("/api/v1/organisation/departments")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(departments.body.data).toHaveLength(1);
    expect(departments.body.data[0]).toMatchObject({
      code: "DEP-001",
      name: "Compliance",
    });
    expect(
      users.body.data.find(
        (entry: { email: string }) => entry.email === "admin001@example.test",
      ),
    ).toMatchObject({
      department: "Compliance",
      roles: ["Company Admin"],
    });
  });

  it("lists shared frameworks/rules and validates request envelopes", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const token = login.body.data.accessToken as string;
    const frameworks = await request(app)
      .get("/api/v1/frameworks")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const framework = frameworks.body.data[0];
    const rules = await request(app)
      .get(`/api/v1/frameworks/${framework.id}/rules`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(rules.body.data[0]).toMatchObject({ code: "RUL-001" });
    const validation = await request(app)
      .get("/api/v1/users?page=0")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(validation.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
    await request(app).get("/api/v1/users").expect(401);
    const regularLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${regularLogin.body.data.accessToken}`)
      .expect(403);
  });

  it("serves every Milestone 1 list/detail endpoint", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const token = login.body.data.accessToken as string;
    const authorization = { Authorization: `Bearer ${token}` };
    for (const path of [
      "/api/v1/tenants",
      "/api/v1/users",
      "/api/v1/organisation/departments",
      "/api/v1/organisation/locations",
      "/api/v1/organisation/units",
      "/api/v1/frameworks",
      "/api/v1/kpi-definitions",
      "/api/v1/kpi-goals",
    ]) {
      const response = await request(app)
        .get(path)
        .set(authorization)
        .expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 20 });
    }
    const users = await request(app).get("/api/v1/users").set(authorization);
    await request(app)
      .get(`/api/v1/users/${users.body.data[0].id}`)
      .set(authorization)
      .expect(200);
    const frameworks = await request(app)
      .get("/api/v1/frameworks")
      .set(authorization);
    await request(app)
      .get(`/api/v1/frameworks/${frameworks.body.data[0].id}`)
      .set(authorization)
      .expect(200);
  });

  it("rechecks active membership for an already-issued access token", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    const userId = login.body.data.user.id as string;
    const tenantId = login.body.data.user.activeCompany.id as string;
    await prisma.userCompany.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { status: "DISABLED" },
    });
    const denied = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .expect(401);
    expect(denied.body.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Company context is no longer active",
    });
    await prisma.userCompany.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { status: "ACTIVE" },
    });
  });

  it("enforces database tenant and append-only audit invariants", async () => {
    const company1 = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const company2 = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin001@example.test" },
    });
    const company2Role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company2.id, code: "COMPANY_ADMIN" },
      },
    });
    const company2Department = await prisma.orgDepartment.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company2.id, code: "DEP-001" },
      },
    });
    await expect(
      prisma.userRole.create({
        data: {
          userId: admin.id,
          roleId: company2Role.id,
          tenantId: company1.id,
        },
      }),
    ).rejects.toThrow();

    const userWithoutMembership = await prisma.user.create({
      data: {
        code: `TEST-${randomUUID()}`,
        email: `${randomUUID()}@example.test`,
        fullName: "Synthetic Test User",
        passwordHash: admin.passwordHash,
        status: "ACTIVE",
      },
    });
    try {
      const assignments = new RoleAssignmentService(prisma);
      await expect(
        assignments.upsertActive({
          userId: userWithoutMembership.id,
          roleId: company2Role.id,
          tenantId: company2.id,
          assignedBy: admin.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_ROLE_ASSIGNMENT" });
      await expect(
        prisma.userRole.create({
          data: {
            userId: userWithoutMembership.id,
            roleId: company2Role.id,
            tenantId: company2.id,
            status: "ACTIVE",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.user.delete({ where: { id: userWithoutMembership.id } });
    }

    await expect(
      prisma.userCompany.update({
        where: {
          userId_tenantId: { userId: admin.id, tenantId: company1.id },
        },
        data: { departmentId: company2Department.id },
      }),
    ).rejects.toThrow();
    const event = await prisma.auditEvent.create({
      data: {
        tenantId: company1.id,
        userId: admin.id,
        action: "TEST_APPEND_ONLY",
        entityType: "TEST",
      },
    });
    await expect(
      prisma.auditEvent.update({
        where: { id: event.id },
        data: { action: "MUTATED" },
      }),
    ).rejects.toThrow();
  });
});
