import { Prisma } from "@prisma/client";
import {
  AppError,
  forbidden,
  notFound,
} from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type {
  AuditContext,
  ConfigurationPatchData,
  ConfigurationWriteData,
  KpiConfigurationRecord,
  KpiManagementRepository,
  KpiTargetRecord,
  TargetPatchData,
  TargetWriteData,
} from "./management-repository.js";
import type {
  CreateKpiConfigurationBody,
  CreateKpiTargetBody,
  KpiConfigurationListQuery,
  KpiTargetListQuery,
  UpdateKpiConfigurationBody,
  UpdateKpiTargetBody,
  VersionKpiTargetBody,
} from "./management-validators.js";

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

const inputDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const personDto = (
  person: { id: string; code: string; fullName: string } | null,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

export const kpiConfigurationDto = (record: KpiConfigurationRecord) => ({
  id: record.id,
  kpi: {
    id: record.definition.id,
    code: record.definition.code,
    name: record.definition.name,
    unit: record.definition.unit,
    direction: record.definition.direction,
    frequency: record.definition.frequency,
  },
  orgUnit: record.orgUnit
    ? {
        id: record.orgUnit.id,
        code: record.orgUnit.code,
        name: record.orgUnit.name,
      }
    : null,
  orgLocation: record.orgLocation
    ? {
        id: record.orgLocation.id,
        code: record.orgLocation.code,
        name: record.orgLocation.name,
      }
    : null,
  productService: record.productService,
  department: record.department
    ? {
        id: record.department.id,
        code: record.department.code,
        name: record.department.name,
      }
    : null,
  owner: personDto(record.owner),
  approver: personDto(record.approver),
  enabled: record.enabled,
  currency: record.currency,
  reviewFrequency: record.reviewFrequency,
  amberThresholdPct: record.amberThresholdPct?.toString() ?? null,
  redThresholdPct: record.redThresholdPct?.toString() ?? null,
  requiresEvidence: record.requiresEvidence,
  requiresApproval: record.requiresApproval,
  effectiveFrom: dateOnly(record.effectiveFrom),
  effectiveTo: dateOnly(record.effectiveTo),
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const kpiThresholdDefaultsDto = (defaults: {
  defaultAmberThresholdPct: Prisma.Decimal;
  defaultRedThresholdPct: Prisma.Decimal;
}) => ({
  defaultAmberThresholdPct: defaults.defaultAmberThresholdPct.toString(),
  defaultRedThresholdPct: defaults.defaultRedThresholdPct.toString(),
});

export const kpiTargetDto = (record: KpiTargetRecord) => ({
  id: record.id,
  code: record.code,
  configuration: kpiConfigurationDto(record.configuration),
  period: record.period,
  periodStart: dateOnly(record.periodStart),
  periodEnd: dateOnly(record.periodEnd),
  targetValue: record.targetValue.toString(),
  minValue: record.minValue?.toString() ?? null,
  maxValue: record.maxValue?.toString() ?? null,
  approvalStatus: record.approvalStatus,
  submittedBy: personDto(record.submittedBy),
  submittedAt: record.submittedAt,
  approvedBy: personDto(record.approvedBy),
  approvedAt: record.approvedAt,
  rejectionReason: record.rejectionReason,
  version: record.version,
  supersededById: record.supersededById,
  effectiveFrom: dateOnly(record.effectiveFrom),
  effectiveTo: dateOnly(record.effectiveTo),
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const relatedRecordError = (message: string) =>
  new AppError(400, "RELATED_RECORD_INVALID", message);

const invalidTargetState = (message: string) =>
  new AppError(409, "KPI_TARGET_STATE_INVALID", message);

const approvedTargetImmutable = () =>
  new AppError(
    409,
    "KPI_TARGET_APPROVED_IMMUTABLE",
    "Approved KPI targets cannot be edited; create a new version",
  );

export class KpiManagementService {
  constructor(private readonly repository: KpiManagementRepository) {}

  async listConfigurations(tenantId: string, query: KpiConfigurationListQuery) {
    const result = await this.repository.listConfigurations(tenantId, query);
    return {
      data: result.items.map(kpiConfigurationDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async getConfiguration(tenantId: string, id: string) {
    const configuration = await this.repository.findConfiguration(tenantId, id);
    if (!configuration) throw notFound("KPI configuration not found");
    return configuration;
  }

  /**
   * Company threshold defaults that apply when a configuration leaves
   * `amberThresholdPct` / `redThresholdPct` null. Exposed read-only so the UI
   * can name the inherited value instead of substituting a guess.
   */
  async getThresholdDefaults(tenantId: string) {
    const defaults = await this.repository.getTenantThresholds(tenantId);
    return kpiThresholdDefaultsDto(defaults);
  }

  private async assertConfigurationReferences(
    tenantId: string,
    input: {
      kpiDefinitionId: string;
      ownerId: string;
      approverId?: string | null;
      orgUnitId?: string | null;
      orgLocationId?: string | null;
      departmentId?: string | null;
    },
  ) {
    const [definition, owner, approver, unit, location, department] =
      await Promise.all([
        this.repository.findKpiDefinition(input.kpiDefinitionId),
        this.repository.findTenantUser(tenantId, input.ownerId),
        input.approverId
          ? this.repository.findTenantUser(tenantId, input.approverId)
          : Promise.resolve(null),
        input.orgUnitId
          ? this.repository.findUnit(tenantId, input.orgUnitId)
          : Promise.resolve(null),
        input.orgLocationId
          ? this.repository.findLocation(tenantId, input.orgLocationId)
          : Promise.resolve(null),
        input.departmentId
          ? this.repository.findDepartment(tenantId, input.departmentId)
          : Promise.resolve(null),
      ]);

    if (!definition) throw relatedRecordError("KPI definition is not active");
    if (!owner) {
      throw relatedRecordError(
        "Owner must be an active user in the current Company",
      );
    }
    if (input.approverId && !approver) {
      throw relatedRecordError(
        "Approver must be an active user in the current Company",
      );
    }
    if (input.orgUnitId && !unit) {
      throw relatedRecordError(
        "Organisation unit does not belong to the current Company",
      );
    }
    if (input.orgLocationId && !location) {
      throw relatedRecordError(
        "Location does not belong to the current Company",
      );
    }
    if (input.departmentId && !department) {
      throw relatedRecordError(
        "Department does not belong to the current Company",
      );
    }
  }

  private async assertThresholds(
    tenantId: string,
    amber: Prisma.Decimal | null,
    red: Prisma.Decimal | null,
  ) {
    const defaults = await this.repository.getTenantThresholds(tenantId);
    const resolvedAmber = amber ?? defaults.defaultAmberThresholdPct;
    const resolvedRed = red ?? defaults.defaultRedThresholdPct;
    if (resolvedRed.lessThan(resolvedAmber)) {
      throw new AppError(
        400,
        "KPI_THRESHOLDS_INVALID",
        "Red threshold must not be below amber threshold after Company defaults are applied",
      );
    }
  }

  async createConfiguration(
    tenantId: string,
    actorUserId: string,
    body: CreateKpiConfigurationBody,
    context: AuditContext,
  ) {
    await this.assertConfigurationReferences(tenantId, {
      kpiDefinitionId: body.kpiDefinitionId,
      ownerId: body.ownerId,
      approverId: body.approverId ?? null,
      orgUnitId: body.orgUnitId ?? null,
      orgLocationId: body.orgLocationId ?? null,
      departmentId: body.departmentId ?? null,
    });
    const data: ConfigurationWriteData = {
      kpiDefinitionId: body.kpiDefinitionId,
      orgUnitId: body.orgUnitId ?? null,
      orgLocationId: body.orgLocationId ?? null,
      productService: body.productService ?? null,
      departmentId: body.departmentId ?? null,
      ownerId: body.ownerId,
      approverId: body.approverId ?? null,
      enabled: body.enabled,
      currency: body.currency ?? null,
      reviewFrequency: body.reviewFrequency,
      amberThresholdPct:
        body.amberThresholdPct == null
          ? null
          : new Prisma.Decimal(body.amberThresholdPct),
      redThresholdPct:
        body.redThresholdPct == null
          ? null
          : new Prisma.Decimal(body.redThresholdPct),
      requiresEvidence: body.requiresEvidence,
      requiresApproval: body.requiresApproval,
      effectiveFrom: inputDate(body.effectiveFrom),
      effectiveTo:
        body.effectiveTo == null ? null : inputDate(body.effectiveTo),
      status: body.status,
    };
    await this.assertThresholds(
      tenantId,
      data.amberThresholdPct ?? null,
      data.redThresholdPct ?? null,
    );
    return kpiConfigurationDto(
      await this.repository.createConfiguration(
        tenantId,
        actorUserId,
        data,
        context,
      ),
    );
  }

  async updateConfiguration(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: UpdateKpiConfigurationBody,
    context: AuditContext,
  ) {
    const existing = await this.getConfiguration(tenantId, id);
    const references = {
      kpiDefinitionId: body.kpiDefinitionId ?? existing.kpiDefinitionId,
      ownerId: body.ownerId ?? existing.ownerId,
      approverId:
        body.approverId === undefined ? existing.approverId : body.approverId,
      orgUnitId:
        body.orgUnitId === undefined ? existing.orgUnitId : body.orgUnitId,
      orgLocationId:
        body.orgLocationId === undefined
          ? existing.orgLocationId
          : body.orgLocationId,
      departmentId:
        body.departmentId === undefined
          ? existing.departmentId
          : body.departmentId,
    };
    await this.assertConfigurationReferences(tenantId, references);

    const data: ConfigurationPatchData = {
      ...(body.kpiDefinitionId !== undefined
        ? { kpiDefinitionId: body.kpiDefinitionId }
        : {}),
      ...(body.orgUnitId !== undefined ? { orgUnitId: body.orgUnitId } : {}),
      ...(body.orgLocationId !== undefined
        ? { orgLocationId: body.orgLocationId }
        : {}),
      ...(body.productService !== undefined
        ? { productService: body.productService }
        : {}),
      ...(body.departmentId !== undefined
        ? { departmentId: body.departmentId }
        : {}),
      ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
      ...(body.approverId !== undefined ? { approverId: body.approverId } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.reviewFrequency !== undefined
        ? { reviewFrequency: body.reviewFrequency }
        : {}),
      ...(body.amberThresholdPct !== undefined
        ? {
            amberThresholdPct:
              body.amberThresholdPct === null
                ? null
                : new Prisma.Decimal(body.amberThresholdPct),
          }
        : {}),
      ...(body.redThresholdPct !== undefined
        ? {
            redThresholdPct:
              body.redThresholdPct === null
                ? null
                : new Prisma.Decimal(body.redThresholdPct),
          }
        : {}),
      ...(body.requiresEvidence !== undefined
        ? { requiresEvidence: body.requiresEvidence }
        : {}),
      ...(body.requiresApproval !== undefined
        ? { requiresApproval: body.requiresApproval }
        : {}),
      ...(body.effectiveFrom !== undefined
        ? { effectiveFrom: inputDate(body.effectiveFrom) }
        : {}),
      ...(body.effectiveTo !== undefined
        ? {
            effectiveTo:
              body.effectiveTo === null ? null : inputDate(body.effectiveTo),
          }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    };

    const effectiveFrom = data.effectiveFrom ?? existing.effectiveFrom;
    const effectiveTo =
      data.effectiveTo === undefined ? existing.effectiveTo : data.effectiveTo;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new AppError(
        400,
        "KPI_CONFIGURATION_DATES_INVALID",
        "Effective-to date must not precede effective-from date",
      );
    }
    await this.assertThresholds(
      tenantId,
      data.amberThresholdPct === undefined
        ? existing.amberThresholdPct
        : data.amberThresholdPct,
      data.redThresholdPct === undefined
        ? existing.redThresholdPct
        : data.redThresholdPct,
    );

    const updated = await this.repository.updateConfiguration(
      tenantId,
      id,
      actorUserId,
      data,
      context,
    );
    if (!updated) throw notFound("KPI configuration not found");
    return kpiConfigurationDto(updated);
  }

  async deleteConfiguration(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const deleted = await this.repository.deleteConfiguration(
      tenantId,
      id,
      actorUserId,
      context,
    );
    if (!deleted) throw notFound("KPI configuration not found");
    return kpiConfigurationDto(deleted);
  }

  async listTargets(tenantId: string, query: KpiTargetListQuery) {
    const result = await this.repository.listTargets(tenantId, query);
    return {
      data: result.items.map(kpiTargetDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async getTarget(tenantId: string, id: string) {
    const target = await this.repository.findTarget(tenantId, id);
    if (!target) throw notFound("KPI target not found");
    return target;
  }

  private assertTargetRanges(input: {
    periodStart: Date;
    periodEnd: Date;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    minValue: Prisma.Decimal | null;
    maxValue: Prisma.Decimal | null;
  }) {
    if (input.periodEnd < input.periodStart) {
      throw new AppError(
        400,
        "KPI_TARGET_DATES_INVALID",
        "Period end must not precede period start",
      );
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new AppError(
        400,
        "KPI_TARGET_DATES_INVALID",
        "Effective-to date must not precede effective-from date",
      );
    }
    if (
      input.minValue &&
      input.maxValue &&
      input.maxValue.lessThan(input.minValue)
    ) {
      throw new AppError(
        400,
        "KPI_TARGET_TOLERANCE_INVALID",
        "Maximum value must not be below minimum value",
      );
    }
  }

  private targetWriteData(body: CreateKpiTargetBody): TargetWriteData {
    const data: TargetWriteData = {
      kpiConfigurationId: body.kpiConfigurationId,
      code: body.code,
      period: body.period,
      periodStart: inputDate(body.periodStart),
      periodEnd: inputDate(body.periodEnd),
      targetValue: new Prisma.Decimal(body.targetValue),
      minValue:
        body.minValue == null ? null : new Prisma.Decimal(body.minValue),
      maxValue:
        body.maxValue == null ? null : new Prisma.Decimal(body.maxValue),
      effectiveFrom: inputDate(body.effectiveFrom),
      effectiveTo:
        body.effectiveTo == null ? null : inputDate(body.effectiveTo),
      status: body.status,
    };
    this.assertTargetRanges({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      minValue: data.minValue ?? null,
      maxValue: data.maxValue ?? null,
    });
    return data;
  }

  private targetPatchData(
    body: UpdateKpiTargetBody | VersionKpiTargetBody,
  ): TargetPatchData {
    return {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.period !== undefined ? { period: body.period } : {}),
      ...(body.periodStart !== undefined
        ? { periodStart: inputDate(body.periodStart) }
        : {}),
      ...(body.periodEnd !== undefined
        ? { periodEnd: inputDate(body.periodEnd) }
        : {}),
      ...(body.targetValue !== undefined
        ? { targetValue: new Prisma.Decimal(body.targetValue) }
        : {}),
      ...(body.minValue !== undefined
        ? {
            minValue:
              body.minValue === null ? null : new Prisma.Decimal(body.minValue),
          }
        : {}),
      ...(body.maxValue !== undefined
        ? {
            maxValue:
              body.maxValue === null ? null : new Prisma.Decimal(body.maxValue),
          }
        : {}),
      ...(body.effectiveFrom !== undefined
        ? { effectiveFrom: inputDate(body.effectiveFrom) }
        : {}),
      ...(body.effectiveTo !== undefined
        ? {
            effectiveTo:
              body.effectiveTo === null ? null : inputDate(body.effectiveTo),
          }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    };
  }

  private assertMergedTargetRanges(
    existing: KpiTargetRecord,
    data: TargetPatchData,
  ) {
    this.assertTargetRanges({
      periodStart: data.periodStart ?? existing.periodStart,
      periodEnd: data.periodEnd ?? existing.periodEnd,
      effectiveFrom: data.effectiveFrom ?? existing.effectiveFrom,
      effectiveTo:
        data.effectiveTo === undefined
          ? existing.effectiveTo
          : data.effectiveTo,
      minValue: data.minValue === undefined ? existing.minValue : data.minValue,
      maxValue: data.maxValue === undefined ? existing.maxValue : data.maxValue,
    });
  }

  async createTarget(
    tenantId: string,
    actorUserId: string,
    body: CreateKpiTargetBody,
    context: AuditContext,
  ) {
    const configuration = await this.getConfiguration(
      tenantId,
      body.kpiConfigurationId,
    );
    if (!configuration.enabled || configuration.status !== "ACTIVE") {
      throw relatedRecordError("KPI configuration is not active and enabled");
    }
    return kpiTargetDto(
      await this.repository.createTarget(
        tenantId,
        actorUserId,
        this.targetWriteData(body),
        context,
      ),
    );
  }

  async updateTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: UpdateKpiTargetBody,
    context: AuditContext,
  ) {
    const existing = await this.getTarget(tenantId, id);
    if (existing.approvalStatus === "APPROVED") {
      throw approvedTargetImmutable();
    }
    if (!["DRAFT", "REJECTED"].includes(existing.approvalStatus)) {
      throw invalidTargetState(
        "Only draft or rejected KPI targets can be edited",
      );
    }
    const data = this.targetPatchData(body);
    this.assertMergedTargetRanges(existing, data);
    const updated = await this.repository.updateTarget(
      tenantId,
      id,
      actorUserId,
      data,
      context,
    );
    if (!updated) {
      throw invalidTargetState("KPI target changed while it was being updated");
    }
    return kpiTargetDto(updated);
  }

  async deleteTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const existing = await this.getTarget(tenantId, id);
    if (existing.approvalStatus === "APPROVED") {
      throw approvedTargetImmutable();
    }
    if (!["DRAFT", "REJECTED"].includes(existing.approvalStatus)) {
      throw invalidTargetState(
        "Only draft or rejected KPI targets can be deleted",
      );
    }
    const deleted = await this.repository.deleteTarget(
      tenantId,
      id,
      actorUserId,
      context,
    );
    if (!deleted) {
      throw invalidTargetState("KPI target changed while it was being deleted");
    }
    return kpiTargetDto(deleted);
  }

  async submitTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const target = await this.getTarget(tenantId, id);
    if (!["DRAFT", "REJECTED"].includes(target.approvalStatus)) {
      throw invalidTargetState(
        "Only draft or rejected KPI targets can be submitted",
      );
    }
    if (
      target.configuration.requiresApproval &&
      target.configuration.approverId === actorUserId
    ) {
      throw forbidden("A KPI target approver cannot submit the same target");
    }
    const submitted = await this.repository.submitTarget(
      tenantId,
      id,
      actorUserId,
      target.configuration.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      context,
    );
    if (!submitted) {
      throw invalidTargetState(
        "KPI target changed while it was being submitted",
      );
    }
    return kpiTargetDto(submitted);
  }

  private assertApprovalActor(target: KpiTargetRecord, actorUserId: string) {
    if (target.approvalStatus !== "PENDING_APPROVAL") {
      throw invalidTargetState("KPI target is not pending approval");
    }
    if (target.submittedById === actorUserId) {
      throw forbidden("KPI target self-approval is forbidden");
    }
    if (
      target.configuration.approverId &&
      target.configuration.approverId !== actorUserId
    ) {
      throw forbidden("Only the configured KPI target approver may decide");
    }
  }

  async approveTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const target = await this.getTarget(tenantId, id);
    this.assertApprovalActor(target, actorUserId);
    const approved = await this.repository.decideTarget(
      tenantId,
      id,
      actorUserId,
      "APPROVED",
      null,
      context,
    );
    if (!approved) {
      throw invalidTargetState(
        "KPI target changed while it was being approved",
      );
    }
    return kpiTargetDto(approved);
  }

  async rejectTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    reason: string,
    context: AuditContext,
  ) {
    const target = await this.getTarget(tenantId, id);
    this.assertApprovalActor(target, actorUserId);
    const rejected = await this.repository.decideTarget(
      tenantId,
      id,
      actorUserId,
      "REJECTED",
      reason,
      context,
    );
    if (!rejected) {
      throw invalidTargetState(
        "KPI target changed while it was being rejected",
      );
    }
    return kpiTargetDto(rejected);
  }

  async versionTarget(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: VersionKpiTargetBody,
    context: AuditContext,
  ) {
    const existing = await this.getTarget(tenantId, id);
    if (existing.approvalStatus !== "APPROVED") {
      throw invalidTargetState("Only approved KPI targets can be versioned");
    }
    if (existing.supersededById) {
      throw invalidTargetState("KPI target already has a successor");
    }
    const data = this.targetPatchData(body) as TargetPatchData & {
      code: string;
    };
    this.assertMergedTargetRanges(existing, data);
    const version = await this.repository.createTargetVersion(
      tenantId,
      id,
      actorUserId,
      data,
      context,
    );
    if (!version) {
      throw invalidTargetState(
        "KPI target changed while it was being versioned",
      );
    }
    return kpiTargetDto(version);
  }
}
