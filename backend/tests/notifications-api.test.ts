import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error("Integration tests must run through the isolated test-database runner");
}

describe("notifications API", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let userToken: string;
  let adminId: string;
  let userId: string;
  let companyOneId: string;
  let companyTwoId: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = admin.body.data.accessToken as string;
    adminId = admin.body.data.user.id as string;
    companyOneId = admin.body.data.user.activeCompany.id as string;
    companyTwoId = admin.body.data.user.companies.find(
      (company: { code: string }) => company.code === "COM-002",
    ).id as string;
    const user = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    userToken = user.body.data.accessToken as string;
    userId = user.body.data.user.id as string;
  });

  afterAll(async () => prisma.$disconnect());

  it("generates approval, ownership and overdue notifications without duplicates", async () => {
    const gap = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Overdue gap notification",
        severity: "CRITICAL",
        ownerId: adminId,
        dueDate: "2020-01-01",
      })
      .expect(201);

    const approvalCandidate = await prisma.evidence.create({
      data: {
        tenantId: companyOneId,
        code: `EVD-NOTIFY-${Date.now()}`,
        title: "Approval notification candidate",
        lifecycleStatus: "SUBMITTED",
        submittedById: userId,
        submittedAt: new Date(),
        createdById: userId,
        updatedById: userId,
      },
      select: { id: true },
    });

    const first = await request(app)
      .get("/api/v1/notifications?page=1&pageSize=50")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const source = first.body.data.items as Array<{
      id: string;
      kind: string;
      sourceId: string;
    }>;
    expect(source).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "OWNERSHIP_ASSIGNMENT", sourceId: gap.body.data.id }),
        expect.objectContaining({ kind: "OVERDUE_GAP", sourceId: gap.body.data.id }),
        expect.objectContaining({ kind: "APPROVAL_REQUEST", sourceId: approvalCandidate.id }),
      ]),
    );
    const before = await prisma.notification.count({
      where: { tenantId: companyOneId, userId: adminId },
    });
    await request(app)
      .get("/api/v1/notifications?page=1&pageSize=50")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      await prisma.notification.count({
        where: { tenantId: companyOneId, userId: adminId },
      }),
    ).toBe(before);
  });

  it("marks only the recipient's notification read and writes one audit event", async () => {
    const current = await request(app)
      .get("/api/v1/notifications?page=1&pageSize=20&unread=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const notificationId = current.body.data.items[0].id as string;

    await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({})
      .expect(404);
    const read = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(read.body.data.read).toBe(true);
    await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: companyOneId,
          action: "NOTIFICATION_READ",
          entityId: notificationId,
        },
      }),
    ).toBe(1);
  });

  it("refuses cross-Company reads and requires dashboard permission", async () => {
    const foreign = await prisma.notification.create({
      data: {
        tenantId: companyTwoId,
        userId: adminId,
        kind: "OWNERSHIP_ASSIGNMENT",
        title: "Company 002 notification",
        message: "Company 002 only",
        targetPath: "/tasks",
        sourceType: "TASK",
        sourceId: crypto.randomUUID(),
        dedupeKey: `foreign:${crypto.randomUUID()}`,
      },
    });
    await request(app)
      .patch(`/api/v1/notifications/${foreign.id}/read`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(404);
    await request(app)
      .get("/api/v1/notifications")
      .expect(401);
  });
});
