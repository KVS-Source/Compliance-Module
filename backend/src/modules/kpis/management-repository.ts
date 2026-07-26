import {
  Prisma,
  type KpiFrequency,
  type PrismaClient,
  type RecordStatus,
  type SubmissionStatus,
} from "@prisma/client";
import type {
  KpiConfigurationListQuery,
  KpiTargetListQuery,
} from "./management-validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

export const kpiConfigurationInclude =
  Prisma.validator<Prisma.KpiConfigurationInclude>()({
    definition: true,
    orgUnit: true,
    orgLocation: true,
    department: true,
    owner: { select: { id: true, code: true, fullName: true } },
    approver: { select: { id: true, code: true, fullName: true } },
  });

export const kpiTargetInclude = Prisma.validator<Prisma.KpiTargetInclude>()({
  configuration: { include: kpiConfigurationInclude },
  submittedBy: { select: { id: true, code: true, fullName: true } },
  approvedBy: { select: { id: true, code: true, fullName: true } },
});

export type KpiConfigurationRecord = Prisma.KpiConfigurationGetPayload<{
  include: typeof kpiConfigurationInclude;
}>;

export type KpiTargetRecord = Prisma.KpiTargetGetPayload<{
  include: typeof kpiTargetInclude;
}>;

export interface ConfigurationWriteData {
  kpiDefinitionId: string;
  orgUnitId?: string | null;
  orgLocationId?: string | null;
  productService?: string | null;
  departmentId?: string | null;
  ownerId: string;
  approverId?: string | null;
  enabled: boolean;
  currency?: string | null;
  reviewFrequency: KpiFrequency;
  amberThresholdPct?: Prisma.Decimal | null;
  redThresholdPct?: Prisma.Decimal | null;
  requiresEvidence: boolean;
  requiresApproval: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: RecordStatus;
}

export type ConfigurationPatchData = Partial<ConfigurationWriteData>;

export interface TargetWriteData {
  kpiConfigurationId: string;
  code: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  targetValue: Prisma.Decimal;
  minValue?: Prisma.Decimal | null;
  maxValue?: Prisma.Decimal | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: RecordStatus;
}

export type TargetPatchData = Partial<
  Omit<TargetWriteData, "kpiConfigurationId">
>;

const audit = (
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: "KPI_CONFIGURATION" | "KPI_TARGET";
    entityId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  },
) =>
  transaction.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ...(input.context.ip ? { ipAddress: input.context.ip } : {}),
      ...(input.context.userAgent
        ? { userAgent: input.context.userAgent }
        : {}),
    },
  });

export class KpiManagementRepository {
  constructor(private readonly db: PrismaClient) {}

  async listConfigurations(tenantId: string, query: KpiConfigurationListQuery) {
    const where: Prisma.KpiConfigurationWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.kpiDefinitionId
        ? { kpiDefinitionId: query.kpiDefinitionId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.enabled === undefined ? {} : { enabled: query.enabled }),
    };
    const bounds = {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const [items, total] = await this.db.$transaction([
      this.db.kpiConfiguration.findMany({
        where,
        include: kpiConfigurationInclude,
        ...bounds,
        orderBy: [{ definition: { code: "asc" } }, { createdAt: "desc" }],
      }),
      this.db.kpiConfiguration.count({ where }),
    ]);
    return { items, total };
  }

  findConfiguration(tenantId: string, id: string) {
    return this.db.kpiConfiguration.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: kpiConfigurationInclude,
    });
  }

  findKpiDefinition(id: string) {
    return this.db.kpiDefinition.findFirst({
      where: { id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findTenantUser(tenantId: string, userId: string) {
    return this.db.userCompany.findFirst({
      where: {
        tenantId,
        userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
  }

  findDepartment(tenantId: string, id: string) {
    return this.db.orgDepartment.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findLocation(tenantId: string, id: string) {
    return this.db.orgLocation.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findUnit(tenantId: string, id: string) {
    return this.db.orgUnit.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  getTenantThresholds(tenantId: string) {
    return this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        defaultAmberThresholdPct: true,
        defaultRedThresholdPct: true,
      },
    });
  }

  createConfiguration(
    tenantId: string,
    actorUserId: string,
    data: ConfigurationWriteData,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const configuration = await transaction.kpiConfiguration.create({
        data: {
          tenantId,
          ...data,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: kpiConfigurationInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_CONFIGURATION_CREATED",
        entityType: "KPI_CONFIGURATION",
        entityId: configuration.id,
        metadata: {
          kpiDefinitionId: configuration.kpiDefinitionId,
          enabled: configuration.enabled,
          status: configuration.status,
        },
        context,
      });
      return configuration;
    });
  }

  updateConfiguration(
    tenantId: string,
    id: string,
    actorUserId: string,
    data: ConfigurationPatchData,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiConfiguration.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return null;

      const configuration = await transaction.kpiConfiguration.update({
        where: { id },
        data: { ...data, updatedById: actorUserId },
        include: kpiConfigurationInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_CONFIGURATION_UPDATED",
        entityType: "KPI_CONFIGURATION",
        entityId: configuration.id,
        metadata: {
          updatedFields: Object.keys(data),
          enabled: configuration.enabled,
          status: configuration.status,
        },
        context,
      });
      return configuration;
    });
  }

  deleteConfiguration(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiConfiguration.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return null;
      const configuration = await transaction.kpiConfiguration.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          enabled: false,
          status: "DISABLED",
          updatedById: actorUserId,
        },
        include: kpiConfigurationInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_CONFIGURATION_DELETED",
        entityType: "KPI_CONFIGURATION",
        entityId: configuration.id,
        metadata: { status: configuration.status },
        context,
      });
      return configuration;
    });
  }

  async listTargets(tenantId: string, query: KpiTargetListQuery) {
    const where: Prisma.KpiTargetWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.kpiConfigurationId
        ? { kpiConfigurationId: query.kpiConfigurationId }
        : {}),
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const bounds = {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const [items, total] = await this.db.$transaction([
      this.db.kpiTarget.findMany({
        where,
        include: kpiTargetInclude,
        ...bounds,
        orderBy: [
          { periodStart: "desc" },
          { version: "desc" },
          { createdAt: "desc" },
        ],
      }),
      this.db.kpiTarget.count({ where }),
    ]);
    return { items, total };
  }

  findTarget(tenantId: string, id: string) {
    return this.db.kpiTarget.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: kpiTargetInclude,
    });
  }

  createTarget(
    tenantId: string,
    actorUserId: string,
    data: TargetWriteData,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const target = await transaction.kpiTarget.create({
        data: {
          tenantId,
          ...data,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: kpiTargetInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_TARGET_CREATED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          code: target.code,
          period: target.period,
          version: target.version,
          approvalStatus: target.approvalStatus,
        },
        context,
      });
      return target;
    });
  }

  updateTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    data: TargetPatchData,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiTarget.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
          approvalStatus: { in: ["DRAFT", "REJECTED"] },
        },
        select: { id: true },
      });
      if (!existing) return null;
      const target = await transaction.kpiTarget.update({
        where: { id },
        data: { ...data, updatedById: actorUserId },
        include: kpiTargetInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_TARGET_UPDATED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          code: target.code,
          version: target.version,
          updatedFields: Object.keys(data),
        },
        context,
      });
      return target;
    });
  }

  deleteTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiTarget.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
          approvalStatus: { in: ["DRAFT", "REJECTED"] },
        },
        select: { id: true },
      });
      if (!existing) return null;
      const target = await transaction.kpiTarget.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: "DISABLED",
          updatedById: actorUserId,
        },
        include: kpiTargetInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_TARGET_DELETED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          code: target.code,
          version: target.version,
          approvalStatus: target.approvalStatus,
        },
        context,
      });
      return target;
    });
  }

  submitTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    finalStatus: Extract<SubmissionStatus, "PENDING_APPROVAL" | "APPROVED">,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiTarget.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
          approvalStatus: { in: ["DRAFT", "REJECTED"] },
        },
        select: { id: true },
      });
      if (!existing) return null;
      const now = new Date();
      const target = await transaction.kpiTarget.update({
        where: { id },
        data: {
          approvalStatus: finalStatus,
          submittedById: actorUserId,
          submittedAt: now,
          approvedById: null,
          approvedAt: finalStatus === "APPROVED" ? now : null,
          rejectionReason: null,
          updatedById: actorUserId,
        },
        include: kpiTargetInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_TARGET_SUBMITTED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          code: target.code,
          version: target.version,
          approvalStatus: target.approvalStatus,
        },
        context,
      });
      if (finalStatus === "APPROVED") {
        await audit(transaction, {
          tenantId,
          actorUserId,
          action: "KPI_TARGET_APPROVED",
          entityType: "KPI_TARGET",
          entityId: target.id,
          metadata: {
            code: target.code,
            version: target.version,
            automatic: true,
          },
          context,
        });
      }
      return target;
    });
  }

  decideTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    decision: Extract<SubmissionStatus, "APPROVED" | "REJECTED">,
    rejectionReason: string | null,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiTarget.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
          approvalStatus: "PENDING_APPROVAL",
        },
        select: { id: true },
      });
      if (!existing) return null;
      const target = await transaction.kpiTarget.update({
        where: { id },
        data: {
          approvalStatus: decision,
          approvedById: decision === "APPROVED" ? actorUserId : null,
          approvedAt: decision === "APPROVED" ? new Date() : null,
          rejectionReason: decision === "REJECTED" ? rejectionReason : null,
          updatedById: actorUserId,
        },
        include: kpiTargetInclude,
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action:
          decision === "APPROVED"
            ? "KPI_TARGET_APPROVED"
            : "KPI_TARGET_REJECTED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          code: target.code,
          version: target.version,
          approvalStatus: target.approvalStatus,
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        context,
      });
      return target;
    });
  }

  createTargetVersion(
    tenantId: string,
    id: string,
    actorUserId: string,
    data: TargetPatchData & { code: string },
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.kpiTarget.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
          approvalStatus: "APPROVED",
          supersededById: null,
        },
      });
      if (!existing) return null;

      const target = await transaction.kpiTarget.create({
        data: {
          tenantId,
          kpiConfigurationId: existing.kpiConfigurationId,
          code: data.code,
          period: data.period ?? existing.period,
          periodStart: data.periodStart ?? existing.periodStart,
          periodEnd: data.periodEnd ?? existing.periodEnd,
          targetValue: data.targetValue ?? existing.targetValue,
          minValue:
            data.minValue === undefined ? existing.minValue : data.minValue,
          maxValue:
            data.maxValue === undefined ? existing.maxValue : data.maxValue,
          approvalStatus: "DRAFT",
          version: existing.version + 1,
          effectiveFrom: data.effectiveFrom ?? existing.effectiveFrom,
          effectiveTo:
            data.effectiveTo === undefined
              ? existing.effectiveTo
              : data.effectiveTo,
          status: data.status ?? existing.status,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: kpiTargetInclude,
      });
      await transaction.kpiTarget.update({
        where: { id: existing.id },
        data: {
          supersededById: target.id,
          updatedById: actorUserId,
        },
      });
      await audit(transaction, {
        tenantId,
        actorUserId,
        action: "KPI_TARGET_VERSIONED",
        entityType: "KPI_TARGET",
        entityId: target.id,
        metadata: {
          previousTargetId: existing.id,
          code: target.code,
          period: target.period,
          version: target.version,
        },
        context,
      });
      return target;
    });
  }
}
