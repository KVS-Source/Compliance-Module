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

describe("List orderBy allowlist and owner filters", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let otherUserId: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = login.body.data.accessToken as string;
    adminUserId = login.body.data.user.id as string;
    tenantId = login.body.data.user.activeCompany.id as string;

    const other = await prisma.user.findFirstOrThrow({
      where: {
        email: "user001@example.test",
        memberships: { some: { tenantId } },
      },
      select: { id: true },
    });
    otherUserId = other.id;
  });

  afterAll(async () => prisma.$disconnect());

  it("accepts allowlisted orderBy and rejects unknown columns", async () => {
    await request(app)
      .get("/api/v1/gaps")
      .query({ orderBy: "dueDate", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const rejected = await request(app)
      .get("/api/v1/gaps")
      .query({ orderBy: "passwordHash", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    expect(rejected.body.success).toBe(false);

    await request(app)
      .get("/api/v1/risks")
      .query({ orderBy: "generalLevel", order: "desc" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .get("/api/v1/risks")
      .query({ orderBy: "notAColumn" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("owner-filtered gap and risk lists stay tenant-scoped and owner-only", async () => {
    // Create two gaps with different owners under the admin tenant.
    const mine = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Owner filter mine ${Date.now()}`,
        severity: "MINOR",
        ownerId: adminUserId,
      })
      .expect(201);
    const theirs = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Owner filter theirs ${Date.now()}`,
        severity: "MINOR",
        ownerId: otherUserId,
      })
      .expect(201);

    const listed = await request(app)
      .get("/api/v1/gaps")
      .query({ ownerId: adminUserId, pageSize: 100 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const ids = (listed.body.data as Array<{ id: string; owner: { id: string } | null }>).map(
      (row) => row.id,
    );
    expect(ids).toContain(mine.body.data.id);
    expect(ids).not.toContain(theirs.body.data.id);
    for (const row of listed.body.data as Array<{ owner: { id: string } | null }>) {
      if (row.owner) expect(row.owner.id).toBe(adminUserId);
    }

    // Cross-tenant owner id still returns only rows for the active company.
    const foreignUser = await prisma.user.create({
      data: {
        code: `X-OWNER-${Date.now()}`,
        email: `x-owner-${Date.now()}@example.test`,
        fullName: "Foreign Owner",
        passwordHash: "not-used",
        status: "ACTIVE",
      },
    });
    const cross = await request(app)
      .get("/api/v1/gaps")
      .query({ ownerId: foreignUser.id, pageSize: 100 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(cross.body.data).toEqual([]);
    await prisma.user.delete({ where: { id: foreignUser.id } });
  });
});
