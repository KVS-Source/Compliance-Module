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
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

describe("record comments", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let readerToken: string;
  let company001Id: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = admin.body.data.accessToken as string;
    adminUserId = admin.body.data.user.id as string;
    company001Id = admin.body.data.user.activeCompany.id as string;

    // COMPANY_USER holds gaps:read but not gaps:write — the read-only case.
    const reader = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    readerToken = reader.body.data.accessToken as string;
  });

  afterAll(async () => prisma.$disconnect());

  const createGap = async (title: string) => {
    const response = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title,
        description: "Raised by the comment suite.",
        severity: "MINOR",
        source: "Internal Audit",
        dueDate: "2026-12-31",
      })
      .expect(201);
    return response.body.data.id as string;
  };

  const post = (gapId: string, body: string, token = adminToken) =>
    request(app)
      .post(`/api/v1/records/GAP/${gapId}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body });

  const list = (gapId: string, token = adminToken) =>
    request(app)
      .get(`/api/v1/records/GAP/${gapId}/comments`)
      .set("Authorization", `Bearer ${token}`);

  it("adds comments and returns them oldest first with their author", async () => {
    const gapId = await createGap("Comment ordering");
    await post(gapId, "First observation").expect(201);
    await post(gapId, "Second observation").expect(201);

    const listed = await list(gapId).expect(200);
    expect(listed.body.data).toHaveLength(2);
    expect(
      listed.body.data.map((comment: { body: string }) => comment.body),
    ).toEqual(["First observation", "Second observation"]);
    expect(listed.body.data[0].author).toMatchObject({
      id: adminUserId,
      code: expect.any(String),
      name: expect.any(String),
    });
  });

  it("writes one audit event per comment without copying the body", async () => {
    const gapId = await createGap("Comment audit");
    const response = await post(gapId, "Sensitive remediation detail").expect(
      201,
    );
    const commentId = response.body.data.id as string;

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId: company001Id,
        action: "RECORD_COMMENT_ADD",
        entityType: "GAP",
        entityId: gapId,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ commentId });
    // The prose lives in the protected table, not duplicated into metadata.
    expect(JSON.stringify(audit?.metadata)).not.toContain(
      "Sensitive remediation detail",
    );
  });

  it("lets a read-only holder follow the conversation but not join it", async () => {
    const gapId = await createGap("Comment permissions");
    await post(gapId, "Admin note").expect(201);

    await list(gapId, readerToken).expect(200);
    await post(gapId, "Reader note", readerToken).expect(403);
  });

  it("refuses a record that belongs to another Company", async () => {
    const foreignGap = await prisma.gap.findFirst({
      where: { tenantId: { not: company001Id }, deletedAt: null },
      select: { id: true },
    });
    if (!foreignGap) {
      const otherTenant = await prisma.tenant.findFirstOrThrow({
        where: { id: { not: company001Id } },
        select: { id: true },
      });
      const planted = await prisma.gap.create({
        data: {
          tenantId: otherTenant.id,
          code: `GAP-FOREIGN-${Date.now()}`,
          title: "Foreign Company gap",
          severity: "MINOR",
          status: "OPEN",
          // Authorship is a plain user reference; the point of the row is that
          // it lives in another Company, not who raised it.
          createdById: adminUserId,
          updatedById: adminUserId,
        },
        select: { id: true },
      });
      await list(planted.id).expect(404);
      await post(planted.id, "Should not land").expect(404);
      await prisma.gap.delete({ where: { id: planted.id } });
      return;
    }
    await list(foreignGap.id).expect(404);
    await post(foreignGap.id, "Should not land").expect(404);
  });

  it("refuses an unknown entity type and a malformed id", async () => {
    const gapId = await createGap("Comment validation");
    await request(app)
      .get(`/api/v1/records/POLICY/${gapId}/comments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get("/api/v1/records/GAP/not-a-uuid/comments")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("refuses an empty comment and one beyond the length limit", async () => {
    const gapId = await createGap("Comment length");
    await post(gapId, "   ").expect(400);
    await post(gapId, "x".repeat(4001)).expect(400);
    await post(gapId, "x".repeat(4000)).expect(201);
  });

  it("exposes no edit or delete route", async () => {
    const gapId = await createGap("Comment immutability");
    const response = await post(gapId, "Cannot be rewritten").expect(201);
    const commentId = response.body.data.id as string;

    await request(app)
      .patch(`/api/v1/records/GAP/${gapId}/comments/${commentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Rewritten" })
      .expect(404);
    await request(app)
      .delete(`/api/v1/records/GAP/${gapId}/comments/${commentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("refuses mutation at the database even when the API is bypassed", async () => {
    const gapId = await createGap("Comment trigger");
    const response = await post(gapId, "Protected by trigger").expect(201);
    const commentId = response.body.data.id as string;

    // The append-only guarantee must not depend on the absence of a route.
    await expect(
      prisma.recordComment.update({
        where: { id: commentId },
        data: { body: "Rewritten behind the API" },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.recordComment.delete({ where: { id: commentId } }),
    ).rejects.toThrow(/append-only/);

    const still = await prisma.recordComment.findUniqueOrThrow({
      where: { id: commentId },
    });
    expect(still.body).toBe("Protected by trigger");
  });

  it("requires authentication", async () => {
    const gapId = await createGap("Comment auth");
    await request(app).get(`/api/v1/records/GAP/${gapId}/comments`).expect(401);
    await request(app)
      .post(`/api/v1/records/GAP/${gapId}/comments`)
      .send({ body: "Anonymous" })
      .expect(401);
  });
});
