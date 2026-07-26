import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  KpiPerformanceService,
  type KpiPerformanceInput,
} from "../src/modules/kpis/performance-service.js";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const service = new KpiPerformanceService();

const calculate = (
  input: Omit<
    KpiPerformanceInput,
    "targetValue" | "actualValue" | "amberThresholdPct" | "redThresholdPct"
  > & {
    targetValue: string;
    actualValue: string;
    amberThresholdPct?: string;
    redThresholdPct?: string;
  },
) =>
  service.calculate({
    ...input,
    targetValue: decimal(input.targetValue),
    actualValue: decimal(input.actualValue),
    amberThresholdPct: decimal(input.amberThresholdPct ?? "0"),
    redThresholdPct: decimal(input.redThresholdPct ?? "10"),
  });

describe("KpiPerformanceService", () => {
  it.each([
    {
      name: "higher-is-better met",
      direction: "HIGHER_IS_BETTER",
      target: "100",
      actual: "100",
      targetMet: true,
      rag: "GREEN",
      risk: false,
      recommendation: null,
    },
    {
      name: "higher-is-better missed by 5%",
      direction: "HIGHER_IS_BETTER",
      target: "100",
      actual: "95",
      targetMet: false,
      rag: "AMBER",
      risk: true,
      recommendation: "MINOR",
    },
    {
      name: "higher-is-better missed by 20%",
      direction: "HIGHER_IS_BETTER",
      target: "100",
      actual: "80",
      targetMet: false,
      rag: "RED",
      risk: true,
      recommendation: "MAJOR",
    },
    {
      name: "lower-is-better met",
      direction: "LOWER_IS_BETTER",
      target: "100",
      actual: "95",
      targetMet: true,
      rag: "GREEN",
      risk: false,
      recommendation: null,
    },
    {
      name: "lower-is-better missed by 5%",
      direction: "LOWER_IS_BETTER",
      target: "100",
      actual: "105",
      targetMet: false,
      rag: "AMBER",
      risk: true,
      recommendation: "MINOR",
    },
    {
      name: "lower-is-better missed by 20%",
      direction: "LOWER_IS_BETTER",
      target: "100",
      actual: "120",
      targetMet: false,
      rag: "RED",
      risk: true,
      recommendation: "MAJOR",
    },
  ] as const)(
    "$name",
    ({ direction, target, actual, targetMet, rag, risk, recommendation }) => {
      const result = calculate({
        direction,
        targetValue: target,
        actualValue: actual,
      });
      expect(result).toMatchObject({
        targetMet,
        ragStatus: rag,
        riskRequired: risk,
        recommendedRiskClass: recommendation,
      });
    },
  );

  it("uses a complete exact-target band and treats its bounds as inclusive", () => {
    const atLowerBound = calculate({
      direction: "TARGET_EXACT",
      targetValue: "100",
      actualValue: "98",
      minValue: decimal("98"),
      maxValue: decimal("102"),
    });
    const outsideBand = calculate({
      direction: "TARGET_EXACT",
      targetValue: "100",
      actualValue: "105",
      minValue: decimal("98"),
      maxValue: decimal("102"),
    });
    const farOutsideBand = calculate({
      direction: "TARGET_EXACT",
      targetValue: "100",
      actualValue: "120",
      minValue: decimal("98"),
      maxValue: decimal("102"),
    });

    expect(atLowerBound).toMatchObject({
      targetMet: true,
      ragStatus: "GREEN",
      riskRequired: false,
    });
    expect(outsideBand).toMatchObject({
      targetMet: false,
      ragStatus: "AMBER",
      recommendedRiskClass: "MINOR",
      riskRequired: true,
    });
    expect(farOutsideBand).toMatchObject({
      targetMet: false,
      ragStatus: "RED",
      recommendedRiskClass: "MAJOR",
      riskRequired: true,
    });
  });

  it("ignores a lone exact-target bound", () => {
    const result = calculate({
      direction: "TARGET_EXACT",
      targetValue: "100",
      actualValue: "95",
      minValue: decimal("90"),
    });

    expect(result).toMatchObject({
      targetMet: false,
      ragStatus: "AMBER",
      riskRequired: true,
    });
  });

  it("never assigns RAG or risk to informational KPIs", () => {
    const result = calculate({
      direction: "INFORMATIONAL",
      targetValue: "100",
      actualValue: "0",
    });

    expect(result).toMatchObject({
      targetMet: true,
      ragStatus: null,
      riskRequired: false,
      recommendedRiskClass: null,
    });
    expect(result.variance.toFixed(4)).toBe("-100.0000");
    expect(result.variancePercentage?.toFixed(4)).toBe("-100.0000");
  });

  it("returns null percentage for a zero target and forces every miss to RED", () => {
    const met = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "0",
      actualValue: "0",
    });
    const missed = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "0",
      actualValue: "-0.0001",
      amberThresholdPct: "100",
      redThresholdPct: "1000",
    });

    expect(met).toMatchObject({ targetMet: true, ragStatus: "GREEN" });
    expect(met.variancePercentage).toBeNull();
    expect(missed).toMatchObject({
      targetMet: false,
      ragStatus: "RED",
      riskRequired: true,
      recommendedRiskClass: "MAJOR",
    });
    expect(missed.variancePercentage).toBeNull();
  });

  it("uses inclusive thresholds and permits a GREEN miss inside amber tolerance", () => {
    const greenMiss = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "100",
      actualValue: "95",
      amberThresholdPct: "5",
      redThresholdPct: "20",
    });
    const amberAtRedBoundary = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "100",
      actualValue: "80",
      amberThresholdPct: "5",
      redThresholdPct: "20",
    });
    const redBeyondBoundary = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "100",
      actualValue: "79.9999",
      amberThresholdPct: "5",
      redThresholdPct: "20",
    });

    expect(greenMiss).toMatchObject({
      targetMet: false,
      ragStatus: "GREEN",
      riskRequired: false,
      recommendedRiskClass: null,
    });
    expect(amberAtRedBoundary).toMatchObject({
      ragStatus: "AMBER",
      recommendedRiskClass: "MINOR",
    });
    expect(redBeyondBoundary).toMatchObject({
      ragStatus: "RED",
      recommendedRiskClass: "MAJOR",
    });
  });

  it("uses the absolute target as the shortfall denominator", () => {
    const result = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "-100",
      actualValue: "-105",
    });

    expect(result.variancePercentage?.toFixed(4)).toBe("-5.0000");
    expect(result).toMatchObject({
      targetMet: false,
      ragStatus: "AMBER",
      recommendedRiskClass: "MINOR",
    });
  });

  it("classifies at full precision before rounding returned percentages", () => {
    const result = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "2500",
      actualValue: "2374.9990",
      amberThresholdPct: "5",
      redThresholdPct: "10",
    });

    expect(result.variancePercentage?.toFixed(4)).toBe("-5.0000");
    expect(result).toMatchObject({
      targetMet: false,
      ragStatus: "AMBER",
      recommendedRiskClass: "MINOR",
    });
  });

  it("rounds derived values half-up to four decimal places", () => {
    const result = calculate({
      direction: "HIGHER_IS_BETTER",
      targetValue: "8",
      actualValue: "7.9999",
    });

    expect(result.variance.toFixed(4)).toBe("-0.0001");
    expect(result.variancePercentage?.toFixed(4)).toBe("-0.0013");
  });

  it.each([
    {
      name: "variance overflow",
      target: "-99999999999999.9999",
      actual: "99999999999999.9999",
    },
    {
      name: "variance-percentage overflow",
      target: "0.0001",
      actual: "99999999999999.9999",
    },
  ])("rejects $name with a safe domain error", ({ target, actual }) => {
    expect(() =>
      calculate({
        direction: "HIGHER_IS_BETTER",
        targetValue: target,
        actualValue: actual,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "KPI_CALCULATION_OUT_OF_RANGE",
        message: "Calculated KPI values must fit Decimal(18,4)",
      }),
    );
  });
});
