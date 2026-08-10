import type { Prisma, PrismaClient } from "@prisma/client";
import { isFrameworkActiveInScope } from "./framework-scope.js";

/**
 * Live dashboard analytics.
 *
 * Every figure here is a query against this tenant's rows. Nothing is read
 * from the workbook's `09_Compliance_Dashboard` or `17_KPI_Dashboard` sheets:
 * those are spreadsheet formulas over a snapshot, and a demo that replayed
 * them would show numbers the registers underneath cannot justify.
 *
 * Two rules run through the whole file:
 *
 *  - a percentage is `null` when its denominator is zero, never `0` dressed up
 *    as a score and never a flattering `100`;
 *  - a period, framework or bucket appears only when a row produced it, so an
 *    empty company renders an empty chart rather than an invented history.
 */

const TREND_PERIOD_LIMIT = 12;
const LIST_LIMIT = 8;
const DUE_SOON_DAYS = 30;
const POLICY_REVIEW_HORIZON_DAYS = 90;
const DAY_MS = 86_400_000;

/** Configurations whose actuals carry a pass or fail meaning. */
const measurableConfiguration = {
  deletedAt: null,
  enabled: true,
  status: "ACTIVE",
  definition: { direction: { not: "INFORMATIONAL" } },
} satisfies Prisma.KpiConfigurationWhereInput;

const decimal = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / DAY_MS);

export interface AnalyticsFilters {
  readonly departmentId?: string;
  readonly frameworkId?: string;
  readonly period?: string;
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * CAPA aging buckets, oldest first. `label` is what the dashboard prints, so
 * the bucket boundaries live in one place rather than being restated in the UI.
 */
export const CAPA_AGING_BUCKETS = [
  { key: "OVERDUE_90_PLUS", label: "Overdue 90+ days", minDays: 90, maxDays: null },
  { key: "OVERDUE_61_90", label: "Overdue 61–90 days", minDays: 61, maxDays: 90 },
  { key: "OVERDUE_31_60", label: "Overdue 31–60 days", minDays: 31, maxDays: 60 },
  { key: "OVERDUE_1_30", label: "Overdue 1–30 days", minDays: 1, maxDays: 30 },
  { key: "DUE_SOON", label: "Due within 30 days", minDays: -30, maxDays: 0 },
  { key: "SCHEDULED", label: "Due later", minDays: null, maxDays: -31 },
  { key: "NO_DUE_DATE", label: "No due date recorded", minDays: null, maxDays: null },
] as const;

export type CapaAgingBucketKey = (typeof CAPA_AGING_BUCKETS)[number]["key"];

/**
 * Places an open CAPA in an aging bucket. `daysOverdue` is positive when the
 * due date has passed, so "due later" is a negative number of days overdue.
 */
export const capaAgingBucket = (
  dueDate: Date | null,
  now: Date,
): CapaAgingBucketKey => {
  if (dueDate === null) return "NO_DUE_DATE";
  const daysOverdue = daysBetween(dueDate, now);
  if (daysOverdue >= 90) return "OVERDUE_90_PLUS";
  if (daysOverdue >= 61) return "OVERDUE_61_90";
  if (daysOverdue >= 31) return "OVERDUE_31_60";
  if (daysOverdue >= 1) return "OVERDUE_1_30";
  if (daysOverdue >= -30) return "DUE_SOON";
  return "SCHEDULED";
};

/**
 * Framework compliance.
 *
 * The share of this company's controls mapped to the framework that are
 * recorded as IMPLEMENTED. When no control is mapped there is no honest
 * percentage to publish, so the caller receives `null` and the dashboard says
 * so in words rather than drawing a zero-length bar that reads as 0%.
 */
export const frameworkCompliancePercentage = (
  mappedControls: number,
  implementedControls: number,
) =>
  mappedControls === 0
    ? null
    : Math.round((implementedControls / mappedControls) * 1000) / 10;

/** KPI achievement rate over measured, non-informational actuals. */
export const achievementRate = (measured: number, meetingTarget: number) =>
  measured === 0 ? null : Math.round((meetingTarget / measured) * 1000) / 10;

export class DashboardAnalyticsRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * The actual-level filter shared by every KPI figure on the dashboard.
   * Informational KPIs are excluded because "met target" has no meaning for
   * them; they remain counted as configured elsewhere.
   */
  private actualWhere(
    tenantId: string,
    filters: AnalyticsFilters,
  ): Prisma.KpiActualWhereInput {
    return {
      tenantId,
      deletedAt: null,
      ...(filters.period ? { period: filters.period } : {}),
      ...(filters.from || filters.to
        ? {
            periodStart: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      configuration: {
        ...measurableConfiguration,
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      },
    };
  }

  /**
   * KPI target versus actual by reporting period.
   *
   * Periods come from the rows themselves — there is no synthetic month axis.
   * The most recent `TREND_PERIOD_LIMIT` periods are returned oldest-first so
   * the chart reads left to right.
   */
  async kpiTrend(tenantId: string, filters: AnalyticsFilters) {
    const where = this.actualWhere(tenantId, filters);
    const [totals, met] = await Promise.all([
      this.db.kpiActual.groupBy({
        by: ["period"],
        where,
        _count: { _all: true },
        _sum: { targetValueSnapshot: true, actualValue: true },
        _min: { periodStart: true },
      }),
      this.db.kpiActual.groupBy({
        by: ["period"],
        where: { ...where, targetMet: true },
        _count: { _all: true },
      }),
    ]);
    const metByPeriod = new Map(
      met.map((row) => [row.period, row._count._all] as const),
    );
    return totals
      .map((row) => ({
        period: row.period,
        periodStart: row._min.periodStart,
        measured: row._count._all,
        meetingTarget: metByPeriod.get(row.period) ?? 0,
        targetTotal: decimal(row._sum.targetValueSnapshot),
        actualTotal: decimal(row._sum.actualValue),
      }))
      .sort((a, b) => {
        const left = a.periodStart?.getTime() ?? 0;
        const right = b.periodStart?.getTime() ?? 0;
        if (left !== right) return left - right;
        return a.period.localeCompare(b.period);
      })
      .slice(-TREND_PERIOD_LIMIT);
  }

  /** Evidence lifecycle distribution for the donut. */
  async evidenceStatus(tenantId: string, filters: AnalyticsFilters) {
    const groups = await this.db.evidence.groupBy({
      by: ["lifecycleStatus"],
      where: {
        tenantId,
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
      },
      _count: { _all: true },
    });
    return groups
      .map((group) => ({
        status: group.lifecycleStatus,
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
  }

  /**
   * Framework compliance bars.
   *
   * Rules are the regulatory requirement; controls are this company's
   * implementation of them. The bar therefore measures controls, and the rule
   * count is carried alongside so an unmapped framework is visibly unmapped.
   */
  async frameworkCompliance(tenantId: string, filters: AnalyticsFilters) {
    const frameworks = await this.db.framework.findMany({
      where: {
        status: "ACTIVE",
        ...(filters.frameworkId ? { id: filters.frameworkId } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        version: true,
        scopeStatus: true,
        _count: { select: { rules: true } },
      },
      orderBy: [{ code: "asc" }, { version: "asc" }],
    });
    const inScopeFrameworks = frameworks.filter((framework) =>
      isFrameworkActiveInScope(framework.scopeStatus),
    );
    if (inScopeFrameworks.length === 0) return [];
    const frameworkIds = inScopeFrameworks.map((framework) => framework.id);
    const controlScope: Prisma.ControlFrameworkWhereInput = {
      tenantId,
      frameworkId: { in: frameworkIds },
      control: { archivedAt: null, lifecycleStatus: "ACTIVE" },
    };
    const [mapped, implemented, openGaps] = await Promise.all([
      this.db.controlFramework.groupBy({
        by: ["frameworkId"],
        where: controlScope,
        _count: { _all: true },
      }),
      this.db.controlFramework.groupBy({
        by: ["frameworkId"],
        where: {
          ...controlScope,
          control: {
            archivedAt: null,
            lifecycleStatus: "ACTIVE",
            implementationStatus: "IMPLEMENTED",
          },
        },
        _count: { _all: true },
      }),
      this.db.gap.groupBy({
        by: ["frameworkId"],
        where: {
          tenantId,
          deletedAt: null,
          status: { notIn: ["CLOSED", "CANCELLED"] },
          frameworkId: { in: frameworkIds },
        },
        _count: { _all: true },
      }),
    ]);
    const count = (
      groups: { frameworkId: string | null; _count: { _all: number } }[],
      id: string,
    ) => groups.find((group) => group.frameworkId === id)?._count._all ?? 0;
    return inScopeFrameworks.map((framework) => {
      const mappedControls = count(mapped, framework.id);
      const implementedControls = count(implemented, framework.id);
      return {
        id: framework.id,
        code: framework.code,
        name: framework.name,
        version: framework.version,
        scopeStatus: framework.scopeStatus,
        ruleCount: framework._count.rules,
        mappedControls,
        implementedControls,
        openGaps: count(openGaps, framework.id),
        compliancePercentage: frameworkCompliancePercentage(
          mappedControls,
          implementedControls,
        ),
      };
    });
  }

  /**
   * Risk heat map over the inherent likelihood and impact recorded on open
   * risks. The axis bounds come from the data, so a company scoring 1–5 gets a
   * 5×5 grid and one scoring 1–3 is not padded out to look busier.
   */
  async riskHeatMap(tenantId: string) {
    const groups = await this.db.risk.groupBy({
      by: ["inherentLikelihood", "inherentImpact"],
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
      _count: { _all: true },
    });
    const cells = groups.map((group) => ({
      likelihood: group.inherentLikelihood,
      impact: group.inherentImpact,
      count: group._count._all,
    }));
    const total = cells.reduce((sum, cell) => sum + cell.count, 0);
    return {
      cells,
      maxLikelihood: cells.reduce(
        (max, cell) => Math.max(max, cell.likelihood),
        0,
      ),
      maxImpact: cells.reduce((max, cell) => Math.max(max, cell.impact), 0),
      total,
    };
  }

  /** Open CAPAs bucketed by how long they have been overdue. */
  async capaAging(tenantId: string, filters: AnalyticsFilters, now: Date) {
    const open = await this.db.capa.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
        ...(filters.frameworkId ? { frameworkId: filters.frameworkId } : {}),
      },
      select: { dueDate: true },
    });
    const counts = new Map<CapaAgingBucketKey, number>(
      CAPA_AGING_BUCKETS.map((bucket) => [bucket.key, 0]),
    );
    for (const capa of open) {
      const key = capaAgingBucket(capa.dueDate, now);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return CAPA_AGING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: counts.get(bucket.key) ?? 0,
    }));
  }

  /** Most recent risks raised from a KPI actual breaching its threshold. */
  async recentKpiRisks(tenantId: string) {
    const risks = await this.db.risk.findMany({
      where: { tenantId, deletedAt: null, kpiActualId: { not: null } },
      select: {
        id: true,
        code: true,
        title: true,
        kpiRiskClass: true,
        status: true,
        inherentScore: true,
        createdAt: true,
        kpiActual: {
          select: {
            code: true,
            period: true,
            ragStatus: true,
            configuration: {
              select: { definition: { select: { code: true, name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
    return risks.map((risk) => ({
      id: risk.id,
      code: risk.code,
      title: risk.title,
      kpiRiskClass: risk.kpiRiskClass,
      status: risk.status,
      inherentScore: risk.inherentScore,
      raisedAt: risk.createdAt,
      kpi: risk.kpiActual
        ? {
            actualCode: risk.kpiActual.code,
            period: risk.kpiActual.period,
            ragStatus: risk.kpiActual.ragStatus,
            definitionCode:
              risk.kpiActual.configuration.definition.code,
            definitionName:
              risk.kpiActual.configuration.definition.name,
          }
        : null,
    }));
  }

  /** Open CAPAs falling due inside the next 30 days. */
  async capasDueSoon(tenantId: string, now: Date) {
    const horizon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
    const capas = await this.db.capa.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        dueDate: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        code: true,
        title: true,
        priority: true,
        status: true,
        dueDate: true,
        completionPercentage: true,
        owner: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: "asc" },
      take: LIST_LIMIT,
    });
    return capas.map((capa) => ({
      id: capa.id,
      code: capa.code,
      title: capa.title,
      priority: capa.priority,
      status: capa.status,
      dueDate: capa.dueDate,
      completionPercentage: capa.completionPercentage,
      ownerName: capa.owner?.fullName ?? null,
    }));
  }

  /**
   * Policies whose approved version reaches its recorded review date inside
   * the next 90 days, or has already passed it. The review date lives on the
   * approved Version, which is the record that was actually governed.
   */
  async policiesDueForReview(tenantId: string, now: Date) {
    const horizon = new Date(
      now.getTime() + POLICY_REVIEW_HORIZON_DAYS * DAY_MS,
    );
    const where: Prisma.PolicyVersionWhereInput = {
      tenantId,
      status: "APPROVED",
      reviewDate: { lte: horizon },
      policy: { archivedAt: null },
      currentForPolicy: { isNot: null },
    };
    const [total, overdue, versions] = await Promise.all([
      this.db.policyVersion.count({ where }),
      this.db.policyVersion.count({
        where: { ...where, reviewDate: { lt: now } },
      }),
      this.db.policyVersion.findMany({
        where,
        select: {
          id: true,
          reviewDate: true,
          versionMajor: true,
          versionMinor: true,
          policy: {
            select: {
              id: true,
              code: true,
              title: true,
              lifecycleStatus: true,
              owner: { select: { fullName: true } },
            },
          },
        },
        orderBy: { reviewDate: "asc" },
        take: LIST_LIMIT,
      }),
    ]);
    return {
      total,
      overdue,
      horizonDays: POLICY_REVIEW_HORIZON_DAYS,
      items: versions.map((version) => ({
        policyId: version.policy.id,
        code: version.policy.code,
        title: version.policy.title,
        lifecycleStatus: version.policy.lifecycleStatus,
        version: `${version.versionMajor}.${version.versionMinor}`,
        reviewDate: version.reviewDate,
        ownerName: version.policy.owner?.fullName ?? null,
      })),
    };
  }

  /** KPI actuals awaiting an approval decision, for the action queue. */
  async pendingKpiApprovals(tenantId: string, filters: AnalyticsFilters) {
    return this.db.kpiActual.count({
      where: {
        ...this.actualWhere(tenantId, filters),
        approvalStatus: { in: ["SUBMITTED", "PENDING_APPROVAL"] },
      },
    });
  }

  /**
   * GenRAC connector state, read-only.
   *
   * The integration module creates a placeholder connection row on demand;
   * the dashboard must not write, so a company that has never opened the
   * integration page reports `NOT_CONFIGURED` from the absence of a row.
   */
  async genracStatus(tenantId: string) {
    const connection = await this.db.externalSystemConnection.findFirst({
      where: { tenantId },
      select: {
        id: true,
        systemCode: true,
        displayName: true,
        connectorType: true,
        status: true,
        lastTestedAt: true,
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
      },
      orderBy: { systemCode: "asc" },
    });
    if (connection === null) {
      return {
        configured: false,
        status: "NOT_CONFIGURED" as const,
        systemCode: null,
        displayName: null,
        connectorType: null,
        lastTestedAt: null,
        lastAttemptedSyncAt: null,
        lastSuccessfulSyncAt: null,
        mappingCount: 0,
        lastSyncRun: null,
        liveAccess: false,
      };
    }
    const [mappingCount, lastSyncRun] = await Promise.all([
      this.db.externalRecordMap.count({
        where: { tenantId, connectionId: connection.id },
      }),
      this.db.syncRun.findFirst({
        where: { tenantId, connectionId: connection.id },
        select: {
          id: true,
          status: true,
          mode: true,
          createCount: true,
          updateCount: true,
          conflictCount: true,
          invalidCount: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { startedAt: "desc" },
      }),
    ]);
    return {
      configured: connection.status !== "NOT_CONFIGURED",
      status: connection.status,
      systemCode: connection.systemCode,
      displayName: connection.displayName,
      connectorType: connection.connectorType,
      lastTestedAt: connection.lastTestedAt,
      lastAttemptedSyncAt: connection.lastAttemptedSyncAt,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
      mappingCount,
      lastSyncRun,
      liveAccess: false,
    };
  }
}
