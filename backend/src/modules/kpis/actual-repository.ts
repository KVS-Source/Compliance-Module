import {
  Prisma,
  type ApprovalDecision,
  type PrismaClient,
  type SubmissionStatus,
} from "@prisma/client";
import { kpiConfigurationInclude } from "./management-repository.js";
import type { AuditContext } from "./management-repository.js";
import {
  riskInclude,
  RiskTransactionRepository,
  type RiskRecord,
} from "../risks/repository.js";

export const kpiActualInclude = Prisma.validator<Prisma.KpiActualInclude>()({
  configuration: { include: kpiConfigurationInclude },
  target: {
    select: {
      id: true,
      code: true,
      version: true,
    },
  },
  submittedBy: { select: { id: true, code: true, fullName: true } },
  approvedBy: { select: { id: true, code: true, fullName: true } },
});

export type KpiActualRecord = Prisma.KpiActualGetPayload<{
  include: typeof kpiActualInclude;
}>;

export interface KpiActualCreateData {
  code: string;
  kpiConfigurationId: string;
  kpiTargetId: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  targetValueSnapshot: Prisma.Decimal;
  actualValue: Prisma.Decimal;
  variance: Prisma.Decimal;
  variancePercentage: Prisma.Decimal | null;
  ragStatus: "GREEN" | "AMBER" | "RED" | null;
  targetMet: boolean;
  evidenceStatus: string | null;
  comments: string | null;
}

export interface KpiActualWorkflowResult {
  actual: KpiActualRecord;
  risk: RiskRecord | null;
}

const linkedRiskMetadata = (risk: RiskRecord | null) =>
  risk
    ? {
        linkedRiskId: risk.id,
        linkedRiskCode: risk.code,
        linkedRiskStatus: risk.status,
      }
    : {};

export class KpiActualTransactionRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  findActiveMembership(tenantId: string, actorUserId: string) {
    return this.transaction.userCompany.findFirst({
      where: {
        tenantId,
        userId: actorUserId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: "ACTIVE" },
      },
      select: { id: true },
    });
  }

  findActiveConfiguration(tenantId: string, configurationId: string) {
    return this.transaction.kpiConfiguration.findFirst({
      where: {
        id: configurationId,
        tenantId,
        enabled: true,
        status: "ACTIVE",
        deletedAt: null,
        definition: { status: "ACTIVE" },
      },
      include: {
        definition: true,
        tenant: {
          select: {
            defaultAmberThresholdPct: true,
            defaultRedThresholdPct: true,
          },
        },
      },
    });
  }

  findApprovedTarget(
    tenantId: string,
    configurationId: string,
    period: string,
  ) {
    return this.transaction.kpiTarget.findFirst({
      where: {
        tenantId,
        kpiConfigurationId: configurationId,
        period,
        approvalStatus: "APPROVED",
        status: "ACTIVE",
        deletedAt: null,
      },
      orderBy: [{ version: "desc" }, { approvedAt: "desc" }],
      select: {
        id: true,
        code: true,
        version: true,
        period: true,
        periodStart: true,
        periodEnd: true,
        targetValue: true,
        minValue: true,
        maxValue: true,
      },
    });
  }

  findActiveActual(tenantId: string, configurationId: string, period: string) {
    return this.transaction.kpiActual.findFirst({
      where: {
        tenantId,
        kpiConfigurationId: configurationId,
        period,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  createActual(
    tenantId: string,
    actorUserId: string,
    submittedAt: Date,
    finalStatus: Extract<SubmissionStatus, "PENDING_APPROVAL" | "APPROVED">,
    data: KpiActualCreateData,
  ) {
    return this.transaction.kpiActual.create({
      data: {
        tenantId,
        ...data,
        approvalStatus: finalStatus,
        submittedById: actorUserId,
        submittedAt,
        approvedById: null,
        approvedAt: finalStatus === "APPROVED" ? submittedAt : null,
        rejectionReason: null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: kpiActualInclude,
    });
  }

  findWorkflowActual(tenantId: string, id: string) {
    return this.transaction.kpiActual.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: kpiActualInclude,
    });
  }

  async decideActual(
    tenantId: string,
    id: string,
    actorUserId: string,
    decision: Extract<ApprovalDecision, "APPROVED" | "REJECTED">,
    reason: string | null,
    decidedAt: Date,
  ) {
    const result = await this.transaction.kpiActual.updateMany({
      where: {
        id,
        tenantId,
        deletedAt: null,
        approvalStatus: { in: ["SUBMITTED", "PENDING_APPROVAL"] },
      },
      data: {
        approvalStatus: decision,
        approvedById: decision === "APPROVED" ? actorUserId : null,
        approvedAt: decision === "APPROVED" ? decidedAt : null,
        rejectionReason: decision === "REJECTED" ? reason : null,
        updatedById: actorUserId,
      },
    });
    if (result.count !== 1) return null;
    return this.transaction.kpiActual.findUniqueOrThrow({
      where: { id },
      include: kpiActualInclude,
    });
  }

  async resubmitActual(
    tenantId: string,
    id: string,
    actorUserId: string,
    finalStatus: Extract<SubmissionStatus, "PENDING_APPROVAL" | "APPROVED">,
    submittedAt: Date,
  ) {
    const result = await this.transaction.kpiActual.updateMany({
      where: {
        id,
        tenantId,
        deletedAt: null,
        approvalStatus: "REJECTED",
        submittedById: actorUserId,
      },
      data: {
        approvalStatus: finalStatus,
        submittedAt,
        approvedById: null,
        approvedAt: finalStatus === "APPROVED" ? submittedAt : null,
        rejectionReason: null,
        updatedById: actorUserId,
      },
    });
    if (result.count !== 1) return null;
    return this.transaction.kpiActual.findUniqueOrThrow({
      where: { id },
      include: kpiActualInclude,
    });
  }

  createApproval(
    tenantId: string,
    actualId: string,
    reviewerId: string | null,
    decision: ApprovalDecision,
    comments: string | null,
    decidedAt: Date,
  ) {
    return this.transaction.kpiApproval.create({
      data: {
        tenantId,
        kpiActualId: actualId,
        reviewerId,
        decision,
        comments,
        decidedAt,
      },
    });
  }

  findLinkedRisk(tenantId: string, actualId: string) {
    return this.transaction.risk.findFirst({
      where: {
        tenantId,
        kpiActualId: actualId,
        deletedAt: null,
      },
      include: riskInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  writeWorkflowAudit(
    tenantId: string,
    actorUserId: string,
    actual: KpiActualRecord,
    risk: RiskRecord | null,
    input: {
      action:
        | "KPI_ACTUAL_APPROVED"
        | "KPI_ACTUAL_REJECTED"
        | "KPI_ACTUAL_RESUBMITTED";
      approvalId: string;
      decision: ApprovalDecision;
      automatic: boolean;
      configuredApproverFallback: boolean;
      comments: string | null;
    },
    context: AuditContext,
  ) {
    return this.transaction.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: input.action,
        entityType: "KPI_ACTUAL",
        entityId: actual.id,
        metadata: {
          code: actual.code,
          approvalId: input.approvalId,
          decision: input.decision,
          approvalStatus: actual.approvalStatus,
          automatic: input.automatic,
          configuredApproverFallback: input.configuredApproverFallback,
          ...(input.comments ? { comments: input.comments } : {}),
          ...linkedRiskMetadata(risk),
        },
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
  }

  writeSubmissionAudit(
    tenantId: string,
    actorUserId: string,
    actual: KpiActualRecord,
    riskRequired: boolean,
    recommendedRiskClass: "MINOR" | "MAJOR" | null,
    risk: { id: string; code: string } | null,
    context: AuditContext,
  ) {
    return this.transaction.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: "KPI_ACTUAL_SUBMITTED",
        entityType: "KPI_ACTUAL",
        entityId: actual.id,
        metadata: {
          code: actual.code,
          kpiConfigurationId: actual.kpiConfigurationId,
          kpiTargetId: actual.kpiTargetId,
          targetVersion: actual.target.version,
          period: actual.period,
          targetValueSnapshot: actual.targetValueSnapshot.toString(),
          actualValue: actual.actualValue.toString(),
          targetMet: actual.targetMet,
          ragStatus: actual.ragStatus,
          approvalStatus: actual.approvalStatus,
          riskRequired,
          recommendedRiskClass,
          ...(risk ? { riskId: risk.id, riskCode: risk.code } : {}),
        },
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
  }
}

export class KpiActualRepository {
  constructor(private readonly db: PrismaClient) {}

  runSubmissionTransaction<T>(
    operation: (
      repository: KpiActualTransactionRepository,
      riskRepository: RiskTransactionRepository,
    ) => Promise<T>,
  ) {
    return this.db.$transaction((transaction) =>
      operation(
        new KpiActualTransactionRepository(transaction),
        new RiskTransactionRepository(transaction),
      ),
    );
  }

  runWorkflowTransaction<T>(
    operation: (repository: KpiActualTransactionRepository) => Promise<T>,
  ) {
    return this.db.$transaction((transaction) =>
      operation(new KpiActualTransactionRepository(transaction)),
    );
  }
}
