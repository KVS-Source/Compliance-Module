import { randomUUID } from "node:crypto";
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

describe("dashboard summary", () => {
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
      user: {
        id: string;
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  const summary = async (token: string) =>
    (
      await request(app)
        .get("/api/v1/dashboard/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.data;

  it("scopes operational counts to the authenticated Company", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    if (!company2) throw new Error("COM-002 fixture is unavailable");
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyId: company2.id })
      .expect(200);
    const company2Token = switched.body.data.accessToken as string;
    const [company1Before, company2Before] = await Promise.all([
      summary(admin.accessToken),
      summary(company2Token),
    ]);
    const definition = await prisma.kpiDefinition.findUniqueOrThrow({
      where: { code: "KPI-001" },
    });
    const productService = `dashboard-isolation-${randomUUID()}`;
    const created = await request(app)
      .post("/api/v1/kpi-configurations")
      .set("Authorization", `Bearer ${company2Token}`)
      .send({
        kpiDefinitionId: definition.id,
        productService,
        ownerId: admin.user.id,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: "2026-07-01",
        enabled: true,
        requiresEvidence: false,
        requiresApproval: true,
      })
      .expect(201);

    try {
      const [company1After, company2After] = await Promise.all([
        summary(admin.accessToken),
        summary(company2Token),
      ]);
      expect(company1After.kpis.activeConfigurations).toBe(
        company1Before.kpis.activeConfigurations,
      );
      expect(company2After.kpis.activeConfigurations).toBe(
        company2Before.kpis.activeConfigurations + 1,
      );
    } finally {
      await prisma.kpiConfiguration.delete({
        where: { id: created.body.data.id as string },
      });
    }
  });

  it("does not disclose restricted risk aggregates", async () => {
    const user = await login("user001@example.test", "User001!Secure");
    const data = await summary(user.accessToken);
    expect(data.kpis).not.toBeNull();
    expect(data.organisation).not.toBeNull();
    expect(data.frameworks).not.toBeNull();
    expect(data.risks).toBeNull();
  });
});
