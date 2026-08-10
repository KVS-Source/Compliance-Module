import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { isFrameworkActiveInScope } from "../src/modules/dashboard/framework-scope.js";

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

/**
 * The dashboard analytics section.
 *
 * These assertions are about provenance, not about particular numbers: the
 * fixture may grow, but every figure must still be a query against the
 * authenticated Company's rows, and a section the caller may not read must
 * come back `null` rather than as a zero.
 */
describe("dashboard analytics", () => {
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
        activeCompany: { id: string; code: string };
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  const analytics = async (token: string) =>
    (
      await request(app)
        .get("/api/v1/dashboard/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.data.analytics;

  const switchCompany = async (token: string, companyId: string) =>
    (
      await request(app)
        .post("/api/v1/auth/tenant-context")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId })
        .expect(200)
    ).body.data.accessToken as string;

  it("requires authentication", async () => {
    await request(app).get("/api/v1/dashboard/summary").expect(401);
  });

  it("returns every required summary card", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const { cards } = await analytics(admin.accessToken);
    for (const key of [
      "kpiDefinitions",
      "activeKpiConfigurations",
      "measuredKpis",
      "kpisMeetingTarget",
      "kpisMissingTarget",
      "pendingEvidence",
      "openRisks",
      "openGaps",
      "openCapas",
      "policiesDueForReview",
    ]) {
      expect(cards, `card ${key}`).toHaveProperty(key);
      expect(typeof cards[key]).toBe("number");
    }
    expect(cards.kpisMissingTarget).toBe(
      cards.measuredKpis - cards.kpisMeetingTarget,
    );
  });

  it("returns every required visualisation section", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const section = await analytics(admin.accessToken);
    expect(Array.isArray(section.kpiTrend)).toBe(true);
    expect(Array.isArray(section.evidenceStatus)).toBe(true);
    expect(Array.isArray(section.frameworkCompliance)).toBe(true);
    expect(Array.isArray(section.capaAging)).toBe(true);
    expect(Array.isArray(section.recentKpiRisks)).toBe(true);
    expect(Array.isArray(section.capasDueSoon)).toBe(true);
    expect(Array.isArray(section.actionQueue)).toBe(true);
    expect(section.riskHeatMap).toHaveProperty("cells");
    expect(section.policiesDueForReview).toHaveProperty("total");
    expect(section.genrac).toHaveProperty("configured");
  });

  it("never claims live GenRAC access, and does not create a connection row", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const before = await prisma.externalSystemConnection.count();
    const { genrac } = await analytics(admin.accessToken);
    expect(genrac.liveAccess).toBe(false);
    if (!genrac.configured) expect(genrac.status).toBe("NOT_CONFIGURED");
    // Reading a dashboard must not write. The integration page creates the
    // placeholder connection; the dashboard reports its absence truthfully.
    expect(await prisma.externalSystemConnection.count()).toBe(before);
  });

  it("reports a framework with no mapped control as unscored rather than zero", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const { frameworkCompliance } = await analytics(admin.accessToken);
    for (const row of frameworkCompliance) {
      expect(isFrameworkActiveInScope(row.scopeStatus)).toBe(true);
      if (row.mappedControls === 0) {
        expect(row.compliancePercentage).toBeNull();
      } else {
        expect(row.compliancePercentage).toBeGreaterThanOrEqual(0);
        expect(row.compliancePercentage).toBeLessThanOrEqual(100);
        expect(row.implementedControls).toBeLessThanOrEqual(row.mappedControls);
      }
    }
  });

  it("derives every trend period from a real KPI actual", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const { kpiTrend } = await analytics(admin.accessToken);
    const tenantId = admin.user.activeCompany.id;
    for (const point of kpiTrend) {
      expect(point.meetingTarget).toBeLessThanOrEqual(point.measured);
      expect(point.measured).toBeGreaterThan(0);
      const rows = await prisma.kpiActual.count({
        where: { tenantId, period: point.period, deletedAt: null },
      });
      expect(rows, `period ${point.period}`).toBeGreaterThan(0);
    }
  });

  it("counts risk heat-map cells only from this Company's open risks", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const { riskHeatMap } = await analytics(admin.accessToken);
    const open = await prisma.risk.count({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
    });
    expect(riskHeatMap.total).toBe(open);
    expect(
      riskHeatMap.cells.reduce(
        (sum: number, cell: { count: number }) => sum + cell.count,
        0,
      ),
    ).toBe(open);
  });

  it("buckets every open CAPA exactly once", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const { capaAging } = await analytics(admin.accessToken);
    const open = await prisma.capa.count({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
    });
    expect(
      capaAging.reduce(
        (sum: number, bucket: { count: number }) => sum + bucket.count,
        0,
      ),
    ).toBe(open);
  });

  it("agrees with the Evidence register it summarises", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const { evidenceStatus } = await analytics(admin.accessToken);
    const total = await prisma.evidence.count({ where: { tenantId } });
    expect(
      evidenceStatus.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0,
      ),
    ).toBe(total);
  });

  it("isolates every analytics figure to the authenticated Company", async () => {
    const admin = await login("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(({ code }) => code === "COM-002");
    if (!company2) throw new Error("COM-002 fixture is unavailable");
    const otherToken = await switchCompany(admin.accessToken, company2.id);
    const [first, second] = await Promise.all([
      analytics(admin.accessToken),
      analytics(otherToken),
    ]);
    const [risksOne, risksTwo, capasOne, capasTwo, evidenceOne, evidenceTwo] =
      await Promise.all([
        prisma.risk.count({
          where: {
            tenantId: admin.user.activeCompany.id,
            deletedAt: null,
            status: { notIn: ["CLOSED", "ARCHIVED"] },
          },
        }),
        prisma.risk.count({
          where: {
            tenantId: company2.id,
            deletedAt: null,
            status: { notIn: ["CLOSED", "ARCHIVED"] },
          },
        }),
        prisma.capa.count({
          where: {
            tenantId: admin.user.activeCompany.id,
            deletedAt: null,
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
        }),
        prisma.capa.count({
          where: {
            tenantId: company2.id,
            deletedAt: null,
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
        }),
        prisma.evidence.count({
          where: { tenantId: admin.user.activeCompany.id },
        }),
        prisma.evidence.count({ where: { tenantId: company2.id } }),
      ]);
    expect(first.riskHeatMap.total).toBe(risksOne);
    expect(second.riskHeatMap.total).toBe(risksTwo);
    expect(first.cards.openCapas).toBe(capasOne);
    expect(second.cards.openCapas).toBe(capasTwo);
    expect(
      first.evidenceStatus.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0,
      ),
    ).toBe(evidenceOne);
    expect(
      second.evidenceStatus.reduce(
        (sum: number, row: { count: number }) => sum + row.count,
        0,
      ),
    ).toBe(evidenceTwo);
  });

  it("withholds a section the caller may not read instead of returning zero", async () => {
    // COMPANY_USER holds the read permissions but not `risk:read`, so the
    // risk sections must be withheld rather than reported as empty. A zero
    // would assert "no open risks", which is a claim this role never made.
    const reader = await login("user001@example.test", "User001!Secure");
    const section = await analytics(reader.accessToken);
    expect(section.riskHeatMap).toBeNull();
    expect(section.recentKpiRisks).toBeNull();
    expect(section.cards.openRisks).toBeNull();
    expect(section.kpiTrend).not.toBeNull();
    expect(section.evidenceStatus).not.toBeNull();
    expect(section.capaAging).not.toBeNull();
    for (const item of section.actionQueue) {
      expect(item.count).toBeGreaterThan(0);
    }
  });
});
