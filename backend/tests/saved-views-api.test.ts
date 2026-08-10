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

describe("saved views API", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let userToken: string;
  let companyTwoToken: string;
  let companyOneId: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = admin.body.data.accessToken as string;
    companyOneId = admin.body.data.user.activeCompany.id as string;
    const companyTwo = admin.body.data.user.companies.find(
      (company: { code: string }) => company.code === "COM-002",
    );
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ companyId: companyTwo.id })
      .expect(200);
    companyTwoToken = switched.body.data.accessToken as string;

    const user = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    userToken = user.body.data.accessToken as string;
  });

  afterAll(async () => prisma.$disconnect());

  const create = (token = adminToken, name = "Overdue critical gaps") =>
    request(app)
      .post("/api/v1/saved-views")
      .set("Authorization", `Bearer ${token}`)
      .send({
        registerKey: "GAPS",
        name,
        query: {
          severity: "CRITICAL",
          overdue: "true",
          orderBy: "dueDate",
          order: "asc",
        },
      });

  it("persists exact filter and sort state and audits CRUD", async () => {
    const created = await create().expect(201);
    expect(created.body.data.query).toEqual({
      severity: "CRITICAL",
      overdue: "true",
      orderBy: "dueDate",
      order: "asc",
    });

    const listed = await request(app)
      .get("/api/v1/saved-views?registerKey=GAPS")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({
        id: created.body.data.id,
        name: "Overdue critical gaps",
        query: created.body.data.query,
      }),
    ]);

    await request(app)
      .patch(`/api/v1/saved-views/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Critical overdue gaps" })
      .expect(200);
    await request(app)
      .delete(`/api/v1/saved-views/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const audit = await prisma.auditEvent.findMany({
      where: { tenantId: companyOneId, entityId: created.body.data.id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "SAVED_VIEW_CREATED",
      "SAVED_VIEW_UPDATED",
      "SAVED_VIEW_DELETED",
    ]);
  });

  it("keeps views private between users in the same Company", async () => {
    const created = await create(adminToken, "Admin only view").expect(201);
    const userList = await request(app)
      .get("/api/v1/saved-views?registerKey=GAPS")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(200);
    expect(userList.body.data).toEqual([]);
    await request(app)
      .delete(`/api/v1/saved-views/${created.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`)
      .expect(404);
  });

  it("refuses cross-Company mutation and validates the boundary", async () => {
    const foreign = await create(companyTwoToken, "Company 002 view").expect(201);
    await request(app)
      .patch(`/api/v1/saved-views/${foreign.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Cross Company rewrite" })
      .expect(404);
    await create(adminToken, "Bad query")
      .send({ registerKey: "GAPS", name: "Bad query", query: { page: 3 } })
      .expect(400);
    await request(app)
      .get("/api/v1/saved-views?registerKey=UNKNOWN")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });
});
