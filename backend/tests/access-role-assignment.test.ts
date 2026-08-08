import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";
import { PRODUCTION_ACCESS_PROFILES } from "../src/production/access-profile.js";

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

describe("sanctioned user role assignments", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let company001Id: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = login.body.data.accessToken as string;
    adminUserId = login.body.data.user.id as string;
    company001Id = login.body.data.user.activeCompany.id as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createUser = async (
    token: string,
    sequence: string,
    password = "Phase101!Secure",
  ) => {
    const unique = randomUUID();
    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: `P1-${unique.slice(0, 8)}`,
        name: `User ${sequence}`,
        email: `${unique}@example.test`,
        password,
        status: "ACTIVE",
      })
      .expect(201);
    return response.body.data as { id: string; email: string };
  };

  it("assigns only production profiles, disables the previous role and audits each assignment", async () => {
    const target = await createUser(adminToken, "101");
    const profiles = await request(app)
      .get("/api/v1/access/profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const adminProfile = profiles.body.data.profiles.find(
      (profile: { code: string }) =>
        profile.code === "CLIENT_COMPANY_ADMINISTRATOR",
    );
    expect(adminProfile.permissions).toContain("roles:assign");
    expect(
      profiles.body.data.profiles
        .filter(
          (profile: { code: string }) =>
            profile.code !== "CLIENT_COMPANY_ADMINISTRATOR",
        )
        .every(
          (profile: { permissions: string[] }) =>
            !profile.permissions.includes("roles:assign"),
        ),
    ).toBe(true);

    const first = await request(app)
      .put(`/api/v1/access/users/${target.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleCode: "DEPARTMENT_OWNER" })
      .expect(200);
    expect(first.body.data).toMatchObject({
      userId: target.id,
      status: "ACTIVE",
      assignedBy: adminUserId,
      role: {
        code: "DEPARTMENT_OWNER",
        name: "Department Owner",
        status: "ACTIVE",
      },
    });

    const provisioned = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: company001Id,
          code: "DEPARTMENT_OWNER",
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    expect(
      provisioned.permissions.map(({ permission }) => permission.code).sort(),
    ).toEqual(
      [...PRODUCTION_ACCESS_PROFILES.DEPARTMENT_OWNER.permissions].sort(),
    );
    expect(
      provisioned.permissions.some(({ permission }) => permission.code === "*"),
    ).toBe(false);

    await request(app)
      .put(`/api/v1/access/users/${target.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleCode: "COMPLIANCE_MANAGER" })
      .expect(200);

    const assignments = await request(app)
      .get(`/api/v1/access/users/${target.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(assignments.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "DISABLED",
          role: expect.objectContaining({ code: "DEPARTMENT_OWNER" }),
        }),
        expect.objectContaining({
          status: "ACTIVE",
          role: expect.objectContaining({ code: "COMPLIANCE_MANAGER" }),
        }),
      ]),
    );
    expect(
      assignments.body.data.filter(
        (assignment: { status: string }) => assignment.status === "ACTIVE",
      ),
    ).toHaveLength(1);

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: company001Id,
        userId: adminUserId,
        entityId: target.id,
        action: "USER_ROLE_ASSIGN",
      },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.map(({ metadata }) => metadata)).toEqual([
      expect.objectContaining({ roleCode: "DEPARTMENT_OWNER" }),
      expect.objectContaining({
        roleCode: "COMPLIANCE_MANAGER",
        disabledAssignmentCount: 1,
      }),
    ]);
  });

  it("rejects cross-Company roles and users without leaking tenant data", async () => {
    const target = await createUser(adminToken, "102");
    const company002 = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const company002Role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: company002.id,
          code: "COMPANY_ADMIN",
        },
      },
    });
    await expect(
      new RoleAssignmentService(prisma).upsertActive({
        userId: target.id,
        roleId: company002Role.id,
        tenantId: company001Id,
        assignedBy: adminUserId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "INVALID_ROLE_ASSIGNMENT",
    });

    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ companyId: company002.id })
      .expect(200);
    const company002User = await createUser(
      switched.body.data.accessToken as string,
      "103",
    );
    const rejected = await request(app)
      .put(`/api/v1/access/users/${company002User.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleCode: "MANAGEMENT_VIEWER" })
      .expect(409);
    expect(rejected.body.error.code).toBe("INVALID_ROLE_ASSIGNMENT");
    await request(app)
      .get(`/api/v1/access/users/${company002User.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("rejects wildcard, non-profile, self and unauthorised assignments", async () => {
    const target = await createUser(adminToken, "104");
    for (const roleCode of ["*", "COMPANY_ADMIN"]) {
      const rejected = await request(app)
        .put(`/api/v1/access/users/${target.id}/roles`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roleCode })
        .expect(400);
      expect(rejected.body.error.code).toBe("INVALID_ROLE_CODE");
    }

    const selfAssignment = await request(app)
      .put(`/api/v1/access/users/${adminUserId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleCode: "CLIENT_COMPANY_ADMINISTRATOR" })
      .expect(403);
    expect(selfAssignment.body.error.code).toBe(
      "SELF_ROLE_ASSIGNMENT_FORBIDDEN",
    );

    const regularLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    const forbidden = await request(app)
      .put(`/api/v1/access/users/${target.id}/roles`)
      .set(
        "Authorization",
        `Bearer ${regularLogin.body.data.accessToken as string}`,
      )
      .send({ roleCode: "MANAGEMENT_VIEWER" })
      .expect(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
  });

  it("closes the create, assign, authenticate and authorised-route loop", async () => {
    const password = "Phase105!Secure";
    const target = await createUser(adminToken, "105", password);
    await request(app)
      .put(`/api/v1/access/users/${target.id}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleCode: "MANAGEMENT_VIEWER" })
      .expect(200);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password })
      .expect(200);
    expect(login.body.data.user.permissions).toContain("users:read");
    expect(login.body.data.user.permissions).not.toContain("roles:assign");
    await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.data.accessToken as string}`)
      .expect(200);
  });
});
