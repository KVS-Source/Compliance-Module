import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

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

describe("User write API", () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: {
        id: string;
        activeCompany: { id: string; code: string };
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  it("creates a user with users:write and writes a USER_CREATE audit event", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const token = admin.accessToken;
    const tenantId = admin.user.activeCompany.id;
    const code = `USR-W${Date.now().toString().slice(-6)}`;
    const email = `writer.${Date.now()}@example.test`;

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code,
        name: "User Writer 001",
        email,
        phone: "+00 00000 00999",
        password: "Writer001!Secure",
        status: "ACTIVE",
      })
      .expect(201);

    expect(created.body.success).toBe(true);
    expect(created.body.data).toMatchObject({
      code,
      name: "User Writer 001",
      email,
      status: "ACTIVE",
    });
    expect(created.body.data).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(created.body)).not.toContain("passwordHash");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2/);
    expect(stored.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId, status: "ACTIVE" }),
      ]),
    );
    expect(stored.memberships).toHaveLength(1);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "USER_CREATE",
        entityType: "USER",
        entityId: stored.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toMatchObject({
      userId: admin.user.id,
      action: "USER_CREATE",
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain("password");
  });

  it("rejects create without users:write permission", async () => {
    const regular = await loginAs("user001@example.test", "User001!Secure");
    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${regular.accessToken}`)
      .send({
        code: "USR-DENIED",
        name: "Denied User",
        email: "denied.user@example.test",
        password: "Denied001!Secure",
      })
      .expect(403);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await prisma.user.findUnique({
        where: { email: "denied.user@example.test" },
      }),
    ).toBeNull();
  });

  it("rejects cross-tenant create and update attempts", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company1 = admin.user.activeCompany;
    const company2 = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(company2).toBeTruthy();

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        code: `USR-C1${Date.now().toString().slice(-5)}`,
        name: "Company 001 Only",
        email: `c1.only.${Date.now()}@example.test`,
        password: "Company1001!Secure",
      })
      .expect(201);
    const createdUserId = created.body.data.id as string;

    const memberships = await prisma.userCompany.findMany({
      where: { userId: createdUserId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.tenantId).toBe(company1.id);

    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyId: company2!.id })
      .expect(200);
    const company2Token = switched.body.data.accessToken as string;

    await request(app)
      .patch(`/api/v1/users/${createdUserId}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .send({ name: "Hijacked Name" })
      .expect(404);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: createdUserId },
    });
    expect(after.fullName).toBe("Company 001 Only");

    // Body tenant ids are ignored; membership always uses JWT tenant context.
    const forged = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${company2Token}`)
      .send({
        code: `USR-C2${Date.now().toString().slice(-5)}`,
        name: "Forged Tenant Body",
        email: `forged.${Date.now()}@example.test`,
        password: "Forged001!Secure",
        tenantId: company1.id,
        companyId: company1.id,
      })
      .expect(201);
    const forgedId = forged.body.data.id as string;
    const forgedMemberships = await prisma.userCompany.findMany({
      where: { userId: forgedId },
    });
    expect(forgedMemberships).toHaveLength(1);
    expect(forgedMemberships[0]?.tenantId).toBe(company2!.id);
  });

  it("returns 409 for duplicate email via Prisma P2002 mapping", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        code: `USR-DUP${Date.now().toString().slice(-5)}`,
        name: "Duplicate Email",
        email: "admin001@example.test",
        password: "Duplicate001!Secure",
      })
      .expect(409);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "CONFLICT",
        message: "A record with these details already exists",
      },
    });
  });

  it("updates a tenant member and writes a USER_UPDATE audit event", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const token = admin.accessToken;
    const email = `patch.${Date.now()}@example.test`;
    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: `USR-P${Date.now().toString().slice(-6)}`,
        name: "Before Patch",
        email,
        password: "Before001!Secure",
      })
      .expect(201);

    const updated = await request(app)
      .patch(`/api/v1/users/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "After Patch", phone: "+00 11111 22222" })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      name: "After Patch",
      phone: "+00 11111 22222",
      email,
    });
    expect(updated.body.data).not.toHaveProperty("passwordHash");

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId: admin.user.activeCompany.id,
        action: "USER_UPDATE",
        entityId: created.body.data.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toMatchObject({
      userId: admin.user.id,
      entityType: "USER",
    });
    expect(JSON.stringify(audit?.metadata)).not.toMatch(/passwordHash|argon2/i);
  });
});
