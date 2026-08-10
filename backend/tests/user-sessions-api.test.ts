import { randomUUID } from "node:crypto";
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

describe("user session management", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminAgent: ReturnType<typeof request.agent>;
  let adminUserId: string;
  let company001Id: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    adminAgent = request.agent(app);
    const login = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminUserId = login.body.data.user.id as string;
    company001Id = login.body.data.user.activeCompany.id as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const authHeader = async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    return `Bearer ${login.body.data.accessToken as string}`;
  };

  it("lists the caller's live session and marks the current family", async () => {
    // One login so the access token's sessionFamilyId matches the cookie family.
    const login = await request
      .agent(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    const token = login.body.data.accessToken as string;

    const sessions = await request(app)
      .get(`/api/v1/users/${adminUserId}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(sessions.body.data)).toBe(true);
    expect(sessions.body.data.length).toBeGreaterThan(0);
    const current = sessions.body.data.filter(
      (session: { current: boolean }) => session.current,
    );
    expect(current.length).toBe(1);
    expect(current[0]).toMatchObject({
      id: expect.any(String),
      createdAt: expect.any(String),
      lastUsedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    // Token material must never appear in the response.
    expect(JSON.stringify(sessions.body.data)).not.toMatch(
      /tokenHash|refreshToken/i,
    );
  });

  it("revokes one foreign session without ending the administrator's own", async () => {
    const unique = randomUUID().slice(0, 8);
    const password = "SessionMgmt1!Secure";
    const create = await request(app)
      .post("/api/v1/users")
      .set("Authorization", await authHeader())
      .send({
        code: `SES-${unique}`,
        name: "Session Target",
        email: `session-${unique}@example.test`,
        password,
        status: "ACTIVE",
      })
      .expect(201);
    const targetId = create.body.data.id as string;

    // Give the target a live session in Company 001.
    const targetAgent = request.agent(app);
    await targetAgent
      .post("/api/v1/auth/login")
      .send({ email: `session-${unique}@example.test`, password })
      .expect(200);

    const listed = await request(app)
      .get(`/api/v1/users/${targetId}/sessions`)
      .set("Authorization", await authHeader())
      .expect(200);
    expect(listed.body.data.length).toBeGreaterThanOrEqual(1);
    const familyId = listed.body.data[0].id as string;

    await request(app)
      .post(`/api/v1/users/${targetId}/sessions/${familyId}/revoke`)
      .set("Authorization", await authHeader())
      .expect(200);

    const after = await request(app)
      .get(`/api/v1/users/${targetId}/sessions`)
      .set("Authorization", await authHeader())
      .expect(200);
    expect(after.body.data.every((session: { id: string }) => session.id !== familyId)).toBe(
      true,
    );

    // Target refresh must fail once the family is revoked.
    await targetAgent.post("/api/v1/auth/refresh").expect(401);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId: company001Id,
        action: "USER_SESSION_REVOKE",
        entityId: targetId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ familyId, scope: "single" });
  });

  it("revokes every live session for a user with one audit summary", async () => {
    const unique = randomUUID().slice(0, 8);
    const password = "SessionMgmt2!Secure";
    const create = await request(app)
      .post("/api/v1/users")
      .set("Authorization", await authHeader())
      .send({
        code: `SEA-${unique}`,
        name: "Session All Target",
        email: `session-all-${unique}@example.test`,
        password,
        status: "ACTIVE",
      })
      .expect(201);
    const targetId = create.body.data.id as string;

    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA
      .post("/api/v1/auth/login")
      .send({ email: `session-all-${unique}@example.test`, password })
      .expect(200);
    await agentB
      .post("/api/v1/auth/login")
      .send({ email: `session-all-${unique}@example.test`, password })
      .expect(200);

    const before = await request(app)
      .get(`/api/v1/users/${targetId}/sessions`)
      .set("Authorization", await authHeader())
      .expect(200);
    expect(before.body.data.length).toBeGreaterThanOrEqual(2);

    const result = await request(app)
      .post(`/api/v1/users/${targetId}/sessions/revoke-all`)
      .set("Authorization", await authHeader())
      .expect(200);
    expect(result.body.data.sessionCount).toBeGreaterThanOrEqual(2);

    const after = await request(app)
      .get(`/api/v1/users/${targetId}/sessions`)
      .set("Authorization", await authHeader())
      .expect(200);
    expect(after.body.data).toEqual([]);

    await agentA.post("/api/v1/auth/refresh").expect(401);
    await agentB.post("/api/v1/auth/refresh").expect(401);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId: company001Id,
        action: "USER_SESSION_REVOKE_ALL",
        entityId: targetId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ scope: "all" });
  });

  it("refuses cross-Company session access and unauthenticated calls", async () => {
    await request(app).get(`/api/v1/users/${adminUserId}/sessions`).expect(401);

    const foreign = await prisma.user.findFirst({
      where: {
        memberships: {
          some: { tenant: { code: "COMPANY_002" }, status: "ACTIVE" },
        },
        NOT: {
          memberships: {
            some: { tenantId: company001Id, status: "ACTIVE" },
          },
        },
      },
      select: { id: true },
    });
    if (!foreign) return;

    await request(app)
      .get(`/api/v1/users/${foreign.id}/sessions`)
      .set("Authorization", await authHeader())
      .expect(404);
  });
});
