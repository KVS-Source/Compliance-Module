import type { Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";

/**
 * Every dashboard number is computed from PostgreSQL here. The workbook's
 * `09_Compliance_Dashboard` and `17_KPI_Dashboard` sheets are deliberately not
 * imported: their values are spreadsheet formulas over a snapshot, and the
 * demo must show live figures that agree with the registers beneath them.
 */

export interface SummaryFilters {
  readonly departmentId?: string;
  readonly frameworkId?: string;
  readonly period?: string;
  readonly from?: Date;
  readonly to?: Date;
}

const RECENT_ACTIVITY_LIMIT = 10;

export class DashboardSummaryRepository {
  constructor(private readonly db: PrismaClient) {}

  private kpiActualWhere(
    tenantId: string,
    filters: SummaryFilters,
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
      ...(filters.departmentId
        ? {
            configuration: {
              departmentId: filters.departmentId,
              deletedAt: null,
              enabled: true,
              status: "ACTIVE",
              definition: { direction: { not: "INFORMATIONAL" } },
            },
          }
        : {
            configuration: {
              deletedAt: null,
              enabled: true,
              status: "ACTIVE",
              definition: { direction: { not: "INFORMATIONAL" } },
            },
          }),
    };
  }

  /**
   * KPI RAG counts plus the inputs for the overall compliance percentage.
   * `INFORMATIONAL` KPIs are excluded from the percentage because they have no
   * pass or fail meaning, but they are still counted as configured.
   */
  async kpis(tenantId: string, filters: SummaryFilters) {
    const base = this.kpiActualWhere(tenantId, filters);
    const [
      definitions,
      configured,
      enabled,
      measured,
      green,
      amber,
      red,
      targetMet,
      pendingApproval,
    ] = await this.db.$transaction([
      this.db.kpiDefinition.count({
        where: {
          status: "ACTIVE",
          configurations: {
            some: {
              tenantId,
              deletedAt: null,
              ...(filters.departmentId
                ? { departmentId: filters.departmentId }
                : {}),
            },
          },
        },
      }),
      this.db.kpiConfiguration.count({
        where: {
          tenantId,
          deletedAt: null,
          ...(filters.departmentId
            ? { departmentId: filters.departmentId }
            : {}),
        },
      }),
      this.db.kpiConfiguration.count({
        where: {
          tenantId,
          deletedAt: null,
          enabled: true,
          status: "ACTIVE",
          ...(filters.departmentId
            ? { departmentId: filters.departmentId }
            : {}),
        },
      }),
      this.db.kpiActual.count({ where: base }),
      this.db.kpiActual.count({ where: { ...base, ragStatus: "GREEN" } }),
      this.db.kpiActual.count({ where: { ...base, ragStatus: "AMBER" } }),
      this.db.kpiActual.count({ where: { ...base, ragStatus: "RED" } }),
      this.db.kpiActual.count({
        where: {
          ...base,
          targetMet: true,
        },
      }),
      this.db.kpiActual.count({
        where: {
          ...base,
          approvalStatus: { in: ["SUBMITTED", "PENDING_APPROVAL"] },
        },
      }),
    ]);
    return {
      definitions,
      configured,
      enabled,
      measured,
      green,
      amber,
      red,
      targetMet,
      pendingApproval,
    };
  }

  async risks(tenantId: string) {
    const open: Prisma.RiskWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ["CLOSED", "ARCHIVED"] },
    };
    const [openMajor, openMinor, openEnterprise, openTotal, treated, closed] =
      await this.db.$transaction([
        this.db.risk.count({ where: { ...open, kpiRiskClass: "MAJOR" } }),
        this.db.risk.count({ where: { ...open, kpiRiskClass: "MINOR" } }),
        this.db.risk.count({ where: { ...open, kpiRiskClass: null } }),
        this.db.risk.count({ where: open }),
        this.db.risk.count({
          where: { tenantId, deletedAt: null, status: "TREATED" },
        }),
        this.db.risk.count({
          where: { tenantId, deletedAt: null, status: "CLOSED" },
        }),
      ]);
    return { openMajor, openMinor, openEnterprise, openTotal, treated, closed };
  }

  async gaps(tenantId: string, filters: SummaryFilters, now: Date) {
    const base: Prisma.GapWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.frameworkId ? { frameworkId: filters.frameworkId } : {}),
    };
    const openStates: Prisma.GapWhereInput = {
      status: { notIn: ["CLOSED", "CANCELLED"] },
    };
    const [open, overdue, closed, critical, major, needsReview] =
      await this.db.$transaction([
        this.db.gap.count({ where: { ...base, ...openStates } }),
        this.db.gap.count({
          where: { ...base, ...openStates, dueDate: { lt: now } },
        }),
        this.db.gap.count({ where: { ...base, status: "CLOSED" } }),
        this.db.gap.count({
          where: { ...base, ...openStates, severity: "CRITICAL" },
        }),
        this.db.gap.count({
          where: { ...base, ...openStates, severity: "MAJOR" },
        }),
        this.db.gap.count({ where: { ...base, needsReview: true } }),
      ]);
    return { open, overdue, closed, critical, major, needsReview };
  }

  async capas(tenantId: string, filters: SummaryFilters, now: Date) {
    const base: Prisma.CapaWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.frameworkId ? { frameworkId: filters.frameworkId } : {}),
    };
    const openStates: Prisma.CapaWhereInput = {
      status: { notIn: ["CLOSED", "CANCELLED"] },
    };
    const [open, overdue, closed, pendingVerification, needsReview] =
      await this.db.$transaction([
        this.db.capa.count({ where: { ...base, ...openStates } }),
        this.db.capa.count({
          where: { ...base, ...openStates, dueDate: { lt: now } },
        }),
        this.db.capa.count({ where: { ...base, status: "CLOSED" } }),
        this.db.capa.count({
          where: { ...base, status: "PENDING_VERIFICATION" },
        }),
        this.db.capa.count({ where: { ...base, needsReview: true } }),
      ]);
    return { open, overdue, closed, pendingVerification, needsReview };
  }

  /**
   * Evidence health. `withoutFile` is the count of records this platform holds
   * metadata for but no bytes — the honest state of imported workbook rows.
   */
  async evidence(tenantId: string, filters: SummaryFilters, now: Date) {
    const base: Prisma.EvidenceWhereInput = {
      tenantId,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    };
    const inNinetyDays = new Date(now.getTime() + 90 * 86_400_000);
    const [total, pendingReview, approved, expiringSoon, expired, withoutFile] =
      await this.db.$transaction([
        this.db.evidence.count({ where: base }),
        this.db.evidence.count({
          where: { ...base, lifecycleStatus: "SUBMITTED" },
        }),
        this.db.evidence.count({
          where: { ...base, lifecycleStatus: "APPROVED" },
        }),
        this.db.evidence.count({
          where: {
            ...base,
            lifecycleStatus: { not: "ARCHIVED" },
            expiresAt: { gte: now, lte: inNinetyDays },
          },
        }),
        this.db.evidence.count({
          where: {
            ...base,
            lifecycleStatus: { not: "ARCHIVED" },
            expiresAt: { lt: now },
          },
        }),
        this.db.evidence.count({ where: { ...base, storageKey: null } }),
      ]);
    return {
      total,
      pendingReview,
      approved,
      expiringSoon,
      expired,
      withoutFile,
    };
  }

  async policies(tenantId: string) {
    const [total, active, approvedVersions, draftVersions] =
      await this.db.$transaction([
        this.db.policy.count({ where: { tenantId, archivedAt: null } }),
        this.db.policy.count({
          where: { tenantId, archivedAt: null, lifecycleStatus: "ACTIVE" },
        }),
        this.db.policyVersion.count({
          where: { tenantId, status: "APPROVED" },
        }),
        this.db.policyVersion.count({ where: { tenantId, status: "DRAFT" } }),
      ]);
    return { total, active, approvedVersions, draftVersions };
  }

  async frameworks(filters: SummaryFilters) {
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
        status: true,
        scopeStatus: true,
        _count: { select: { rules: true } },
      },
      orderBy: { code: "asc" },
    });
    return frameworks;
  }

  /** Gap and CAPA load by department, for the dashboard breakdown. */
  async departmentBreakdown(tenantId: string, now: Date) {
    const departments = await this.db.orgDepartment.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
    const [gapGroups, capaGroups, kpiGroups] = await Promise.all([
      this.db.gap.groupBy({
        by: ["departmentId"],
        where: {
          tenantId,
          deletedAt: null,
          status: { notIn: ["CLOSED", "CANCELLED"] },
        },
        _count: { _all: true },
      }),
      this.db.capa.groupBy({
        by: ["departmentId"],
        where: {
          tenantId,
          deletedAt: null,
          status: { notIn: ["CLOSED", "CANCELLED"] },
        },
        _count: { _all: true },
      }),
      this.db.kpiConfiguration.groupBy({
        by: ["departmentId"],
        where: { tenantId, deletedAt: null, enabled: true },
        _count: { _all: true },
      }),
    ]);
    const overdueGaps = await this.db.gap.groupBy({
      by: ["departmentId"],
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        dueDate: { lt: now },
      },
      _count: { _all: true },
    });
    const lookup = (
      groups: { departmentId: string | null; _count: { _all: number } }[],
      id: string,
    ) => groups.find((group) => group.departmentId === id)?._count._all ?? 0;
    return departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      openGaps: lookup(gapGroups, department.id),
      overdueGaps: lookup(overdueGaps, department.id),
      openCapas: lookup(capaGroups, department.id),
      enabledKpis: lookup(kpiGroups, department.id),
    }));
  }

  async registerCounts(tenantId: string) {
    const types = await this.db.operationalRegisterType.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { records: { where: { deletedAt: null } } } },
      },
      orderBy: { code: "asc" },
    });
    return types.map((type) => ({
      code: type.code,
      name: type.name,
      recordCount: type._count.records,
    }));
  }

  /**
   * Recent activity from the append-only audit log. Only SYSTEM events are
   * shown: replayed workbook history is not activity on this platform.
   */
  async recentActivity(tenantId: string) {
    const events = await this.db.auditEvent.findMany({
      where: { tenantId, source: "SYSTEM" },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { id: true, code: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      at: event.createdAt,
      actor: event.user
        ? {
            id: event.user.id,
            code: event.user.code,
            name: event.user.fullName,
          }
        : null,
    }));
  }

  async latestImport(tenantId: string) {
    const batch = await this.db.importBatch.findFirst({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        status: true,
        createdCount: true,
        updatedCount: true,
        skippedCount: true,
        errorCount: true,
        startedAt: true,
        completedAt: true,
      },
    });
    return batch;
  }
}
