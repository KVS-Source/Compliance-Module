import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signAccessToken } from "../src/common/security/tokens.js";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error("Integration tests must run through the isolated test-database runner");
}

describe("tasks API", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let readToken: string;
  let companyOneId: string;
  let adminId: string;
  let gapId: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = admin.body.data.accessToken as string;
    companyOneId = admin.body.data.user.activeCompany.id as string;
    adminId = admin.body.data.user.id as string;
    readToken = signAccessToken({
      sub: adminId,
      tenantId: companyOneId,
      permissions: ["registers:read"],
    });
    const gap = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Task link Gap",
        severity: "MINOR",
        dueDate: "2026-12-31",
      })
      .expect(201);
    gapId = gap.body.data.id as string;
  });

  afterAll(async () => prisma.$disconnect());

  const create = (linkedEntityId = gapId) =>
    request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Review critical gap remediation",
        description: "Confirm the agreed action is complete.",
        dueDate: "2026-12-31",
        ownerId: adminId,
        linkedEntityType: "GAP",
        linkedEntityId,
      });

  it("creates, lists, updates and deletes a governed linked task", async () => {
    const created = await create().expect(201);
    expect(created.body.data).toMatchObject({
      title: "Review critical gap remediation",
      status: "TODO",
      linked: { type: "GAP", id: gapId },
    });
    const id = created.body.data.id as string;

    const listed = await request(app)
      .get("/api/v1/tasks?status=TODO&orderBy=dueDate&order=asc")
      .set("Authorization", `Bearer ${readToken}`)
      .expect(200);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${readToken}`)
      .send({
        title: "Forbidden",
        linkedEntityType: "GAP",
        linkedEntityId: gapId,
      })
      .expect(403);

    const updated = await request(app)
      .patch(`/api/v1/tasks/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "IN_PROGRESS", dueDate: "2027-01-31" })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      status: "IN_PROGRESS",
      dueDate: "2027-01-31",
    });
    await request(app)
      .delete(`/api/v1/tasks/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const audit = await prisma.auditEvent.findMany({
      where: { tenantId: companyOneId, entityId: id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "TASK_CREATED",
      "TASK_UPDATED",
      "TASK_DELETED",
    ]);
  });

  it("refuses foreign links and hides foreign tasks from every path", async () => {
    const otherTenant = await prisma.tenant.findFirstOrThrow({
      where: { id: { not: companyOneId } },
      select: { id: true },
    });
    const foreignGap = await prisma.gap.create({
      data: {
        tenantId: otherTenant.id,
        code: `GAP-FOREIGN-${Date.now()}`,
        title: "Company 002 task link",
        severity: "MINOR",
        createdById: adminId,
        updatedById: adminId,
      },
      select: { id: true, tenantId: true },
    });
    await create(foreignGap.id).expect(400);

    const foreignTask = await prisma.task.create({
      data: {
        tenantId: foreignGap.tenantId,
        title: "Company 002 task",
        linkedEntityType: "GAP",
        linkedEntityId: foreignGap.id,
        createdById: adminId,
        updatedById: adminId,
      },
    });
    await request(app)
      .get(`/api/v1/tasks/${foreignTask.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
    await request(app)
      .patch(`/api/v1/tasks/${foreignTask.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Cross Company rewrite" })
      .expect(404);
    await request(app)
      .delete(`/api/v1/tasks/${foreignTask.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("validates request bodies and authentication", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Bad task",
        linkedEntityType: "GAP",
        linkedEntityId: gapId,
        tenantId: companyOneId,
      })
      .expect(400);
    await request(app).get("/api/v1/tasks").expect(401);
  });
});
