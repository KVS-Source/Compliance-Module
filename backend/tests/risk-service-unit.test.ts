import { describe, expect, it, vi } from "vitest";
import type {
  RiskRepository,
  RiskTransactionRepository,
} from "../src/modules/risks/repository.js";
import {
  AUTOMATIC_KPI_RISK_FACTORS,
  GENERAL_RISK_LEVEL_BANDS,
  RiskService,
  formatRiskCode,
  generalLevelForScore,
  type AutomaticKpiRiskInput,
} from "../src/modules/risks/service.js";

describe("RiskService", () => {
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
});
