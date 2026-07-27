import type { GeneralRiskLevel, KpiRiskClass } from "@prisma/client";
import { notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { AuditContext } from "../kpis/management-repository.js";
import { kpiConfigurationDto } from "../kpis/management-service.js";
import type {
  RiskRecord,
  RiskRepository,
  RiskTransactionRepository,
} from "./repository.js";
import type { RiskListQuery } from "./validators.js";

export const AUTOMATIC_KPI_RISK_FACTORS = Object.freeze({
  MAJOR: Object.freeze({ likelihood: 4, impact: 4 }),
  MINOR: Object.freeze({ likelihood: 3, impact: 3 }),
} satisfies Record<
  KpiRiskClass,
  Readonly<{ likelihood: number; impact: number }>
>);

export const GENERAL_RISK_LEVEL_BANDS = Object.freeze({
  CRITICAL_MINIMUM: 20,
  HIGH_MINIMUM: 15,
  MEDIUM_MINIMUM: 8,
});

export const RISK_CODE_PREFIX = "RSK-";
export const RISK_CODE_MINIMUM_DIGITS = 3;

export const formatRiskCode = (number: number) =>
  `${RISK_CODE_PREFIX}${String(number).padStart(
    RISK_CODE_MINIMUM_DIGITS,
    "0",
  )}`;

export const generalLevelForScore = (score: number): GeneralRiskLevel => {
  if (score >= GENERAL_RISK_LEVEL_BANDS.CRITICAL_MINIMUM) return "CRITICAL";
  if (score >= GENERAL_RISK_LEVEL_BANDS.HIGH_MINIMUM) return "HIGH";
  if (score >= GENERAL_RISK_LEVEL_BANDS.MEDIUM_MINIMUM) return "MEDIUM";
  return "LOW";
};

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

export const riskSummaryDto = (risk: RiskRecord) => ({
  id: risk.id,
  code: risk.code,
  title: risk.title,
  kpiRiskClass: risk.kpiRiskClass,
  generalLevel: risk.generalLevel,
  inherentLikelihood: risk.inherentLikelihood,
  inherentImpact: risk.inherentImpact,
  inherentScore: risk.inherentScore,
  status: risk.status,
});

export const riskDto = (risk: RiskRecord) => ({
  ...riskSummaryDto(risk),
  description: risk.description,
  category: risk.category,
  source: {
    actual: risk.kpiActual
      ? {
          id: risk.kpiActual.id,
          code: risk.kpiActual.code,
          period: risk.kpiActual.period,
          ragStatus: risk.kpiActual.ragStatus,
          targetMet: risk.kpiActual.targetMet,
          actualValue: risk.kpiActual.actualValue.toString(),
          variance: risk.kpiActual.variance.toString(),
          targetValueSnapshot: risk.kpiActual.targetValueSnapshot.toString(),
        }
      : null,
    configuration: risk.configuration
      ? kpiConfigurationDto(risk.configuration)
      : null,
    target: risk.target
      ? {
          id: risk.target.id,
          code: risk.target.code,
          version: risk.target.version,
        }
      : null,
  },
  residualLikelihood: risk.residualLikelihood,
  residualImpact: risk.residualImpact,
  residualScore: risk.residualScore,
  owner: personDto(risk.owner),
  treatmentStrategy: risk.treatmentStrategy,
  reviewDate: risk.reviewDate?.toISOString().slice(0, 10) ?? null,
  closedAt: risk.closedAt,
  closureReason: risk.closureReason,
  createdAt: risk.createdAt,
  updatedAt: risk.updatedAt,
});

export interface AutomaticKpiRiskInput {
  tenantId: string;
  actorUserId: string;
  actualId: string;
  actualValue: string;
  variance: string;
  ragStatus: "AMBER" | "RED";
  configurationId: string;
  targetId: string;
  targetValueSnapshot: string;
  period: string;
  kpiCode: string;
  kpiName: string;
  kpiRiskClass: KpiRiskClass;
  context: AuditContext;
}

export class RiskService {
  constructor(private readonly repository: RiskRepository) {}

  async list(tenantId: string, query: RiskListQuery) {
    const result = await this.repository.list(tenantId, query);
    return {
      data: result.items.map(riskDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, id: string) {
    const risk = await this.repository.find(tenantId, id);
    if (!risk) throw notFound("Risk not found");
    return riskDto(risk);
  }

  async createAutomaticKpiRisk(
    transaction: RiskTransactionRepository,
    input: AutomaticKpiRiskInput,
  ) {
    const number = await transaction.allocateNextRiskNumber(input.tenantId);
    const factors = AUTOMATIC_KPI_RISK_FACTORS[input.kpiRiskClass];
    const inherentScore = factors.likelihood * factors.impact;
    const risk = await transaction.createAutomaticRisk(
      input.tenantId,
      input.actorUserId,
      {
        code: formatRiskCode(number),
        title:
          `KPI target missed: ${input.kpiCode} ${input.kpiName} ` +
          `(${input.period})`,
        description:
          "Auto-raised from KPI actual submission. " +
          `Target snapshot: ${input.targetValueSnapshot}; ` +
          `actual value: ${input.actualValue}; ` +
          `variance: ${input.variance}; RAG: ${input.ragStatus}.`,
        category: null,
        kpiActualId: input.actualId,
        kpiConfigurationId: input.configurationId,
        kpiTargetId: input.targetId,
        inherentLikelihood: factors.likelihood,
        inherentImpact: factors.impact,
        inherentScore,
        kpiRiskClass: input.kpiRiskClass,
        generalLevel: generalLevelForScore(inherentScore),
        ownerId: null,
        status: "OPEN",
      },
    );
    await transaction.writeCreatedAudit(
      input.tenantId,
      input.actorUserId,
      risk,
      input.context,
    );
    return risk;
  }
}
