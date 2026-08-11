import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DelegationService } from "../src/modules/delegation/service.js";

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

describe("approver delegation", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let userToken: string;
  let userId: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = admin.body.data.accessToken as string;
    adminUserId = admin.body.data.user.id as string;
    tenantId = admin.body.data.user.activeCompany.id as string;
    const user = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    userToken = user.body.data.accessToken as string;
    userId = user.body.data.user.id as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates, lists and revokes a delegation with audit events", async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    const created = await request(app)
      .post("/api/v1/delegations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        delegateUserId: userId,
        startsAt,
        endsAt,
        reason: "Out of office for board week",
      })
      .expect(201);

    expect(created.body.data.delegate.id).toBe(userId);
    expect(created.body.data.delegator.id).toBe(adminUserId);

    const list = await request(app)
      .get("/api/v1/delegations")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (list.body.data as { id: string }[]).some(
        (row) => row.id === created.body.data.id,
      ),
    ).toBe(true);

    const service = new DelegationService(prisma);
    await expect(
      service.mayActAsApprover(tenantId, adminUserId, userId),
    ).resolves.toBe(true);
    await expect(
      service.mayActAsApprover(tenantId, adminUserId, adminUserId),
    ).resolves.toBe(true);

    await request(app)
      .post(`/api/v1/delegations/${created.body.data.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    await expect(
      service.mayActAsApprover(tenantId, adminUserId, userId),
    ).resolves.toBe(false);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "APPROVER_DELEGATION_CREATE",
        entityId: created.body.data.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses self-delegation", async () => {
    const response = await request(app)
      .post("/api/v1/delegations")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        delegateUserId: userId,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(400);
    expect(response.body.error.code).toBe("DELEGATION_SELF_FORBIDDEN");
  });

  it("refuses a delegate outside the company", async () => {
    const outsider = await prisma.user.create({
      data: {
        code: `OUT-DEL-${randomUUID().slice(0, 8)}`,
        email: `out-del-${randomUUID()}@example.test`,
        fullName: "Outside Delegate",
        passwordHash: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "admin001@example.test" },
            select: { passwordHash: true },
          })
        ).passwordHash,
        status: "ACTIVE",
      },
    });
    const response = await request(app)
      .post("/api/v1/delegations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        delegateUserId: outsider.id,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(400);
    expect(response.body.error.code).toBe("RELATED_RECORD_INVALID");
  });
});
