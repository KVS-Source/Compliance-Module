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

const SYSTEM_CODE = "GENRAC";
const CONCURRENT_REQUESTS = 12;

/**
 * GET /integrations/genrac/status creates this Company's NOT_CONFIGURED
 * placeholder on first use. That first load used to be a race: the read and
 * the insert were separate statements, so every concurrent request but one
 * failed the unique key and was surfaced as a 409.
 *
 * Opening the Integrations page in two tabs, or a browser replaying the request
 * on reconnect, was enough to hit it.
 */
describe("GenRAC status first-load concurrency", () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  const login = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: { id: string; activeCompany: { id: string; code: string } };
    };
  };

  /** Returns the Company to a genuine cold start for the next assertion. */
  const clearPlaceholder = async (tenantId: string) => {
    await prisma.externalSystemConnection.deleteMany({
      where: { tenantId, systemCode: SYSTEM_CODE },
    });
  };

  const tenantIdFor = async (code: string) => {
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { code } });
    return tenant.id;
  };

  it("answers every concurrent first request with 200 and creates exactly one placeholder", async () => {
    const session = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = await tenantIdFor("COM-001");
    await clearPlaceholder(tenantId);

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        request(app)
          .get("/api/v1/integrations/genrac/status")
          .set("Authorization", `Bearer ${session.accessToken}`),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(
      statuses,
      `every concurrent first load must be 200, saw ${JSON.stringify(statuses)}`,
    ).toEqual(Array.from({ length: CONCURRENT_REQUESTS }, () => 200));

    for (const response of responses) {
      expect(response.body.success).toBe(true);
      expect(response.body.data.connection.systemCode).toBe(SYSTEM_CODE);
      expect(response.body.data.connection.status).toBe("NOT_CONFIGURED");
    }

    // Every response must describe the same row, not one row per request.
    const ids = new Set(
      responses.map((response) => response.body.data.connection.id),
    );
    expect(ids.size).toBe(1);

    const rows = await prisma.externalSystemConnection.findMany({
      where: { tenantId, systemCode: SYSTEM_CODE },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tenantId);
  });

  it("stays deterministic across repeated cold starts", async () => {
    const session = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = await tenantIdFor("COM-001");

    for (let round = 0; round < 3; round += 1) {
      await clearPlaceholder(tenantId);

      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request(app)
            .get("/api/v1/integrations/genrac/status")
            .set("Authorization", `Bearer ${session.accessToken}`),
        ),
      );

      expect(
        responses.every((response) => response.status === 200),
        `round ${round} returned ${JSON.stringify(
          responses.map((response) => response.status),
        )}`,
      ).toBe(true);

      const rows = await prisma.externalSystemConnection.count({
        where: { tenantId, systemCode: SYSTEM_CODE },
      });
      expect(rows).toBe(1);
    }
  });

  it("keeps the placeholder scoped to the Company that asked for it", async () => {
    const session = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = await tenantIdFor("COM-001");
    await clearPlaceholder(tenantId);

    const other = await prisma.tenant.create({
      data: {
        name: "GenRAC Isolation Check",
        code: `GRC-${Date.now().toString().slice(-6)}`,
      },
    });

    try {
      await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request(app)
            .get("/api/v1/integrations/genrac/status")
            .set("Authorization", `Bearer ${session.accessToken}`)
            .expect(200),
        ),
      );

      // The concurrent first load must not have created a row for anyone else.
      const mine = await prisma.externalSystemConnection.count({
        where: { tenantId, systemCode: SYSTEM_CODE },
      });
      const theirs = await prisma.externalSystemConnection.count({
        where: { tenantId: other.id },
      });
      expect(mine).toBe(1);
      expect(theirs).toBe(0);
    } finally {
      await prisma.externalSystemConnection.deleteMany({
        where: { tenantId: other.id },
      });
      await prisma.tenant.delete({ where: { id: other.id } });
    }
  });

  it("reuses the existing row once the placeholder is warm", async () => {
    const session = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = await tenantIdFor("COM-001");
    await clearPlaceholder(tenantId);

    const first = await request(app)
      .get("/api/v1/integrations/genrac/status")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .expect(200);
    const createdAt = (
      await prisma.externalSystemConnection.findFirstOrThrow({
        where: { tenantId, systemCode: SYSTEM_CODE },
      })
    ).updatedAt;

    const warm = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        request(app)
          .get("/api/v1/integrations/genrac/status")
          .set("Authorization", `Bearer ${session.accessToken}`)
          .expect(200),
      ),
    );

    for (const response of warm) {
      expect(response.body.data.connection.id).toBe(
        first.body.data.connection.id,
      );
    }

    // Reading status must not rewrite the row it reads.
    const after = await prisma.externalSystemConnection.findFirstOrThrow({
      where: { tenantId, systemCode: SYSTEM_CODE },
    });
    expect(after.updatedAt.toISOString()).toBe(createdAt.toISOString());
    expect(
      await prisma.externalSystemConnection.count({
        where: { tenantId, systemCode: SYSTEM_CODE },
      }),
    ).toBe(1);
  });
});
