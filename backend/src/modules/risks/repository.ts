import {
  Prisma,
  type GeneralRiskLevel,
  type KpiRiskClass,
  type PrismaClient,
  type RiskStatus,
} from "@prisma/client";
import type { AuditContext } from "../kpis/management-repository.js";
import { kpiConfigurationInclude } from "../kpis/management-repository.js";
import type { RiskListQuery } from "./validators.js";

export const riskInclude = Prisma.validator<Prisma.RiskInclude>()({
  kpiActual: {
    select: {
      id: true,
      code: true,
      period: true,
      ragStatus: true,
      targetMet: true,
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

  writeCreatedAudit(
    tenantId: string,
    actorUserId: string,
    risk: RiskRecord,
    context: AuditContext,
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
          automatic: true,
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
    const where: Prisma.RiskWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kpiRiskClass ? { kpiRiskClass: query.kpiRiskClass } : {}),
      ...(query.generalLevel ? { generalLevel: query.generalLevel } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.risk.findMany({
        where,
        include: riskInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: "desc" }, { code: "asc" }],
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
}
