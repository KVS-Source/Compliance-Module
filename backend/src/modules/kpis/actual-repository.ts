import { Prisma, type PrismaClient } from "@prisma/client";
import { kpiConfigurationInclude } from "./management-repository.js";
import type { AuditContext } from "./management-repository.js";

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
    data: KpiActualCreateData,
  ) {
    return this.transaction.kpiActual.create({
      data: {
        tenantId,
        ...data,
        approvalStatus: "SUBMITTED",
        submittedById: actorUserId,
        submittedAt,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: kpiActualInclude,
    });
  }

  writeSubmissionAudit(
    tenantId: string,
    actorUserId: string,
    actual: KpiActualRecord,
    riskRequired: boolean,
    recommendedRiskClass: "MINOR" | "MAJOR" | null,
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
          riskRequired,
          recommendedRiskClass,
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
    operation: (repository: KpiActualTransactionRepository) => Promise<T>,
  ) {
    return this.db.$transaction((transaction) =>
      operation(new KpiActualTransactionRepository(transaction)),
    );
  }
}
