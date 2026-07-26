import { Prisma } from "@prisma/client";
import { AppError, unauthorized } from "../../common/errors/app-error.js";
import type { AuditContext } from "./management-repository.js";
import {
  type KpiActualRecord,
  type KpiActualRepository,
} from "./actual-repository.js";
import type { CreateKpiActualBody } from "./actual-validators.js";
import type {
  KpiPerformanceService,
  KpiPerformanceResult,
} from "./performance-service.js";
import { kpiConfigurationDto } from "./management-service.js";

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

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
});

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

const actualAlreadyExists = () =>
  new AppError(
    409,
    "KPI_ACTUAL_ALREADY_EXISTS",
    "A KPI actual already exists for this configuration, period, or code",
  );

export class KpiActualService {
  constructor(
    private readonly repository: KpiActualRepository,
    private readonly performanceService: KpiPerformanceService,
  ) {}

  async submitActual(
    tenantId: string,
    actorUserId: string,
    body: CreateKpiActualBody,
    context: AuditContext,
  ) {
    try {
      return await this.repository.runSubmissionTransaction(
        async (transaction) => {
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
          if (existing) throw actualAlreadyExists();

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
          const actual = await transaction.createActual(
            tenantId,
            actorUserId,
            submittedAt,
            {
              code: body.code,
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
          await transaction.writeSubmissionAudit(
            tenantId,
            actorUserId,
            actual,
            performance.riskRequired,
            performance.recommendedRiskClass,
            context,
          );
          return kpiActualDto(actual, performance);
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw actualAlreadyExists();
      }
      throw error;
    }
  }
}
