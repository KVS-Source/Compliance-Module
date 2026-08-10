import type { DashboardAnalyticsRepository } from "./analytics-repository.js";
import type { DashboardRepository } from "./repository.js";
import type {
  DashboardSummaryRepository,
  SummaryFilters,
} from "./summary-repository.js";
import type { DashboardSummaryQuery } from "./validators.js";
import { isFrameworkActiveInScope } from "./framework-scope.js";

const may = (permissions: readonly string[], permission: string) =>
  permissions.includes("*") || permissions.includes(permission);

/**
 * A derived queue item. There is no Task model in this release, so the queue
 * is computed from the registers themselves rather than stored: every entry
 * names the register it counted and the route that shows those rows.
 */
export interface ActionQueueItem {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly to: string;
  readonly tone: "red" | "amber" | "blue";
}

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
    private readonly analytics: DashboardAnalyticsRepository,
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

    const [
      kpiTrend,
      evidenceStatus,
      frameworkCompliance,
      riskHeatMap,
      capaAging,
      recentKpiRisks,
      capasDueSoon,
      policiesDueForReview,
      genrac,
    ] = await Promise.all([
      may(permissions, "kpis:read")
        ? this.analytics.kpiTrend(tenantId, filters)
        : Promise.resolve(null),
      may(permissions, "evidence:read")
        ? this.analytics.evidenceStatus(tenantId, filters)
        : Promise.resolve(null),
      may(permissions, "frameworks:read") && may(permissions, "controls:read")
        ? this.analytics.frameworkCompliance(tenantId, filters)
        : Promise.resolve(null),
      may(permissions, "risk:read")
        ? this.analytics.riskHeatMap(tenantId)
        : Promise.resolve(null),
      may(permissions, "capa:read")
        ? this.analytics.capaAging(tenantId, filters, now)
        : Promise.resolve(null),
      may(permissions, "risk:read")
        ? this.analytics.recentKpiRisks(tenantId)
        : Promise.resolve(null),
      may(permissions, "capa:read")
        ? this.analytics.capasDueSoon(tenantId, now)
        : Promise.resolve(null),
      may(permissions, "policies:read")
        ? this.analytics.policiesDueForReview(tenantId, now)
        : Promise.resolve(null),
      may(permissions, "integrations:read")
        ? this.analytics.genracStatus(tenantId)
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
              active: frameworks.filter((item) =>
                isFrameworkActiveInScope(item.scopeStatus),
              ).length,
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
      /**
       * Live analytics for the dashboard visualisations. Added alongside the
       * existing keys rather than replacing them, so no current consumer of
       * this endpoint can be broken by it. Every member is `null` when the
       * caller lacks the permission its source module requires.
       */
      analytics: {
        cards: {
          kpiDefinitions: kpis?.definitions ?? null,
          activeKpiConfigurations: kpis?.enabled ?? null,
          measuredKpis: kpis?.measured ?? null,
          kpisMeetingTarget: kpis?.targetMet ?? null,
          kpisMissingTarget:
            kpis === null ? null : kpis.measured - kpis.targetMet,
          pendingEvidence: evidence?.pendingReview ?? null,
          openRisks: risks?.openTotal ?? null,
          openGaps: gaps?.open ?? null,
          openCapas: capas?.open ?? null,
          policiesDueForReview: policiesDueForReview?.total ?? null,
          evidenceExpiringSoon: evidence?.expiringSoon ?? null,
          evidenceExpired: evidence?.expired ?? null,
        },
        kpiTrend,
        evidenceStatus,
        frameworkCompliance,
        riskHeatMap,
        capaAging,
        recentKpiRisks,
        capasDueSoon,
        policiesDueForReview,
        actionQueue: buildActionQueue({
          pendingEvidenceReview: evidence?.pendingReview ?? null,
          pendingKpiApprovals: kpis?.pendingApproval ?? null,
          overdueCapas: capas?.overdue ?? null,
          overdueGaps: gaps?.overdue ?? null,
          openGaps: gaps?.open ?? null,
          policiesOverdueForReview: policiesDueForReview?.overdue ?? null,
        }),
        genrac,
      },
    };
  }
}

/**
 * Builds the derived Action Queue.
 *
 * A source the caller may not read contributes nothing rather than a zero: a
 * zero would read as "nothing to do", which is a different claim from "you
 * cannot see this". Entries with a count of zero are dropped so the queue
 * shows work, not an inventory of empty buckets.
 */
export const buildActionQueue = (counts: {
  pendingEvidenceReview: number | null;
  pendingKpiApprovals: number | null;
  overdueCapas: number | null;
  overdueGaps: number | null;
  openGaps: number | null;
  policiesOverdueForReview: number | null;
}): ActionQueueItem[] => {
  const candidates: ActionQueueItem[] = [
    {
      key: "evidence-review",
      label: "Evidence awaiting review",
      description: "Submitted Evidence with no review decision recorded.",
      count: counts.pendingEvidenceReview ?? 0,
      to: "/evidence/review",
      tone: "blue",
    },
    {
      key: "kpi-approval",
      label: "KPI actuals awaiting approval",
      description: "Submitted KPI actuals with no approval decision.",
      count: counts.pendingKpiApprovals ?? 0,
      to: "/kpi/approval",
      tone: "blue",
    },
    {
      key: "capa-overdue",
      label: "Overdue CAPAs",
      description: "Open corrective actions past their recorded due date.",
      count: counts.overdueCapas ?? 0,
      to: "/compliance/capa",
      tone: "red",
    },
    {
      key: "gap-overdue",
      label: "Overdue Gaps",
      description: "Open compliance gaps past their recorded due date.",
      count: counts.overdueGaps ?? 0,
      to: "/compliance/gaps",
      tone: "red",
    },
    {
      key: "gap-open",
      label: "Open Gaps",
      description: "Compliance gaps still awaiting remediation.",
      count: counts.openGaps ?? 0,
      to: "/compliance/gaps",
      tone: "amber",
    },
    {
      key: "policy-review",
      label: "Policies past review date",
      description: "Approved Policy Versions whose review date has passed.",
      count: counts.policiesOverdueForReview ?? 0,
      to: "/compliance/policy-register",
      tone: "amber",
    },
  ];
  return candidates
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};
