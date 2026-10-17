import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { findForbiddenSecretPaths } from "./secret-safe-assertions.js";
import { hashPassword } from "../src/common/security/password.js";
import { UsersRepository } from "../src/modules/users/repository.js";

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

  const createRecoverySubject = async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const suffix = randomUUID().slice(0, 8);
    const email = `recovery.${suffix}@example.test`;
    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        code: `REC-${suffix}`,
        name: "Recovery Subject",
        email,
        password: "Recovery001!Secure",
      })
      .expect(201);
    return { admin, id: created.body.data.id as string, email };
  };

  const sessionFor = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Recovery001!Secure" })
      .expect(200);
    const cookie = (response.headers["set-cookie"] as unknown as string[])
      .find((value) => value.startsWith("genbioca_refresh="))
      ?.split(";")[0];
    if (!cookie) throw new Error("Expected a refresh cookie");
    return { token: response.body.data.accessToken as string, cookie };
  };

  it("revokes refresh sessions across Companies when an administrator resets a password", async () => {
    const { admin, id, email } = await createRecoverySubject();
    const otherCompany = admin.user.companies.find(
      (company) => company.code === "COM-002",
    )!;
    await prisma.userCompany.create({
      data: { userId: id, tenantId: otherCompany.id, status: "ACTIVE" },
    });
    const first = await sessionFor(email);
    const second = await sessionFor(email);
    const switchedSession = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${second.token}`)
      .set("Cookie", second.cookie)
      .send({ companyId: otherCompany.id })
      .expect(200);
    const otherCompanyCookie = (
      switchedSession.headers["set-cookie"] as unknown as string[]
    )
      .find((value) => value.startsWith("genbioca_refresh="))
      ?.split(";")[0];
    if (!otherCompanyCookie)
      throw new Error("Expected a Company refresh cookie");
    const liveBefore = await prisma.refreshToken.count({
      where: { userId: id, revokedAt: null },
    });
    expect(liveBefore).toBe(2);
    const otherUsersBefore = await prisma.refreshToken.count({
      where: { userId: { not: id }, revokedAt: null },
    });

    const updated = await request(app)
      .patch(`/api/v1/users/${id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ password: "Recovered001!Secure" })
      .expect(200);
    expect(findForbiddenSecretPaths(updated.body)).toEqual([]);
    expect(
      await prisma.refreshToken.count({
        where: { userId: id, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.refreshToken.count({
        where: { userId: { not: id }, revokedAt: null },
      }),
    ).toBe(otherUsersBefore);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", first.cookie)
      .expect(401);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", otherCompanyCookie)
      .expect(401);
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Recovery001!Secure" })
      .expect(401);
    await loginAs(email, "Recovered001!Secure");

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: id, action: "USER_UPDATE" },
    });
    expect(audit.metadata).toMatchObject({
      passwordChanged: true,
      refreshTokensRevoked: liveBefore,
    });
    expect(findForbiddenSecretPaths(audit.metadata)).toEqual([]);
  });

  it("keeps sessions when only profile details are updated", async () => {
    const { admin, id, email } = await createRecoverySubject();
    const session = await sessionFor(email);
    await request(app)
      .patch(`/api/v1/users/${id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ name: "Updated Recovery Subject" })
      .expect(200);
    expect(
      await prisma.refreshToken.count({
        where: { userId: id, revokedAt: null },
      }),
    ).toBe(1);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", session.cookie)
      .expect(200);
  });

  it("refuses unauthorized and cross-Company password resets without revoking sessions", async () => {
    const { admin, id, email } = await createRecoverySubject();
    const regular = await loginAs("user001@example.test", "User001!Secure");
    const session = await sessionFor(email);
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    await request(app)
      .patch(`/api/v1/users/${id}`)
      .set("Authorization", `Bearer ${regular.accessToken}`)
      .send({ password: "Refused001!Secure" })
      .expect(403);
    const otherCompany = admin.user.companies.find(
      (company) => company.code === "COM-002",
    )!;
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyId: otherCompany.id })
      .expect(200);
    await request(app)
      .patch(`/api/v1/users/${id}`)
      .set("Authorization", `Bearer ${String(switched.body.data.accessToken)}`)
      .send({ password: "Refused002!Secure" })
      .expect(404);
    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordHash === before.passwordHash).toBe(true);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: id, action: "USER_UPDATE" },
      }),
    ).toBe(0);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", session.cookie)
      .expect(200);
  });

  it("rolls back the password and revocation if the same update cannot complete", async () => {
    const { admin, id, email } = await createRecoverySubject();
    const session = await sessionFor(email);
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    const repository = new UsersRepository(prisma);
    let refused = false;
    try {
      await repository.updateInTenant(
        id,
        admin.user.activeCompany.id,
        admin.user.id,
        {
          passwordHash: await hashPassword("RolledBack001!Secure"),
          departmentId: randomUUID(),
        },
        {},
      );
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordHash === before.passwordHash).toBe(true);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: id, action: "USER_UPDATE" },
      }),
    ).toBe(0);
    expect(
      await prisma.refreshToken.count({
        where: { userId: id, revokedAt: null },
      }),
    ).toBe(1);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", session.cookie)
      .expect(200);
    await loginAs(email, "Recovery001!Secure");
  });

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
    expect(findForbiddenSecretPaths(created.body)).toEqual([]);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    const passwordUsesArgon2 =
      typeof stored.passwordHash === "string" &&
      stored.passwordHash.startsWith("$argon2");
    expect(passwordUsesArgon2).toBe(true);
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
    expect(findForbiddenSecretPaths(audit?.metadata)).toEqual([]);
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
    expect(findForbiddenSecretPaths(updated.body)).toEqual([]);

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
    expect(findForbiddenSecretPaths(audit?.metadata)).toEqual([]);
    const auditContainsArgon2Material = JSON.stringify(audit?.metadata)
      .toLowerCase()
      .includes("argon2");
    expect(auditContainsArgon2Material).toBe(false);
  });
});
