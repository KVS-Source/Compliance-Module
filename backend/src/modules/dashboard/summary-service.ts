import type { DashboardRepository } from "./repository.js";
import type {
  DashboardSummaryRepository,
  SummaryFilters,
} from "./summary-repository.js";
import type { DashboardSummaryQuery } from "./validators.js";

const may = (permissions: readonly string[], permission: string) =>
  permissions.includes("*") || permissions.includes(permission);

/**
 * Overall compliance percentage.
 *
 * Defined as the share of measured, non-informational KPI actuals that met
 * their target. It is recomputed here rather than read from the workbook's
 * dashboard sheet, so it always agrees with the KPI register beneath it. With
 * nothing measured the honest answer is 0 with `measured: 0` alongside, not a
 * flattering 100.
 */
export const compliancePercentage = (measured: number, targetMet: number) =>
  measured === 0 ? 0 : Math.round((targetMet / measured) * 1000) / 10;

/**
 * The single dashboard endpoint the demo runs on.
 *
 * Sections mirror their source module's permission, so a user without
 * `gaps:read` receives `gaps: null` rather than aggregate counts about records
 * they may not list. Empty data yields zero counts and empty arrays, never an
 * error, so a freshly seeded company still renders.
 *
 * The response extends the Milestone 1 payload rather than replacing it: the
 * existing `kpis`, `risks`, `organisation` and `frameworks` keys keep their
 * original fields, because the frontend's `DashboardSummary` type is
 * frontend-owned and already consumes them. New information is added
 * alongside, which no existing consumer can be broken by.
 */
export class DashboardSummaryService {
  constructor(
    private readonly repository: DashboardSummaryRepository,
    private readonly legacy: DashboardRepository,
  ) {}

  async summary(
    tenantId: string,
    permissions: readonly string[],
    query: DashboardSummaryQuery,
  ) {
    const now = new Date();
    const filters: SummaryFilters = {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      ...(query.period ? { period: query.period } : {}),
      ...(query.from ? { from: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { to: new Date(`${query.to}T00:00:00.000Z`) } : {}),
    };

    const [
      kpis,
      risks,
      gaps,
      capas,
      evidence,
      policies,
      frameworks,
      departments,
      registers,
      activity,
      latestImport,
      legacyKpis,
      legacyRisks,
      organisation,
      legacyFrameworks,
    ] = await Promise.all([
      may(permissions, "kpis:read")
        ? this.repository.kpis(tenantId, filters)
        : Promise.resolve(null),
      may(permissions, "risk:read")
        ? this.repository.risks(tenantId)
        : Promise.resolve(null),
      may(permissions, "gaps:read")
        ? this.repository.gaps(tenantId, filters, now)
        : Promise.resolve(null),
      may(permissions, "capa:read")
        ? this.repository.capas(tenantId, filters, now)
        : Promise.resolve(null),
      may(permissions, "evidence:read")
        ? this.repository.evidence(tenantId, filters, now)
        : Promise.resolve(null),
      may(permissions, "policies:read")
        ? this.repository.policies(tenantId)
        : Promise.resolve(null),
      may(permissions, "frameworks:read")
        ? this.repository.frameworks(filters)
        : Promise.resolve(null),
      may(permissions, "organisation:read")
        ? this.repository.departmentBreakdown(tenantId, now)
        : Promise.resolve(null),
      may(permissions, "registers:read")
        ? this.repository.registerCounts(tenantId)
        : Promise.resolve(null),
      this.repository.recentActivity(tenantId),
      may(permissions, "imports:read")
        ? this.repository.latestImport(tenantId)
        : Promise.resolve(null),
      may(permissions, "kpis:read")
        ? this.legacy.kpis(tenantId)
        : Promise.resolve(null),
      may(permissions, "risk:read")
        ? this.legacy.risks(tenantId)
        : Promise.resolve(null),
      may(permissions, "organisation:read")
        ? this.legacy.organisation(tenantId)
        : Promise.resolve(null),
      may(permissions, "frameworks:read")
        ? this.legacy.frameworks()
        : Promise.resolve(null),
    ]);

    return {
      generatedAt: now,
      filters: {
        departmentId: query.departmentId ?? null,
        frameworkId: query.frameworkId ?? null,
        period: query.period ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
      },
      compliance:
        kpis === null
          ? null
          : {
              overallPercentage: compliancePercentage(
                kpis.measured,
                kpis.targetMet,
              ),
              measuredKpis: kpis.measured,
              kpisMeetingTarget: kpis.targetMet,
            },
      kpis:
        kpis === null || legacyKpis === null
          ? null
          : {
              // Milestone 1 fields, retained for the existing frontend type.
              ...legacyKpis,
              definitions: kpis.definitions,
              configured: kpis.configured,
              enabled: kpis.enabled,
              measured: kpis.measured,
              green: kpis.green,
              amber: kpis.amber,
              red: kpis.red,
              pendingApproval: kpis.pendingApproval,
            },
      risks:
        risks === null || legacyRisks === null
          ? null
          : {
              ...legacyRisks,
              // Major and Minor are the KPI risk classes; the enterprise
              // register is counted separately and never merged with them.
              openMajor: risks.openMajor,
              openMinor: risks.openMinor,
              openEnterprise: risks.openEnterprise,
              openTotal: risks.openTotal,
              treated: risks.treated,
              closed: risks.closed,
            },
      organisation,
      gaps,
      capas,
      evidence,
      policies,
      frameworks:
        frameworks === null || legacyFrameworks === null
          ? null
          : {
              ...legacyFrameworks,
              total: frameworks.length,
              active: frameworks.filter((item) => item.status === "ACTIVE")
                .length,
              breakdown: frameworks.map((item) => ({
                id: item.id,
                code: item.code,
                name: item.name,
                version: item.version,
                status: item.status,
                scopeStatus: item.scopeStatus,
                ruleCount: item._count.rules,
              })),
            },
      departments: departments ?? null,
      registers: registers ?? null,
      recentActivity: activity,
      latestImport,
    };
  }
}
