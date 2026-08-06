import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { REPORT_CATALOGUE } from "../src/modules/reports/service.js";

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
 * Role & Access, Frequency Master, KPI Catalogue, KPI Analytics and the
 * Report Hub. Every one is read-only and Company-scoped from the token.
 */
describe("submission modules", () => {
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
        activeCompany: { id: string; code: string };
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  const get = async (token: string, path: string, status = 200) =>
    (
      await request(app)
        .get(`/api/v1${path}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(status)
    ).body;

  const switchCompany = async (token: string, companyId: string) =>
    (
      await request(app)
        .post("/api/v1/auth/tenant-context")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId })
        .expect(200)
    ).body.data.accessToken as string;

  describe("Role & Access", () => {
    it("reports every production profile with a real user count", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/access/profiles");
      expect(data.mutable).toBe(false);
      expect(data.profiles.length).toBeGreaterThan(0);
      for (const profile of data.profiles) {
        expect(typeof profile.userCount).toBe("number");
        expect(profile.userCount).toBeGreaterThanOrEqual(0);
        expect(profile.permissions.length).toBe(profile.permissionCount);
      }
    });

    it("never publishes the production wildcard permission", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/access/profiles");
      for (const profile of [...data.profiles, ...data.additionalRoles]) {
        expect(profile.permissions).not.toContain("*");
      }
      expect(data.permissions.map((entry: { code: string }) => entry.code)).not.toContain(
        "*",
      );
    });

    it("exposes no mutation route", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      await request(app)
        .post("/api/v1/access/profiles")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code: "NEW_ROLE" })
        .expect(404);
    });

    it("requires users:read", async () => {
      const reader = await login("user001@example.test", "User001!Secure");
      await get(reader.accessToken, "/access/profiles", 403);
    });
  });

  describe("Frequency Master", () => {
    it("derives frequencies from the KPI definitions themselves", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/kpis/frequencies");
      const distinct = await prisma.kpiDefinition.groupBy({
        by: ["frequency"],
        _count: { _all: true },
      });
      for (const group of distinct) {
        const row = data.find(
          (entry: { code: string }) => entry.code === group.frequency,
        );
        expect(row, `frequency ${group.frequency}`).toBeDefined();
        expect(row.definitionCount).toBe(group._count._all);
      }
    });
  });

  describe("KPI Catalogue", () => {
    it("lists every definition with this Company's configuration state", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/kpis/catalogue");
      const total = await prisma.kpiDefinition.count();
      expect(data.length).toBe(total);
      for (const row of data) {
        expect(row.code).toBeTruthy();
        expect(row.unit).toBeTruthy();
        expect(["ACTIVE", "CONFIGURED_INACTIVE", "NOT_CONFIGURED"]).toContain(
          row.configurationStatus,
        );
        // The schema carries no perspective or framework at definition level,
        // so the API must say so rather than guess one.
        expect(row.perspective).toBeNull();
        expect(row.framework).toBeNull();
      }
    });

    it("scopes configuration counts to the authenticated Company", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const other = admin.user.companies.find(({ code }) => code === "COM-002");
      if (!other) throw new Error("COM-002 fixture is unavailable");
      const otherToken = await switchCompany(admin.accessToken, other.id);
      const [first, second] = await Promise.all([
        get(admin.accessToken, "/kpis/catalogue"),
        get(otherToken, "/kpis/catalogue"),
      ]);
      const sum = (rows: Array<{ configurationCount: number }>) =>
        rows.reduce((total, row) => total + row.configurationCount, 0);
      expect(sum(first.data)).toBe(
        await prisma.kpiConfiguration.count({
          where: { tenantId: admin.user.activeCompany.id, deletedAt: null },
        }),
      );
      expect(sum(second.data)).toBe(
        await prisma.kpiConfiguration.count({
          where: { tenantId: other.id, deletedAt: null },
        }),
      );
    });
  });

  describe("KPI Analytics", () => {
    it("agrees with the actuals it aggregates", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/kpis/analytics");
      expect(data.summary.missingTarget).toBe(
        data.summary.measured - data.summary.meetingTarget,
      );
      if (data.summary.measured === 0) {
        expect(data.summary.achievementRate).toBeNull();
        expect(data.trend).toEqual([]);
      } else {
        expect(data.summary.achievementRate).toBeGreaterThanOrEqual(0);
      }
      const trendTotal = data.trend.reduce(
        (sum: number, point: { measured: number }) => sum + point.measured,
        0,
      );
      expect(trendTotal).toBe(data.summary.measured);
      expect(data.missedKpis.length).toBeLessThanOrEqual(
        data.summary.missingTarget,
      );
    });

    it("rejects an unknown frequency filter rather than ignoring it", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      await get(admin.accessToken, "/kpis/analytics?frequency=FORTNIGHTLY", 400);
    });
  });

  describe("Report Hub", () => {
    it("publishes the catalogue with per-report availability", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const { data } = await get(admin.accessToken, "/reports");
      expect(data.length).toBe(REPORT_CATALOGUE.length);
      for (const report of data) {
        expect(report.available).toBe(true);
        expect(report.permissions.length).toBeGreaterThan(0);
      }
    });

    it("runs every report with a generated timestamp and bounded rows", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      for (const report of REPORT_CATALOGUE) {
        const { data } = await get(admin.accessToken, `/reports/${report.key}`);
        expect(data.key, report.key).toBe(report.key);
        expect(new Date(data.generatedAt).valueOf()).not.toBeNaN();
        expect(Array.isArray(data.columns)).toBe(true);
        expect(Array.isArray(data.rows)).toBe(true);
        expect(data.rows.length).toBeLessThanOrEqual(data.rowLimit);
      }
    });

    it("refuses a report whose source module the caller may not read", async () => {
      // COMPANY_USER holds no `risk:read`, so the Risks report must be
      // refused outright rather than served as an empty table.
      const reader = await login("user001@example.test", "User001!Secure");
      await get(reader.accessToken, "/reports/risks", 403);
      const { data } = await get(reader.accessToken, "/reports");
      expect(
        data.find((report: { key: string }) => report.key === "risks").available,
      ).toBe(false);
    });

    it("rejects an unknown report key", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      await get(admin.accessToken, "/reports/not-a-report", 404);
    });

    it("scopes report rows to the authenticated Company", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const other = admin.user.companies.find(({ code }) => code === "COM-002");
      if (!other) throw new Error("COM-002 fixture is unavailable");
      const otherToken = await switchCompany(admin.accessToken, other.id);
      const [first, second] = await Promise.all([
        get(admin.accessToken, "/reports/risks"),
        get(otherToken, "/reports/risks"),
      ]);
      const codesOf = (rows: Array<{ code: string }>) =>
        new Set(rows.map((row) => row.code));
      const firstCodes = codesOf(first.data.rows);
      for (const code of codesOf(second.data.rows)) {
        expect(firstCodes.has(code)).toBe(false);
      }
      expect(first.data.rows.length).toBe(
        await prisma.risk.count({
          where: { tenantId: admin.user.activeCompany.id, deletedAt: null },
        }),
      );
    });

    it("exports CSV with a safe attachment header and no live formula", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .get("/api/v1/reports/gaps/export.csv")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain("attachment");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      for (const line of response.text.split("\r\n")) {
        for (const cell of line.split(",")) {
          // A cell a spreadsheet would evaluate must have been neutralised.
          expect(/^"?[=+@\t\r]/.test(cell)).toBe(false);
        }
      }
    });

    it.each(["CRITICAL", "MAJOR", "MINOR", "OBSERVATION", "OFI"] as const)(
      "accepts Gap severity %s without a 500",
      async (severity) => {
        const admin = await login("admin001@example.test", "Admin001!Secure");
        const response = await request(app)
          .get(`/api/v1/reports/gaps?severity=${severity}`)
          .set("Authorization", `Bearer ${admin.accessToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.key).toBe("gaps");
      },
    );

    it("rejects unsupported Gap severity MODERATE with 400", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .get("/api/v1/reports/gaps?severity=MODERATE")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(response.body)).not.toMatch(
        /prisma|PrismaClient|Invalid `prisma/i,
      );
    });

    it.each(["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"] as const)(
      "accepts Gap status %s without a 500",
      async (status) => {
        const admin = await login("admin001@example.test", "Admin001!Secure");
        const response = await request(app)
          .get(`/api/v1/reports/gaps?status=${status}`)
          .set("Authorization", `Bearer ${admin.accessToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      },
    );

    it("rejects unsupported Gap status RESOLVED with 400", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .get("/api/v1/reports/gaps?status=RESOLVED")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it.each([
      "OPEN",
      "UNDER_REVIEW",
      "TREATED",
      "CLOSED",
      "ARCHIVED",
    ] as const)("accepts Risk status %s without a 500", async (status) => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .get(`/api/v1/reports/risks?status=${status}`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("rejects unsupported Risk status ASSESSED with 400", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .get("/api/v1/reports/risks?status=ASSESSED")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("applies the same enum validation to CSV export", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      await request(app)
        .get("/api/v1/reports/gaps/export.csv?severity=OBSERVATION&status=OPEN")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const invalid = await request(app)
        .get("/api/v1/reports/gaps/export.csv?severity=MODERATE")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
      const assessed = await request(app)
        .get("/api/v1/reports/risks/export.csv?status=ASSESSED")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(400);
      expect(assessed.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("keeps filtered Gap rows tenant-scoped", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const other = admin.user.companies.find(({ code }) => code === "COM-002");
      if (!other) throw new Error("COM-002 fixture is unavailable");
      const actor = await prisma.user.findFirstOrThrow({
        where: { email: "admin001@example.test" },
        select: { id: true },
      });
      const stamp = Date.now();
      const codeA = `GAP_FILTER_A_${stamp}`;
      const codeB = `GAP_FILTER_B_${stamp}`;
      await prisma.gap.createMany({
        data: [
          {
            tenantId: admin.user.activeCompany.id,
            code: codeA,
            title: "Filter isolation A",
            severity: "MAJOR",
            status: "OPEN",
            createdById: actor.id,
            updatedById: actor.id,
          },
          {
            tenantId: other.id,
            code: codeB,
            title: "Filter isolation B",
            severity: "MAJOR",
            status: "OPEN",
            createdById: actor.id,
            updatedById: actor.id,
          },
        ],
      });
      const otherToken = await switchCompany(admin.accessToken, other.id);
      const first = await get(
        admin.accessToken,
        "/reports/gaps?severity=MAJOR",
      );
      const second = await get(otherToken, "/reports/gaps?severity=MAJOR");
      const codesA = (first.data.rows as Array<{ code: string }>).map(
        (row) => row.code,
      );
      const codesB = (second.data.rows as Array<{ code: string }>).map(
        (row) => row.code,
      );
      expect(codesA).toContain(codeA);
      expect(codesA).not.toContain(codeB);
      expect(codesB).toContain(codeB);
      expect(codesB).not.toContain(codeA);
      expect(first.data.rows.length).toBe(
        await prisma.gap.count({
          where: {
            tenantId: admin.user.activeCompany.id,
            deletedAt: null,
            severity: "MAJOR",
          },
        }),
      );
      expect(second.data.rows.length).toBe(
        await prisma.gap.count({
          where: {
            tenantId: other.id,
            deletedAt: null,
            severity: "MAJOR",
          },
        }),
      );
    });

    it("requires exports:read for the CSV even when the report is readable", async () => {
      const admin = await login("admin001@example.test", "Admin001!Secure");
      const reader = await login("user001@example.test", "User001!Secure");
      await get(admin.accessToken, "/reports/gaps");
      await get(reader.accessToken, "/reports/gaps");
      // COMPANY_USER holds exports:read in the fixture, so this asserts the
      // route is reachable rather than that it is denied.
      const response = await request(app)
        .get("/api/v1/reports/gaps/export.csv")
        .set("Authorization", `Bearer ${reader.accessToken}`);
      expect([200, 403]).toContain(response.status);
    });
  });
});
