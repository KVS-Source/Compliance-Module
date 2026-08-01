import { Prisma, type ApprovalDecision } from "@prisma/client";
import {
  AppError,
  forbidden,
  unauthorized,
} from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { AuditContext } from "./management-repository.js";
import {
  type KpiActualReadRecord,
  type KpiActualRecord,
  type KpiActualRepository,
} from "./actual-repository.js";
import type {
  CreateKpiActualBody,
  KpiActualListQuery,
} from "./actual-validators.js";
import type {
  KpiPerformanceService,
  KpiPerformanceResult,
} from "./performance-service.js";
import {
  assertEvidenceApprovalInvariant,
  kpiConfigurationDto,
} from "./management-service.js";
import { riskSummaryDto, type RiskService } from "../risks/service.js";
import type { RiskRecord } from "../risks/repository.js";
import type { EvidenceGateService } from "./evidence-gate-service.js";
import { utcDateString } from "../evidence/eligibility.js";

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

export const KPI_ACTUAL_CODE_PREFIX = "ACT-";
export const KPI_ACTUAL_CODE_MINIMUM_DIGITS = 3;

export const formatKpiActualCode = (number: number) =>
  `${KPI_ACTUAL_CODE_PREFIX}${String(number).padStart(
    KPI_ACTUAL_CODE_MINIMUM_DIGITS,
    "0",
  )}`;

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

export const kpiActualDto = (
  record: KpiActualRecord,
  performance: Pick<
    KpiPerformanceResult,
    "riskRequired" | "recommendedRiskClass"
  >,
  risk: RiskRecord | null,
) => ({
  id: record.id,
  code: record.code,
  configuration: kpiConfigurationDto(record.configuration),
  target: {
    id: record.target.id,
    code: record.target.code,
    version: record.target.version,
  },
  period: record.period,
  periodStart: dateOnly(record.periodStart),
  periodEnd: dateOnly(record.periodEnd),
  targetValueSnapshot: record.targetValueSnapshot.toString(),
  actualValue: record.actualValue.toString(),
  variance: record.variance.toString(),
  variancePercentage: record.variancePercentage?.toString() ?? null,
  ragStatus: record.ragStatus,
  targetMet: record.targetMet,
  approvalStatus: record.approvalStatus,
  submittedBy: personDto(record.submittedBy),
  submittedAt: record.submittedAt,
  approvedBy: personDto(record.approvedBy),
  approvedAt: record.approvedAt,
  rejectionReason: record.rejectionReason,
  evidenceStatus: record.evidenceStatus,
  comments: record.comments,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  riskRequired: performance.riskRequired,
  recommendedRiskClass: performance.recommendedRiskClass,
  risk: risk ? riskSummaryDto(risk) : null,
});

const approvalDecisionDto = (approval: {
  id: string;
  decision: ApprovalDecision;
  comments: string | null;
  decidedAt: Date;
  reviewer: { id: string; code: string; fullName: string } | null;
}) => ({
  id: approval.id,
  decision: approval.decision,
  reviewer: personDto(approval.reviewer),
  comments: approval.comments,
  decidedAt: approval.decidedAt,
});

/**
 * Read shape for the approval UI: the workflow DTO plus the append-only
 * `kpi_approvals` ledger in decision order. `riskRequired` and
 * `recommendedRiskClass` are derived from the persisted risk exactly as the
 * workflow responses derive them, so nothing is recalculated on read.
 */
export const kpiActualReadDto = (
  record: KpiActualReadRecord,
  risk: RiskRecord | null,
) => ({
  ...kpiActualDto(
    record,
    {
      riskRequired: risk !== null,
      recommendedRiskClass: risk?.kpiRiskClass ?? null,
    },
    risk,
  ),
  approvals: record.approvals.map(approvalDecisionDto),
});

const kpiActualWorkflowDto = (
  record: KpiActualRecord,
  risk: RiskRecord | null,
) =>
  kpiActualDto(
    record,
    {
      riskRequired: risk !== null,
      recommendedRiskClass: risk?.kpiRiskClass ?? null,
    },
    risk,
  );

const configurationNotFound = () =>
  new AppError(
    404,
    "KPI_CONFIGURATION_NOT_FOUND",
    "Active KPI configuration not found",
  );

const targetNotFound = () =>
  new AppError(
    404,
    "KPI_TARGET_NOT_FOUND",
    "Approved KPI target not found for the requested period",
  );

const actualPeriodExists = () =>
  new AppError(
    409,
    "KPI_ACTUAL_PERIOD_EXISTS",
    "A KPI actual already exists for this KPI configuration and period",
  );

/**
 * Codes come from the Company counter, so a code conflict is a server fault
 * rather than a caller mistake and must not be reported as a 409.
 */
const actualCodeCollision = () =>
  new AppError(
    500,
    "KPI_ACTUAL_CODE_COLLISION",
    "Generated KPI actual code collided with an existing record",
  );

const conflictTarget = (error: Prisma.PrismaClientKnownRequestError) => {
  const target = error.meta?.["target"];
  if (Array.isArray(target)) return target.join(",").toLowerCase();
  return typeof target === "string" ? target.toLowerCase() : "";
};

const submissionConflict = (error: Prisma.PrismaClientKnownRequestError) => {
  const target = conflictTarget(error);
  return target.includes("code") && !target.includes("period")
    ? actualCodeCollision()
    : actualPeriodExists();
};

const actualNotFound = () =>
  new AppError(404, "KPI_ACTUAL_NOT_FOUND", "KPI actual not found");

const invalidActualState = (message: string) =>
  new AppError(409, "KPI_ACTUAL_INVALID_STATE", message);

export class KpiActualService {
  constructor(
    private readonly repository: KpiActualRepository,
    private readonly performanceService: KpiPerformanceService,
    private readonly riskService: RiskService,
    private readonly evidenceGate: EvidenceGateService,
  ) {}

  async listActuals(
    tenantId: string,
    actorUserId: string,
    query: KpiActualListQuery,
  ) {
    const result = await this.repository.listActuals(
      tenantId,
      actorUserId,
      query,
    );
    const risks = await this.repository.findLinkedRisks(
      tenantId,
      result.items.map((item) => item.id),
    );
    return {
      data: result.items.map((item) =>
        kpiActualReadDto(item, risks.get(item.id) ?? null),
      ),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async getActual(tenantId: string, id: string) {
    const actual = await this.repository.findActual(tenantId, id);
    if (!actual) throw actualNotFound();
    const risks = await this.repository.findLinkedRisks(tenantId, [actual.id]);
    return kpiActualReadDto(actual, risks.get(actual.id) ?? null);
  }

  async submitActual(
    tenantId: string,
    actorUserId: string,
    body: CreateKpiActualBody,
    context: AuditContext,
  ) {
    return this.repository.runSubmissionTransaction(
      async (transaction, riskTransaction) => {
        const membership = await transaction.findActiveMembership(
          tenantId,
          actorUserId,
        );
        if (!membership) {
          throw unauthorized("Company context is no longer active");
        }

        const configuration = await transaction.findActiveConfiguration(
          tenantId,
          body.kpiConfigurationId,
        );
        if (!configuration) throw configurationNotFound();

        const target = await transaction.findApprovedTarget(
          tenantId,
          configuration.id,
          body.period,
        );
        if (!target) throw targetNotFound();

        const existing = await transaction.findActiveActual(
          tenantId,
          configuration.id,
          body.period,
        );
        if (existing) throw actualPeriodExists();

        const actualValue = new Prisma.Decimal(body.actualValue);
        const performance = this.performanceService.calculate({
          direction: configuration.definition.direction,
          targetValue: target.targetValue,
          actualValue,
          minValue: target.minValue,
          maxValue: target.maxValue,
          amberThresholdPct:
            configuration.amberThresholdPct ??
            configuration.tenant.defaultAmberThresholdPct,
          redThresholdPct:
            configuration.redThresholdPct ??
            configuration.tenant.defaultRedThresholdPct,
        });
        const submittedAt = new Date();
        // Defense-in-depth: historical invalid pairs never auto-approve.
        assertEvidenceApprovalInvariant(
          configuration.requiresEvidence,
          configuration.requiresApproval,
        );
        const finalStatus = configuration.requiresApproval
          ? "PENDING_APPROVAL"
          : "APPROVED";
        // Evidence-required configs always requireApproval (invariant).
        // requiresEvidence=false auto-approve remains ungated.
        const code = formatKpiActualCode(
          await transaction.allocateNextActualNumber(tenantId),
        );
        let actual: KpiActualRecord;
        try {
          actual = await transaction.createActual(
            tenantId,
            actorUserId,
            submittedAt,
            finalStatus,
            {
              code,
              kpiConfigurationId: configuration.id,
              kpiTargetId: target.id,
              period: target.period,
              periodStart: target.periodStart,
              periodEnd: target.periodEnd,
              targetValueSnapshot: target.targetValue,
              actualValue,
              variance: performance.variance,
              variancePercentage: performance.variancePercentage,
              ragStatus: performance.ragStatus,
              targetMet: performance.targetMet,
              evidenceStatus: body.evidenceStatus ?? null,
              comments: body.comments ?? null,
            },
          );
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw submissionConflict(error);
          }
          throw error;
        }

        let risk: RiskRecord | null = null;
        if (performance.riskRequired) {
          if (
            !performance.recommendedRiskClass ||
            (performance.ragStatus !== "AMBER" &&
              performance.ragStatus !== "RED")
          ) {
            throw new AppError(
              500,
              "KPI_RISK_RECOMMENDATION_MISSING",
              "KPI risk recommendation is unavailable",
            );
          }
          risk = await this.riskService.createAutomaticKpiRisk(
            riskTransaction,
            {
              tenantId,
              actorUserId,
              actualId: actual.id,
              actualValue: actual.actualValue.toString(),
              variance: actual.variance.toString(),
              ragStatus: performance.ragStatus,
              configurationId: configuration.id,
              targetId: target.id,
              targetValueSnapshot: actual.targetValueSnapshot.toString(),
              period: actual.period,
              kpiCode: configuration.definition.code,
              kpiName: configuration.definition.name,
              kpiRiskClass: performance.recommendedRiskClass,
              context,
            },
          );
        }
        await transaction.writeSubmissionAudit(
          tenantId,
          actorUserId,
          actual,
          performance.riskRequired,
          performance.recommendedRiskClass,
          risk,
          context,
        );
        if (finalStatus === "APPROVED") {
          const approval = await transaction.createApproval(
            tenantId,
            actual.id,
            null,
            "APPROVED",
            null,
            submittedAt,
          );
          await transaction.writeWorkflowAudit(
            tenantId,
            actorUserId,
            actual,
            risk,
            {
              action: "KPI_ACTUAL_APPROVED",
              approvalId: approval.id,
              decision: "APPROVED",
              automatic: true,
              configuredApproverFallback: false,
              comments: null,
            },
            context,
          );
        }
        return kpiActualDto(actual, performance, risk);
      },
    );
  }

  private assertDecisionActor(actual: KpiActualRecord, actorUserId: string) {
    if (
      actual.approvalStatus !== "SUBMITTED" &&
      actual.approvalStatus !== "PENDING_APPROVAL"
    ) {
      throw invalidActualState("KPI actual is not pending approval");
    }
    if (actual.submittedById === actorUserId) {
      throw forbidden("KPI actual self-approval is forbidden");
    }
    const configuredApproverId = actual.configuration.approverId;
    const configuredApproverFallback =
      configuredApproverId !== null &&
      configuredApproverId === actual.submittedById;
    if (
      configuredApproverId &&
      !configuredApproverFallback &&
      configuredApproverId !== actorUserId
    ) {
      throw forbidden("Only the configured KPI actual approver may decide");
    }
    return configuredApproverFallback;
  }

  async approveActual(
    tenantId: string,
    id: string,
    actorUserId: string,
    comments: string | null,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      // Order: KpiActual → KpiConfiguration → Evidence (gate) → writes.
      const locked = await transaction.lockActual(tenantId, id);
      if (!locked[0]) throw actualNotFound();

      const existing = await transaction.findWorkflowActual(tenantId, id);
      if (!existing) throw actualNotFound();

      const lockedConfig = await transaction.lockConfigurationForApproval(
        tenantId,
        locked[0].kpi_configuration_id,
      );
      if (!lockedConfig[0]) throw configurationNotFound();
      if (existing.kpiConfigurationId !== lockedConfig[0].id) {
        throw invalidActualState(
          "KPI actual configuration changed while it was being approved",
        );
      }

      // Authoritative flags from locked configuration (not stale include alone).
      const requiresEvidence = lockedConfig[0].requires_evidence;
      const requiresApproval = lockedConfig[0].requires_approval;
      assertEvidenceApprovalInvariant(requiresEvidence, requiresApproval);

      // Overlay locked configuration authority for actor checks.
      const decisionActual = {
        ...existing,
        configuration: {
          ...existing.configuration,
          requiresEvidence,
          requiresApproval,
          approverId: lockedConfig[0].approver_id,
        },
      };
      const configuredApproverFallback = this.assertDecisionActor(
        decisionActual,
        actorUserId,
      );

      // Gate before decision/approval audit; holds Evidence FOR SHARE until commit.
      await this.evidenceGate.assertKpiActualApprovalSatisfied({
        tenantId,
        kpiActualId: id,
        requiresEvidence,
        asOfDate: utcDateString(),
        tx: transaction.transactionClient,
      });

      const decidedAt = new Date();
      const actual = await transaction.decideActual(
        tenantId,
        id,
        actorUserId,
        "APPROVED",
        null,
        decidedAt,
      );
      if (!actual) {
        throw invalidActualState(
          "KPI actual changed while it was being approved",
        );
      }
      const approval = await transaction.createApproval(
        tenantId,
        id,
        actorUserId,
        "APPROVED",
        comments,
        decidedAt,
      );
      const risk = await transaction.findLinkedRisk(tenantId, id);
      await transaction.writeWorkflowAudit(
        tenantId,
        actorUserId,
        actual,
        risk,
        {
          action: "KPI_ACTUAL_APPROVED",
          approvalId: approval.id,
          decision: "APPROVED",
          automatic: false,
          configuredApproverFallback,
          comments,
        },
        context,
      );
      return kpiActualWorkflowDto(actual, risk);
    });
  }

  async rejectActual(
    tenantId: string,
    id: string,
    actorUserId: string,
    reason: string,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const existing = await transaction.findWorkflowActual(tenantId, id);
      if (!existing) throw actualNotFound();
      const configuredApproverFallback = this.assertDecisionActor(
        existing,
        actorUserId,
      );
      const decidedAt = new Date();
      const actual = await transaction.decideActual(
        tenantId,
        id,
        actorUserId,
        "REJECTED",
        reason,
        decidedAt,
      );
      if (!actual) {
        throw invalidActualState(
          "KPI actual changed while it was being rejected",
        );
      }
      const approval = await transaction.createApproval(
        tenantId,
        id,
        actorUserId,
        "REJECTED",
        reason,
        decidedAt,
      );
      const risk = await transaction.findLinkedRisk(tenantId, id);
      await transaction.writeWorkflowAudit(
        tenantId,
        actorUserId,
        actual,
        risk,
        {
          action: "KPI_ACTUAL_REJECTED",
          approvalId: approval.id,
          decision: "REJECTED",
          automatic: false,
          configuredApproverFallback,
          comments: reason,
        },
        context,
      );
      return kpiActualWorkflowDto(actual, risk);
    });
  }

  async resubmitActual(
    tenantId: string,
    id: string,
    actorUserId: string,
    comments: string | null,
    context: AuditContext,
  ) {
    return this.repository.runWorkflowTransaction(async (transaction) => {
      const existing = await transaction.findWorkflowActual(tenantId, id);
      if (!existing) throw actualNotFound();
      if (existing.approvalStatus !== "REJECTED") {
        throw invalidActualState(
          "Only rejected KPI actuals can be resubmitted",
        );
      }
      if (existing.submittedById !== actorUserId) {
        throw forbidden("Only the original submitter may resubmit this actual");
      }
      assertEvidenceApprovalInvariant(
        existing.configuration.requiresEvidence,
        existing.configuration.requiresApproval,
      );
      const finalStatus = existing.configuration.requiresApproval
        ? "PENDING_APPROVAL"
        : "APPROVED";
      // Evidence-required configs never auto-approve (invariant).
      const submittedAt = new Date();
      const actual = await transaction.resubmitActual(
        tenantId,
        id,
        actorUserId,
        finalStatus,
        submittedAt,
      );
      if (!actual) {
        throw invalidActualState(
          "KPI actual changed while it was being resubmitted",
        );
      }
      const resubmission = await transaction.createApproval(
        tenantId,
        id,
        actorUserId,
        "RESUBMITTED",
        comments,
        submittedAt,
      );
      const risk = await transaction.findLinkedRisk(tenantId, id);
      await transaction.writeWorkflowAudit(
        tenantId,
        actorUserId,
        actual,
        risk,
        {
          action: "KPI_ACTUAL_RESUBMITTED",
          approvalId: resubmission.id,
          decision: "RESUBMITTED",
          automatic: false,
          configuredApproverFallback: false,
          comments,
        },
        context,
      );
      if (finalStatus === "APPROVED") {
        const approval = await transaction.createApproval(
          tenantId,
          id,
          null,
          "APPROVED",
          null,
          submittedAt,
        );
        await transaction.writeWorkflowAudit(
          tenantId,
          actorUserId,
          actual,
          risk,
          {
            action: "KPI_ACTUAL_APPROVED",
            approvalId: approval.id,
            decision: "APPROVED",
            automatic: true,
            configuredApproverFallback: false,
            comments: null,
          },
          context,
        );
      }
      return kpiActualWorkflowDto(actual, risk);
    });
  }
}
