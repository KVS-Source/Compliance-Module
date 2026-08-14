import {
  Prisma,
  type GeneralRiskLevel,
  type KpiRiskClass,
  type PrismaClient,
  type RiskStatus,
  type RiskTreatmentStatus,
  type RiskTreatmentStrategy,
} from "@prisma/client";
import type { AuditContext } from "../kpis/management-repository.js";
import { kpiConfigurationInclude } from "../kpis/management-repository.js";
import {
  ACTIVE_RISK_STATUSES,
  CLOSED_RISK_STATUSES,
  type RiskListQuery,
} from "./validators.js";

export const riskInclude = Prisma.validator<Prisma.RiskInclude>()({
  kpiActual: {
    select: {
      id: true,
      code: true,
      period: true,
      ragStatus: true,
      targetMet: true,
      actualValue: true,
      variance: true,
      targetValueSnapshot: true,
    },
  },
  configuration: { include: kpiConfigurationInclude },
  target: {
    select: {
      id: true,
      code: true,
      version: true,
    },
  },
  owner: { select: { id: true, code: true, fullName: true } },
});

export type RiskRecord = Prisma.RiskGetPayload<{
  include: typeof riskInclude;
}>;

const personSelect = { select: { id: true, code: true, fullName: true } };

/**
 * Detail include adding the append-only review and treatment ledgers. Kept
 * separate from `riskInclude` so the register list and the automatic-creation
 * path keep their existing query shape.
 */
export const riskDetailInclude = Prisma.validator<Prisma.RiskInclude>()({
  ...riskInclude,
  reviews: {
    include: { reviewer: personSelect },
    orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
  },
  treatments: {
    include: { owner: personSelect, recordedBy: personSelect },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  },
});

export type RiskDetailRecord = Prisma.RiskGetPayload<{
  include: typeof riskDetailInclude;
}>;

/**
 * Prisma's own update input, so `exactOptionalPropertyTypes` does not smuggle
 * `undefined` into optional columns when a patch is spread.
 */
export type RiskWorkflowPatch = Prisma.RiskUncheckedUpdateInput;

export interface AutomaticRiskCreateData {
  code: string;
  title: string;
  description: string;
  category: null;
  kpiActualId: string;
  kpiConfigurationId: string;
  kpiTargetId: string;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  kpiRiskClass: KpiRiskClass;
  generalLevel: GeneralRiskLevel;
  ownerId: null;
  status: Extract<RiskStatus, "OPEN">;
}

export interface ManualRiskCreateData {
  code: string;
  title: string;
  description: string;
  category: string;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  generalLevel: GeneralRiskLevel;
  ownerId: string | null;
  status: Extract<RiskStatus, "OPEN">;
}

/** Builds the tenant-scoped list filter. Specific `status` overrides `lifecycle`. */
export const buildRiskListWhere = (
  tenantId: string,
  query: RiskListQuery,
): Prisma.RiskWhereInput => {
  const where: Prisma.RiskWhereInput = {
    tenantId,
    deletedAt: null,
    ...(query.kpiRiskClass ? { kpiRiskClass: query.kpiRiskClass } : {}),
    ...(query.generalLevel ? { generalLevel: query.generalLevel } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
  };

  if (query.status) {
    where.status = query.status;
  } else if (query.lifecycle === "active") {
    where.status = { in: [...ACTIVE_RISK_STATUSES] };
  } else if (query.lifecycle === "closed") {
    where.status = { in: [...CLOSED_RISK_STATUSES] };
  }

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { code: { contains: query.q, mode: "insensitive" } },
      {
        configuration: {
          is: {
            tenantId,
            definition: {
              code: { contains: query.q, mode: "insensitive" },
            },
          },
        },
      },
      {
        configuration: {
          is: {
            tenantId,
            definition: {
              name: { contains: query.q, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  return where;
};

export class RiskTransactionRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async allocateNextRiskNumber(tenantId: string) {
    const tenant = await this.transaction.tenant.update({
      where: { id: tenantId },
      data: { nextRiskNumber: { increment: 1 } },
      select: { nextRiskNumber: true },
    });
    return tenant.nextRiskNumber - 1;
  }

  createAutomaticRisk(
    tenantId: string,
    actorUserId: string,
    data: AutomaticRiskCreateData,
  ) {
    return this.transaction.risk.create({
      data: {
        tenantId,
        ...data,
        residualLikelihood: null,
        residualImpact: null,
        residualScore: null,
        treatmentStrategy: null,
        reviewDate: null,
        closedAt: null,
        closureReason: null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: riskInclude,
    });
  }

  findActiveMember(tenantId: string, userId: string) {
    return this.transaction.userCompany.findFirst({
      where: {
        tenantId,
        userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
  }

  createManualRisk(
    tenantId: string,
    actorUserId: string,
    data: ManualRiskCreateData,
  ) {
    return this.transaction.risk.create({
      data: {
        tenantId,
        ...data,
        kpiActualId: null,
        kpiConfigurationId: null,
        kpiTargetId: null,
        kpiRiskClass: null,
        residualLikelihood: null,
        residualImpact: null,
        residualScore: null,
        treatmentStrategy: null,
        reviewDate: null,
        closedAt: null,
        closureReason: null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: riskInclude,
    });
  }

  writeCreatedAudit(
    tenantId: string,
    actorUserId: string,
    risk: RiskRecord,
    context: AuditContext,
    automatic = true,
  ) {
    return this.transaction.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: "RISK_CREATED",
        entityType: "RISK",
        entityId: risk.id,
        metadata: {
          code: risk.code,
          kpiActualId: risk.kpiActualId,
          kpiConfigurationId: risk.kpiConfigurationId,
          kpiTargetId: risk.kpiTargetId,
          kpiRiskClass: risk.kpiRiskClass,
          generalLevel: risk.generalLevel,
          inherentLikelihood: risk.inherentLikelihood,
          inherentImpact: risk.inherentImpact,
          inherentScore: risk.inherentScore,
          automatic,
        },
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
  }
}

export class RiskRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, query: RiskListQuery) {
    const where = buildRiskListWhere(tenantId, query);
    const [items, total] = await this.db.$transaction([
      this.db.risk.findMany({
        where,
        include: riskInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy:
          query.orderBy === undefined
            ? [{ createdAt: "desc" }, { code: "asc" }]
            : [{ [query.orderBy]: query.order ?? "asc" }, { code: "asc" }],
      }),
      this.db.risk.count({ where }),
    ]);
    return { items, total };
  }

  find(tenantId: string, id: string) {
    return this.db.risk.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: riskInclude,
    });
  }

  findDetail(tenantId: string, id: string) {
    return this.db.risk.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: riskDetailInclude,
    });
  }

  runCreationTransaction<T>(
    operation: (repository: RiskTransactionRepository) => Promise<T>,
  ) {
    return this.db.$transaction((transaction) =>
      operation(new RiskTransactionRepository(transaction)),
    );
  }

  runWorkflowTransaction<T>(
    operation: (repository: RiskWorkflowRepository) => Promise<T>,
  ) {
    return this.db.$transaction((transaction) =>
      operation(new RiskWorkflowRepository(transaction)),
    );
  }
}

export class RiskWorkflowRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  findForUpdate(tenantId: string, id: string) {
    return this.transaction.risk.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: riskDetailInclude,
    });
  }

  /**
   * Another live risk on the same KPI actual, which
   * `risks_one_active_per_kpi_actual` would reject. Used to refuse a reopen
   * with a specific error instead of a bare unique-index violation.
   */
  findCompetingActiveRisk(tenantId: string, kpiActualId: string, excludeId: string) {
    return this.transaction.risk.findFirst({
      where: {
        tenantId,
        kpiActualId,
        deletedAt: null,
        id: { not: excludeId },
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
      select: { id: true, code: true, status: true },
    });
  }

  findActiveMember(tenantId: string, userId: string) {
    return this.transaction.userCompany.findFirst({
      where: { tenantId, userId, status: "ACTIVE", user: { status: "ACTIVE" } },
      select: { userId: true },
    });
  }

  findTreatment(tenantId: string, riskId: string, treatmentId: string) {
    return this.transaction.riskTreatment.findFirst({
      where: { tenantId, riskId, id: treatmentId },
    });
  }

  /** A later row already supersedes this treatment, so it cannot be reused. */
  findSupersedingTreatment(tenantId: string, treatmentId: string) {
    return this.transaction.riskTreatment.findFirst({
      where: { tenantId, supersedesId: treatmentId },
      select: { id: true },
    });
  }

  createReview(
    tenantId: string,
    riskId: string,
    reviewerId: string,
    data: {
      comments: string;
      likelihoodAtReview: number | null;
      impactAtReview: number | null;
    },
  ) {
    return this.transaction.riskReview.create({
      data: { tenantId, riskId, reviewerId, ...data },
    });
  }

  createTreatment(
    tenantId: string,
    riskId: string,
    recordedById: string,
    data: {
      strategy: RiskTreatmentStrategy;
      plan: string;
      ownerId: string | null;
      dueDate: Date | null;
      status: RiskTreatmentStatus;
      completedAt: Date | null;
      effectivenessNotes: string | null;
      supersedesId: string | null;
    },
  ) {
    return this.transaction.riskTreatment.create({
      data: { tenantId, riskId, recordedById, ...data },
    });
  }

  updateRisk(
    tenantId: string,
    id: string,
    actorUserId: string,
    patch: RiskWorkflowPatch,
  ) {
    return this.transaction.risk.update({
      where: { id },
      data: { ...patch, updatedById: actorUserId },
      include: riskDetailInclude,
    });
  }

  writeAudit(
    tenantId: string,
    actorUserId: string,
    action: string,
    riskId: string,
    metadata: Prisma.InputJsonValue,
    context: AuditContext,
  ) {
    return this.transaction.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action,
        entityType: "RISK",
        entityId: riskId,
        metadata,
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
  }
}
