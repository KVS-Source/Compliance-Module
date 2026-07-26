import { Prisma } from "@prisma/client";
import type { KpiDirection } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

export type KpiRagStatus = "GREEN" | "AMBER" | "RED";
export type RecommendedKpiRiskClass = "MINOR" | "MAJOR";

export interface KpiPerformanceInput {
  direction: KpiDirection;
  targetValue: Prisma.Decimal;
  actualValue: Prisma.Decimal;
  minValue?: Prisma.Decimal | null;
  maxValue?: Prisma.Decimal | null;
  amberThresholdPct: Prisma.Decimal;
  redThresholdPct: Prisma.Decimal;
}

export interface KpiPerformanceResult {
  targetMet: boolean;
  variance: Prisma.Decimal;
  variancePercentage: Prisma.Decimal | null;
  ragStatus: KpiRagStatus | null;
  recommendedRiskClass: RecommendedKpiRiskClass | null;
  riskRequired: boolean;
}

const MAX_DECIMAL_18_4 = new Prisma.Decimal("99999999999999.9999");
const HUNDRED = new Prisma.Decimal(100);

const calculationOutOfRange = () =>
  new AppError(
    400,
    "KPI_CALCULATION_OUT_OF_RANGE",
    "Calculated KPI values must fit Decimal(18,4)",
  );

/**
 * Derived database values are rounded half-up to four decimal places only after
 * target and RAG comparisons have used full Decimal precision.
 */
const measuredResult = (value: Prisma.Decimal) => {
  if (!value.isFinite()) throw calculationOutOfRange();
  const rounded = value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  if (rounded.abs().greaterThan(MAX_DECIMAL_18_4)) {
    throw calculationOutOfRange();
  }
  return rounded;
};

export class KpiPerformanceService {
  calculate(input: KpiPerformanceInput): KpiPerformanceResult {
    const varianceAtFullPrecision = input.actualValue.minus(input.targetValue);
    const variancePercentageAtFullPrecision = input.targetValue.isZero()
      ? null
      : varianceAtFullPrecision
          .dividedBy(input.targetValue.abs())
          .times(HUNDRED);

    const variance = measuredResult(varianceAtFullPrecision);
    const variancePercentage =
      variancePercentageAtFullPrecision === null
        ? null
        : measuredResult(variancePercentageAtFullPrecision);

    if (input.direction === "INFORMATIONAL") {
      return {
        targetMet: true,
        variance,
        variancePercentage,
        ragStatus: null,
        recommendedRiskClass: null,
        riskRequired: false,
      };
    }

    let targetMet: boolean;
    let wrongWayDistance: Prisma.Decimal;

    switch (input.direction) {
      case "HIGHER_IS_BETTER":
        targetMet = input.actualValue.greaterThanOrEqualTo(input.targetValue);
        wrongWayDistance = targetMet
          ? new Prisma.Decimal(0)
          : input.targetValue.minus(input.actualValue);
        break;
      case "LOWER_IS_BETTER":
        targetMet = input.actualValue.lessThanOrEqualTo(input.targetValue);
        wrongWayDistance = targetMet
          ? new Prisma.Decimal(0)
          : input.actualValue.minus(input.targetValue);
        break;
      case "TARGET_EXACT": {
        const minValue = input.minValue;
        const maxValue = input.maxValue;
        if (minValue != null && maxValue != null) {
          targetMet =
            input.actualValue.greaterThanOrEqualTo(minValue) &&
            input.actualValue.lessThanOrEqualTo(maxValue);
          wrongWayDistance = targetMet
            ? new Prisma.Decimal(0)
            : input.actualValue.lessThan(minValue)
              ? minValue.minus(input.actualValue)
              : input.actualValue.minus(maxValue);
        } else {
          // A lone bound is deliberately ignored: only a complete band applies.
          targetMet = input.actualValue.equals(input.targetValue);
          wrongWayDistance = varianceAtFullPrecision.abs();
        }
        break;
      }
    }

    let ragStatus: KpiRagStatus;
    if (targetMet) {
      ragStatus = "GREEN";
    } else if (input.targetValue.isZero()) {
      // A zero target cannot be a denominator. Conceptually its shortfall is
      // redThresholdPct + 1, so every miss is forced to RED.
      ragStatus = "RED";
    } else {
      const shortfallPercentage = wrongWayDistance
        .dividedBy(input.targetValue.abs())
        .times(HUNDRED);
      if (shortfallPercentage.lessThanOrEqualTo(input.amberThresholdPct)) {
        ragStatus = "GREEN";
      } else if (shortfallPercentage.lessThanOrEqualTo(input.redThresholdPct)) {
        ragStatus = "AMBER";
      } else {
        ragStatus = "RED";
      }
    }

    if (ragStatus === "AMBER") {
      return {
        targetMet,
        variance,
        variancePercentage,
        ragStatus,
        recommendedRiskClass: "MINOR",
        riskRequired: true,
      };
    }
    if (ragStatus === "RED") {
      return {
        targetMet,
        variance,
        variancePercentage,
        ragStatus,
        recommendedRiskClass: "MAJOR",
        riskRequired: true,
      };
    }
    return {
      targetMet,
      variance,
      variancePercentage,
      ragStatus,
      recommendedRiskClass: null,
      riskRequired: false,
    };
  }
}
