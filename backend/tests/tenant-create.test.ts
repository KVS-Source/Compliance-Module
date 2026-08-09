import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const uniqueCode = () =>
  `T${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

describe("Company creation", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  const createdCompanyIds: string[] = [];

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = login.body.data.accessToken as string;
    adminUserId = login.body.data.user.id as string;
  });

  /**
   * Companies created here would otherwise stay on the shared fixture admin's
   * Company list and change the totals other suites assert. Audit events are
   * append-only so the Companies cannot be deleted; retiring the membership
   * removes them from `listTenants`, which filters on an active membership,
   * and leaves the audit trail intact.
   */
  afterAll(async () => {
    if (createdCompanyIds.length > 0) {
      await prisma.userRole.updateMany({
        where: { userId: adminUserId, tenantId: { in: createdCompanyIds } },
        data: { status: "DISABLED" },
      });
      await prisma.userCompany.updateMany({
        where: { userId: adminUserId, tenantId: { in: createdCompanyIds } },
        data: { status: "DISABLED" },
      });
    }
    await prisma.$disconnect();
  });

  it("creates a Company whose creator can immediately work inside it", async () => {
    const code = uniqueCode();
    const createdResponse = await request(app)
      .post("/api/v1/tenants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code, name: "Created Company", country: "Country 001" })
      .expect(201);
    const companyId = createdResponse.body.data.id as string;
    createdCompanyIds.push(companyId);
    expect(createdResponse.body.data.code).toBe(code);

    // The creator must be an active member holding the administrator profile,
    // otherwise they would own a Company they cannot enter.
    const membership = await prisma.userCompany.findUnique({
      where: {
        userId_tenantId: { userId: adminUserId, tenantId: companyId },
      },
    });
    expect(membership?.status).toBe("ACTIVE");

    const assignment = await prisma.userRole.findFirst({
      where: { userId: adminUserId, tenantId: companyId, status: "ACTIVE" },
      include: { role: { include: { permissions: true } } },
    });
    expect(assignment?.role.code).toBe("CLIENT_COMPANY_ADMINISTRATOR");
    expect(assignment?.role.permissions.length).toBe(
      PRODUCTION_ACCESS_PROFILES.CLIENT_COMPANY_ADMINISTRATOR.permissions
        .length,
    );

    // The whole point: switch into the new Company and read a scoped resource.
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ companyId })
      .expect(200);
    const scopedToken = switched.body.data.accessToken as string;
    expect(switched.body.data.user.activeCompany.code).toBe(code);

    await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${scopedToken}`)
      .expect(200);

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: companyId, action: "COMPANY_CREATED" },
    });
    expect(audit?.userId).toBe(adminUserId);
  });

  it("rejects a duplicate code, a malformed code and a caller without the permission", async () => {
    const code = uniqueCode();
    const first = await request(app)
      .post("/api/v1/tenants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code, name: "First" })
      .expect(201);
    createdCompanyIds.push(first.body.data.id as string);

    const duplicate = await request(app)
      .post("/api/v1/tenants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code, name: "Second" })
      .expect(409);
    expect(duplicate.body.error.code).toBe("COMPANY_CODE_TAKEN");

    await request(app)
      .post("/api/v1/tenants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "lower-case", name: "Invalid" })
      .expect(400);

    const reader = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    await request(app)
      .post("/api/v1/tenants")
      .set("Authorization", `Bearer ${reader.body.data.accessToken}`)
      .send({ code: uniqueCode(), name: "Forbidden" })
      .expect(403);
  });
});
