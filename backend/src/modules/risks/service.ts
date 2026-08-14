import { Prisma, type GeneralRiskLevel, type KpiRiskClass } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { AuditContext } from "../kpis/management-repository.js";
import { kpiConfigurationDto } from "../kpis/management-service.js";
import type {
  RiskDetailRecord,
  RiskRecord,
  RiskRepository,
  RiskTransactionRepository,
  RiskWorkflowPatch,
  RiskWorkflowRepository,
} from "./repository.js";
import type {
  AssignRiskOwnerBody,
  CloseRiskBody,
  CompleteRiskTreatmentBody,
  CreateManualRiskBody,
  CreateRiskReviewBody,
  CreateRiskTreatmentBody,
  ReopenRiskBody,
  RiskListQuery,
} from "./validators.js";

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

const riskReviewDto = (review: {
  id: string;
  comments: string;
  likelihoodAtReview: number | null;
  impactAtReview: number | null;
  reviewedAt: Date;
  reviewer: { id: string; code: string; fullName: string } | null;
}) => ({
  id: review.id,
  reviewer: personDto(review.reviewer),
  comments: review.comments,
  likelihoodAtReview: review.likelihoodAtReview,
  impactAtReview: review.impactAtReview,
  reviewedAt: review.reviewedAt,
});

const riskTreatmentDto = (treatment: {
  id: string;
  strategy: string;
  plan: string;
  dueDate: Date | null;
  completedAt: Date | null;
  status: string;
  effectivenessNotes: string | null;
  supersedesId: string | null;
  recordedAt: Date;
  owner: { id: string; code: string; fullName: string } | null;
  recordedBy: { id: string; code: string; fullName: string } | null;
}) => ({
  id: treatment.id,
  strategy: treatment.strategy,
  plan: treatment.plan,
  owner: personDto(treatment.owner),
  dueDate: treatment.dueDate?.toISOString().slice(0, 10) ?? null,
  completedAt: treatment.completedAt,
  status: treatment.status,
  effectivenessNotes: treatment.effectivenessNotes,
  // Completion inserts a new row superseding this one; it is never an edit.
  supersedesId: treatment.supersedesId,
  recordedBy: personDto(treatment.recordedBy),
  recordedAt: treatment.recordedAt,
});

/**
 * Detail response adding the append-only review and treatment ledgers. Both
 * are returned in recorded order; the current treatment is the latest row.
 */
export const riskDetailDto = (risk: RiskDetailRecord) => ({
  ...riskDto(risk),
  reviews: risk.reviews.map(riskReviewDto),
  treatments: risk.treatments.map(riskTreatmentDto),
});

const invalidTransition = (from: string, to: string) =>
  new AppError(
    409,
    "RISK_STATUS_TRANSITION_INVALID",
    `A risk with status ${from} cannot move to ${to}`,
  );

const relatedRecordInvalid = (message: string) =>
  new AppError(400, "RELATED_RECORD_INVALID", message);

/**
 * `risks_one_active_per_kpi_actual` permits one live risk per KPI actual.
 * Reopening a closed risk while a sibling is live would violate it, so the
 * service refuses with a specific error naming the blocker rather than letting
 * a bare unique-index violation surface as a generic conflict.
 *
 * This state is not reachable through the API today: risk creation happens
 * once per KPI actual inside the submission transaction, and a later
 * submission creates a new actual row with a new id. It is reachable by
 * direct database writes, and would become reachable through a future manual
 * risk workflow. See docs/reviews/risk-reopen-active-duplicate-decision.md.
 */
const activeDuplicateForActual = (blockingCode: string) =>
  new AppError(
    409,
    "RISK_ACTIVE_DUPLICATE_FOR_ACTUAL",
    `Risk ${blockingCode} is already active for the same KPI actual. ` +
      "Only one active risk per KPI actual is permitted, so this risk " +
      "cannot be reopened until that one is closed.",
  );

const ACTIVE_DUPLICATE_INDEX = "risks_one_active_per_kpi_actual";

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
    const risk = await this.repository.findDetail(tenantId, id);
    if (!risk) throw notFound("Risk not found");
    return riskDetailDto(risk);
  }

  async createManual(
    tenantId: string,
    actorUserId: string,
    body: CreateManualRiskBody,
    context: AuditContext,
  ) {
    return this.repository.runCreationTransaction(async (transaction) => {
      if (body.ownerId) {
        const owner = await transaction.findActiveMember(
          tenantId,
          body.ownerId,
        );
        if (!owner) {
          throw relatedRecordInvalid(
            "Risk owner must be an active user in the current Company",
          );
        }
      }

      const number = await transaction.allocateNextRiskNumber(tenantId);
      const inherentScore = body.inherentLikelihood * body.inherentImpact;
      const risk = await transaction.createManualRisk(tenantId, actorUserId, {
        code: formatRiskCode(number),
        title: body.title,
        description: body.description,
        category: body.category,
        inherentLikelihood: body.inherentLikelihood,
        inherentImpact: body.inherentImpact,
        inherentScore,
        generalLevel: generalLevelForScore(inherentScore),
        ownerId: body.ownerId ?? null,
        status: "OPEN",
      });
      await transaction.writeCreatedAudit(
        tenantId,
        actorUserId,
        risk,
        context,
        false,
      );
      return riskDto(risk);
    });
  }

  /** Decisions are refused on a closed risk until it is explicitly reopened. */
  private assertDecidable(risk: RiskDetailRecord, action: string) {
    if (risk.status === "CLOSED" || risk.status === "ARCHIVED") {
      throw invalidTransition(risk.status, action);
    }
  }

  private async assertActiveMember(
    transaction: RiskWorkflowRepository,
    tenantId: string,
    userId: string,
    label: string,
  ) {
    const member = await transaction.findActiveMember(tenantId, userId);
    if (!member) {
      throw relatedRecordInvalid(
        `${label} must be an active user in the current Company`,
      );
    }
  }

  private async loadForUpdate(
    transaction: RiskWorkflowRepository,
    tenantId: string,
    id: string,
  ) {
    const risk = await transaction.findForUpdate(tenantId, id);
    if (!risk) throw notFound("Risk not found");
    return risk;
  }

  async recordReview(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: CreateRiskReviewBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      this.assertDecidable(risk, "UNDER_REVIEW");

      const likelihood = body.likelihoodAtReview ?? null;
      const impact = body.impactAtReview ?? null;
      const review = await transaction.createReview(
        tenantId,
        id,
        actorUserId,
        {
          comments: body.comments,
          likelihoodAtReview: likelihood,
          impactAtReview: impact,
        },
      );

      // The service owns the score; the database independently enforces the
      // same equality. Nothing is computed in the frontend.
      const patch: RiskWorkflowPatch = {
        status: risk.status === "TREATED" ? risk.status : "UNDER_REVIEW",
        reviewDate: new Date(),
      };
      if (likelihood !== null && impact !== null) {
        const residualScore = likelihood * impact;
        patch.residualLikelihood = likelihood;
        patch.residualImpact = impact;
        patch.residualScore = residualScore;
        patch.generalLevel = generalLevelForScore(residualScore);
      }

      const updated = await transaction.updateRisk(
        tenantId,
        id,
        actorUserId,
        patch,
      );
      await transaction.writeAudit(
        tenantId,
        actorUserId,
        "RISK_REVIEWED",
        id,
        {
          code: risk.code,
          reviewId: review.id,
          likelihoodAtReview: likelihood,
          impactAtReview: impact,
          residualScore: patch.residualScore ?? null,
          generalLevel: patch.generalLevel ?? risk.generalLevel,
          statusBefore: risk.status,
          statusAfter: updated.status,
        },
        context,
      );
      return riskDetailDto(updated);
    });
  }

  async recordTreatment(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: CreateRiskTreatmentBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      this.assertDecidable(risk, "TREATED");
      if (body.ownerId) {
        await this.assertActiveMember(
          transaction,
          tenantId,
          body.ownerId,
          "Treatment owner",
        );
      }

      const treatment = await transaction.createTreatment(
        tenantId,
        id,
        actorUserId,
        {
          strategy: body.strategy,
          plan: body.plan,
          ownerId: body.ownerId ?? null,
          dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null,
          status: body.status,
          completedAt: null,
          effectivenessNotes: null,
          supersedesId: null,
        },
      );

      const updated = await transaction.updateRisk(tenantId, id, actorUserId, {
        status: "TREATED",
        treatmentStrategy: body.strategy,
        ...(body.ownerId === undefined ? {} : { ownerId: body.ownerId ?? null }),
      });
      await transaction.writeAudit(
        tenantId,
        actorUserId,
        "RISK_TREATMENT_RECORDED",
        id,
        {
          code: risk.code,
          treatmentId: treatment.id,
          strategy: body.strategy,
          ownerId: body.ownerId ?? null,
          dueDate: body.dueDate ?? null,
          treatmentStatus: body.status,
          statusBefore: risk.status,
          statusAfter: updated.status,
        },
        context,
      );
      return riskDetailDto(updated);
    });
  }

  /**
   * Completion appends a new COMPLETED row superseding the original. The
   * treatment ledger is append-only, so nothing is edited in place.
   */
  async completeTreatment(
    tenantId: string,
    id: string,
    treatmentId: string,
    actorUserId: string,
    body: CompleteRiskTreatmentBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      this.assertDecidable(risk, "TREATED");
      const existing = await transaction.findTreatment(
        tenantId,
        id,
        treatmentId,
      );
      if (!existing) throw notFound("Risk treatment not found");
      if (existing.status === "COMPLETED") {
        throw new AppError(
          409,
          "RISK_TREATMENT_ALREADY_COMPLETED",
          "This treatment is already recorded as completed",
        );
      }
      if (existing.status === "CANCELLED") {
        throw new AppError(
          409,
          "RISK_TREATMENT_CANCELLED",
          "A cancelled treatment cannot be completed",
        );
      }
      const superseded = await transaction.findSupersedingTreatment(
        tenantId,
        treatmentId,
      );
      if (superseded) {
        throw new AppError(
          409,
          "RISK_TREATMENT_SUPERSEDED",
          `This treatment was already superseded by a later entry`,
        );
      }

      const completedAt = new Date();
      const completion = await transaction.createTreatment(
        tenantId,
        id,
        actorUserId,
        {
          strategy: existing.strategy,
          plan: existing.plan,
          ownerId: existing.ownerId,
          dueDate: existing.dueDate,
          status: "COMPLETED",
          completedAt,
          effectivenessNotes: body.effectivenessNotes ?? null,
          supersedesId: existing.id,
        },
      );

      const updated = await transaction.updateRisk(tenantId, id, actorUserId, {
        status: "TREATED",
      });
      await transaction.writeAudit(
        tenantId,
        actorUserId,
        "RISK_TREATMENT_COMPLETED",
        id,
        {
          code: risk.code,
          treatmentId: completion.id,
          supersedesTreatmentId: existing.id,
          strategy: existing.strategy,
          completedAt: completedAt.toISOString(),
        },
        context,
      );
      return riskDetailDto(updated);
    });
  }

  async assignOwner(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: AssignRiskOwnerBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      this.assertDecidable(risk, "owner assignment");
      if (body.ownerId) {
        await this.assertActiveMember(
          transaction,
          tenantId,
          body.ownerId,
          "Risk owner",
        );
      }
      const updated = await transaction.updateRisk(tenantId, id, actorUserId, {
        ownerId: body.ownerId,
      });
      await transaction.writeAudit(
        tenantId,
        actorUserId,
        "RISK_OWNER_ASSIGNED",
        id,
        {
          code: risk.code,
          ownerIdBefore: risk.ownerId,
          ownerIdAfter: body.ownerId,
        },
        context,
      );
      return riskDetailDto(updated);
    });
  }

  async closeRisk(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: CloseRiskBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      if (risk.status === "CLOSED" || risk.status === "ARCHIVED") {
        throw invalidTransition(risk.status, "CLOSED");
      }
      const closedAt = new Date();
      const updated = await transaction.updateRisk(tenantId, id, actorUserId, {
        status: "CLOSED",
        closedAt,
        closureReason: body.reason,
      });
      await transaction.writeAudit(
        tenantId,
        actorUserId,
        "RISK_CLOSED",
        id,
        {
          code: risk.code,
          statusBefore: risk.status,
          closureReason: body.reason,
          closedAt: closedAt.toISOString(),
          kpiActualId: risk.kpiActualId,
        },
        context,
      );
      return riskDetailDto(updated);
    });
  }

  async reopenRisk(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: ReopenRiskBody,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const risk = await this.loadForUpdate(transaction, tenantId, id);
      if (risk.status !== "CLOSED") {
        throw invalidTransition(risk.status, "reopened");
      }
      if (risk.kpiActualId) {
        const competing = await transaction.findCompetingActiveRisk(
          tenantId,
          risk.kpiActualId,
          risk.id,
        );
        if (competing) throw activeDuplicateForActual(competing.code);
      }

      try {
        const updated = await transaction.updateRisk(
          tenantId,
          id,
          actorUserId,
          {
            status: "UNDER_REVIEW",
            closedAt: null,
            closureReason: null,
          },
        );
        await transaction.writeAudit(
          tenantId,
          actorUserId,
          "RISK_REOPENED",
          id,
          {
            code: risk.code,
            statusBefore: risk.status,
            statusAfter: updated.status,
            reason: body.reason,
            previousClosureReason: risk.closureReason,
            kpiActualId: risk.kpiActualId,
          },
          context,
        );
        return riskDetailDto(updated);
      } catch (error) {
        // A concurrent reopen can still lose the race to the partial unique
        // index; report it with the same specific error, never a bare 409.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          JSON.stringify(error.meta ?? {}).includes(ACTIVE_DUPLICATE_INDEX)
        ) {
          throw activeDuplicateForActual("another risk");
        }
        throw error;
      }
    });
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
