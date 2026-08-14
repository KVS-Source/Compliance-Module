import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildRiskListWhere,
  type RiskRepository,
  type RiskTransactionRepository,
} from "../src/modules/risks/repository.js";
import {
  AUTOMATIC_KPI_RISK_FACTORS,
  GENERAL_RISK_LEVEL_BANDS,
  RiskService,
  formatRiskCode,
  generalLevelForScore,
  type AutomaticKpiRiskInput,
} from "../src/modules/risks/service.js";
import {
  createRiskReviewSchema,
  createRiskTreatmentSchema,
  riskListSchema,
} from "../src/modules/risks/validators.js";

describe("RiskService", () => {
  it("keeps the Slice D migration create-only with no historical Risk backfill", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260726224500_slice_d_automatic_kpi_risk/migration.sql",
      ),
      "utf8",
    );

    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"risks"/iu);
    expect(migration).not.toMatch(/\bUPDATE\s+"kpi_actuals"/iu);
  });

  it.each([
    { score: 1, level: "LOW" },
    { score: 7, level: "LOW" },
    { score: 8, level: "MEDIUM" },
    { score: 14, level: "MEDIUM" },
    { score: 15, level: "HIGH" },
    { score: 19, level: "HIGH" },
    { score: 20, level: "CRITICAL" },
    { score: 25, level: "CRITICAL" },
  ] as const)("classifies score $score as $level", ({ score, level }) => {
    expect(generalLevelForScore(score)).toBe(level);
  });

  it("keeps the reviewed score-band boundaries explicit", () => {
    expect(GENERAL_RISK_LEVEL_BANDS).toEqual({
      CRITICAL_MINIMUM: 20,
      HIGH_MINIMUM: 15,
      MEDIUM_MINIMUM: 8,
    });
  });

  it.each([
    { number: 1, code: "RSK-001" },
    { number: 42, code: "RSK-042" },
    { number: 999, code: "RSK-999" },
    { number: 1000, code: "RSK-1000" },
  ])("formats tenant sequence $number as $code", ({ number, code }) => {
    expect(formatRiskCode(number)).toBe(code);
  });

  it.each([
    {
      riskClass: "MINOR",
      sequence: 1,
      expectedCode: "RSK-001",
      likelihood: 3,
      impact: 3,
      score: 9,
      generalLevel: "MEDIUM",
      ragStatus: "AMBER",
    },
    {
      riskClass: "MAJOR",
      sequence: 1000,
      expectedCode: "RSK-1000",
      likelihood: 4,
      impact: 4,
      score: 16,
      generalLevel: "HIGH",
      ragStatus: "RED",
    },
  ] as const)(
    "derives the $riskClass automatic risk and writes its audit",
    async ({
      riskClass,
      sequence,
      expectedCode,
      likelihood,
      impact,
      score,
      generalLevel,
      ragStatus,
    }) => {
      const createdRisk = {
        id: `risk-${riskClass.toLowerCase()}`,
        code: expectedCode,
      };
      const transaction = {
        allocateNextRiskNumber: vi.fn().mockResolvedValue(sequence),
        createAutomaticRisk: vi.fn().mockResolvedValue(createdRisk),
        writeCreatedAudit: vi.fn().mockResolvedValue(undefined),
      } as unknown as RiskTransactionRepository;
      const service = new RiskService({} as RiskRepository);
      const input: AutomaticKpiRiskInput = {
        tenantId: "10000000-0000-4000-8000-000000000001",
        actorUserId: "10000000-0000-4000-8000-000000000002",
        actualId: "10000000-0000-4000-8000-000000000003",
        actualValue: "95",
        variance: "-5",
        ragStatus,
        configurationId: "10000000-0000-4000-8000-000000000004",
        targetId: "10000000-0000-4000-8000-000000000005",
        targetValueSnapshot: "100",
        period: "FY26-27 Q1",
        kpiCode: "KPI-001",
        kpiName: "Synthetic completion rate",
        kpiRiskClass: riskClass,
        context: { ip: "127.0.0.1", userAgent: "vitest" },
      };

      await expect(
        service.createAutomaticKpiRisk(transaction, input),
      ).resolves.toBe(createdRisk);
      expect(transaction.allocateNextRiskNumber).toHaveBeenCalledWith(
        input.tenantId,
      );
      expect(transaction.createAutomaticRisk).toHaveBeenCalledWith(
        input.tenantId,
        input.actorUserId,
        {
          code: expectedCode,
          title:
            "KPI target missed: KPI-001 Synthetic completion rate " +
            "(FY26-27 Q1)",
          description:
            "Auto-raised from KPI actual submission. " +
            "Target snapshot: 100; actual value: 95; " +
            `variance: -5; RAG: ${ragStatus}.`,
          category: null,
          kpiActualId: input.actualId,
          kpiConfigurationId: input.configurationId,
          kpiTargetId: input.targetId,
          inherentLikelihood: likelihood,
          inherentImpact: impact,
          inherentScore: score,
          kpiRiskClass: riskClass,
          generalLevel,
          ownerId: null,
          status: "OPEN",
        },
      );
      expect(transaction.writeCreatedAudit).toHaveBeenCalledWith(
        input.tenantId,
        input.actorUserId,
        createdRisk,
        input.context,
      );
    },
  );

  it("keeps the automatic starting assessments fixed at 3x3 and 4x4", () => {
    expect(AUTOMATIC_KPI_RISK_FACTORS).toEqual({
      MINOR: { likelihood: 3, impact: 3 },
      MAJOR: { likelihood: 4, impact: 4 },
    });
  });

  it("gives specific status precedence over lifecycle in list filters", () => {
    const where = buildRiskListWhere("tenant-1", {
      page: 1,
      pageSize: 20,
      status: "CLOSED",
      lifecycle: "active",
    });
    expect(where.status).toBe("CLOSED");
  });

  it("maps lifecycle active and closed to RiskStatus groups", () => {
    expect(
      buildRiskListWhere("tenant-1", {
        page: 1,
        pageSize: 20,
        lifecycle: "active",
      }).status,
    ).toEqual({ in: ["OPEN", "UNDER_REVIEW", "TREATED"] });
    expect(
      buildRiskListWhere("tenant-1", {
        page: 1,
        pageSize: 20,
        lifecycle: "closed",
      }).status,
    ).toEqual({ in: ["CLOSED", "ARCHIVED"] });
    expect(
      buildRiskListWhere("tenant-1", {
        page: 1,
        pageSize: 20,
        lifecycle: "all",
      }).status,
    ).toBeUndefined();
  });

  it("requires a revised likelihood and impact together or not at all", () => {
    expect(
      createRiskReviewSchema.safeParse({ comments: "Reviewed" }).success,
    ).toBe(true);
    expect(
      createRiskReviewSchema.safeParse({
        comments: "Reviewed",
        likelihoodAtReview: 2,
        impactAtReview: 3,
      }).success,
    ).toBe(true);

    const partial = createRiskReviewSchema.safeParse({
      comments: "Reviewed",
      likelihoodAtReview: 2,
    });
    expect(partial.success).toBe(false);
    if (!partial.success) {
      expect(partial.error.issues[0]?.path).toEqual(["impactAtReview"]);
    }
  });

  it("keeps review assessment values inside the 1 to 5 band", () => {
    for (const value of [0, 6, -1]) {
      expect(
        createRiskReviewSchema.safeParse({
          comments: "Reviewed",
          likelihoodAtReview: value,
          impactAtReview: 3,
        }).success,
      ).toBe(false);
    }
  });

  it("derives the residual general level from the reviewed score", () => {
    // The service multiplies; the database independently enforces equality.
    const cases: Array<[number, number, number, string]> = [
      [1, 1, 1, "LOW"],
      [2, 4, 8, "MEDIUM"],
      [3, 5, 15, "HIGH"],
      [5, 4, 20, "CRITICAL"],
    ];
    for (const [likelihood, impact, score, level] of cases) {
      expect(likelihood * impact).toBe(score);
      expect(generalLevelForScore(score)).toBe(level);
    }
  });

  it("refuses a treatment without a plan and defaults its status to PLANNED", () => {
    expect(
      createRiskTreatmentSchema.safeParse({
        strategy: "MITIGATE",
        plan: "   ",
      }).success,
    ).toBe(false);

    const parsed = createRiskTreatmentSchema.safeParse({
      strategy: "MITIGATE",
      plan: "Add a second reviewer to the survey process.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.status).toBe("PLANNED");
  });

  it("never accepts COMPLETED directly on a treatment write", () => {
    // Completion appends a superseding row instead of setting the status.
    expect(
      createRiskTreatmentSchema.safeParse({
        strategy: "MITIGATE",
        plan: "Plan",
        status: "COMPLETED",
      }).success,
    ).toBe(false);
  });

  it("trims and length-limits the risk search query", () => {
    expect(riskListSchema.parse({ q: "  RSK-001  " }).q).toBe("RSK-001");
    expect(riskListSchema.parse({ q: "   " }).q).toBeUndefined();
    expect(() => riskListSchema.parse({ q: "x".repeat(101) })).toThrow();
  });
});
