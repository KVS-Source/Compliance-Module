import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * KPI Catalogue, Frequency Master and KPI Analytics.
 *
 * All three read the same two tables — `kpi_definitions` (shared master data)
 * and this Company's `kpi_configurations` / `kpi_actuals`. No new model is
 * introduced: a "Frequency Master" is the set of frequencies the definitions
 * actually use, not a separate list somebody has to keep in step.
 *
 * A field the schema does not carry — a KPI perspective, or a framework link
 * at definition level — is reported as `null` and printed as "—". Inventing a
 * category would put a claim on screen that no row supports.
 */

const decimal = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** Achievement rate over measured actuals; null when nothing is measured. */
export const kpiAchievementRate = (measured: number, meetingTarget: number) =>
  measured === 0 ? null : Math.round((meetingTarget / measured) * 1000) / 10;

export interface KpiAnalyticsFilters {
  readonly frequency?: string;
  readonly ownerId?: string;
  readonly departmentId?: string;
  readonly period?: string;
}

export class KpiCatalogueService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * The governed catalogue of KPI definitions, with this Company's
   * configuration state alongside each one.
   *
   * `configuredCount` is what makes the row meaningful to a client: a
   * definition the shared catalogue offers but this Company has never
   * configured is shown as `NOT_CONFIGURED` rather than quietly omitted.
   */
  async catalogue(tenantId: string) {
    const [definitions, configurations] = await Promise.all([
      this.db.kpiDefinition.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          unit: true,
          direction: true,
          frequency: true,
          status: true,
        },
        orderBy: { code: "asc" },
      }),
      this.db.kpiConfiguration.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          kpiDefinitionId: true,
          enabled: true,
          status: true,
          reviewFrequency: true,
          productService: true,
          owner: { select: { id: true, fullName: true } },
          department: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    const byDefinition = new Map<string, typeof configurations>();
    for (const configuration of configurations) {
      const list = byDefinition.get(configuration.kpiDefinitionId) ?? [];
      list.push(configuration);
      byDefinition.set(configuration.kpiDefinitionId, list);
    }

    return definitions.map((definition) => {
      const configured = byDefinition.get(definition.id) ?? [];
      const active = configured.filter(
        (item) => item.enabled && item.status === "ACTIVE",
      );
      const owners = [
        ...new Map(
          configured
            .filter((item) => item.owner !== null)
            .map((item) => [item.owner.id, item.owner.fullName] as const),
        ).values(),
      ];
      const departments = [
        ...new Map(
          configured
            .filter((item) => item.department !== null)
            .map(
              (item) => [item.department!.id, item.department!.name] as const,
            ),
        ).values(),
      ];
      return {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        unit: definition.unit,
        direction: definition.direction,
        frequency: definition.frequency,
        status: definition.status,
        // The schema carries no perspective or framework link at definition
        // level. Reported as absent rather than guessed from the code prefix.
        perspective: null,
        framework: null,
        configurationCount: configured.length,
        activeConfigurationCount: active.length,
        configurationStatus:
          active.length > 0
            ? "ACTIVE"
            : configured.length > 0
              ? "CONFIGURED_INACTIVE"
              : "NOT_CONFIGURED",
        owners,
        departments,
      };
    });
  }

  /**
   * Frequency Master.
   *
   * The distinct frequencies present on KPI definitions, with how many
   * definitions and how many of this Company's configurations use each. There
   * is no `frequencies` table and this endpoint does not create one.
   */
  async frequencies(tenantId: string) {
    const [definitionGroups, configurationGroups, activeGroups] =
      await Promise.all([
        this.db.kpiDefinition.groupBy({
          by: ["frequency"],
          _count: { _all: true },
        }),
        this.db.kpiConfiguration.groupBy({
          by: ["reviewFrequency"],
          where: { tenantId, deletedAt: null },
          _count: { _all: true },
        }),
        this.db.kpiConfiguration.groupBy({
          by: ["reviewFrequency"],
          where: { tenantId, deletedAt: null, enabled: true, status: "ACTIVE" },
          _count: { _all: true },
        }),
      ]);
    const configured = new Map<string, number>(
      configurationGroups.map((group) => [
        String(group.reviewFrequency),
        group._count._all,
      ]),
    );
    const active = new Map<string, number>(
      activeGroups.map((group) => [
        String(group.reviewFrequency),
        group._count._all,
      ]),
    );
    // A frequency used only by a configuration still belongs in the list.
    const codes = new Set<string>([
      ...definitionGroups.map((group) => String(group.frequency)),
      ...configured.keys(),
    ]);
    const definitionCounts = new Map<string, number>(
      definitionGroups.map((group) => [
        String(group.frequency),
        group._count._all,
      ]),
    );
    return [...codes].sort().map((code) => ({
      code,
      definitionCount: definitionCounts.get(code) ?? 0,
      configurationCount: configured.get(code) ?? 0,
      activeConfigurationCount: active.get(code) ?? 0,
    }));
  }

  private analyticsWhere(
    tenantId: string,
    filters: KpiAnalyticsFilters,
  ): Prisma.KpiActualWhereInput {
    return {
      tenantId,
      deletedAt: null,
      ...(filters.period ? { period: filters.period } : {}),
      configuration: {
        deletedAt: null,
        enabled: true,
        status: "ACTIVE",
        definition: {
          direction: { not: "INFORMATIONAL" },
          ...(filters.frequency
            ? { frequency: filters.frequency as never }
            : {}),
        },
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
      },
    };
  }

  /**
   * KPI Analytics.
   *
   * Every series is grouped from the actuals themselves. There is no synthetic
   * month axis: a company with two reporting periods gets two points.
   */
  async analytics(tenantId: string, filters: KpiAnalyticsFilters) {
    const where = this.analyticsWhere(tenantId, filters);
    const [measured, meetingTarget, ragGroups, trendTotals, trendMet, missed] =
      await Promise.all([
        this.db.kpiActual.count({ where }),
        this.db.kpiActual.count({ where: { ...where, targetMet: true } }),
        this.db.kpiActual.groupBy({
          by: ["ragStatus"],
          where,
          _count: { _all: true },
        }),
        this.db.kpiActual.groupBy({
          by: ["period"],
          where,
          _count: { _all: true },
          _min: { periodStart: true },
        }),
        this.db.kpiActual.groupBy({
          by: ["period"],
          where: { ...where, targetMet: true },
          _count: { _all: true },
        }),
        this.db.kpiActual.findMany({
          where: { ...where, targetMet: false },
          select: {
            id: true,
            code: true,
            period: true,
            ragStatus: true,
            targetValueSnapshot: true,
            actualValue: true,
            variance: true,
            variancePercentage: true,
            approvalStatus: true,
            configuration: {
              select: {
                definition: {
                  select: {
                    code: true,
                    name: true,
                    unit: true,
                    direction: true,
                    frequency: true,
                  },
                },
                owner: { select: { fullName: true } },
                department: { select: { name: true } },
              },
            },
          },
          orderBy: [{ periodStart: "desc" }, { code: "asc" }],
          take: 100,
        }),
      ]);

    const departmentGroups = await this.db.kpiActual.groupBy({
      by: ["kpiConfigurationId"],
      where,
      _count: { _all: true },
    });
    const configurationIds = departmentGroups.map(
      (group) => group.kpiConfigurationId,
    );
    const configurations =
      configurationIds.length === 0
        ? []
        : await this.db.kpiConfiguration.findMany({
            where: { tenantId, id: { in: configurationIds } },
            select: {
              id: true,
              department: { select: { id: true, code: true, name: true } },
            },
          });
    const departmentById = new Map(
      configurations.map((item) => [item.id, item.department] as const),
    );
    const departmentTotals = new Map<
      string,
      { id: string | null; code: string | null; name: string; measured: number }
    >();
    for (const group of departmentGroups) {
      const department = departmentById.get(group.kpiConfigurationId) ?? null;
      const key = department?.id ?? "unassigned";
      const existing = departmentTotals.get(key) ?? {
        id: department?.id ?? null,
        code: department?.code ?? null,
        name: department?.name ?? "Unassigned",
        measured: 0,
      };
      existing.measured += group._count._all;
      departmentTotals.set(key, existing);
    }

    const metByPeriod = new Map(
      trendMet.map((row) => [row.period, row._count._all] as const),
    );

    return {
      generatedAt: new Date(),
      filters: {
        frequency: filters.frequency ?? null,
        ownerId: filters.ownerId ?? null,
        departmentId: filters.departmentId ?? null,
        period: filters.period ?? null,
      },
      summary: {
        measured,
        meetingTarget,
        missingTarget: measured - meetingTarget,
        achievementRate: kpiAchievementRate(measured, meetingTarget),
      },
      ragDistribution: ragGroups
        .map((group) => ({
          status: group.ragStatus ?? "UNRATED",
          count: group._count._all,
        }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      trend: trendTotals
        .map((row) => ({
          period: row.period,
          periodStart: row._min.periodStart,
          measured: row._count._all,
          meetingTarget: metByPeriod.get(row.period) ?? 0,
          achievementRate: kpiAchievementRate(
            row._count._all,
            metByPeriod.get(row.period) ?? 0,
          ),
        }))
        .sort((a, b) => {
          const left = a.periodStart?.getTime() ?? 0;
          const right = b.periodStart?.getTime() ?? 0;
          return left - right || a.period.localeCompare(b.period);
        }),
      departmentDistribution: [...departmentTotals.values()].sort(
        (a, b) => b.measured - a.measured || a.name.localeCompare(b.name),
      ),
      missedKpis: missed.map((actual) => ({
        id: actual.id,
        code: actual.code,
        period: actual.period,
        ragStatus: actual.ragStatus,
        approvalStatus: actual.approvalStatus,
        definitionCode: actual.configuration.definition.code,
        definitionName: actual.configuration.definition.name,
        unit: actual.configuration.definition.unit,
        direction: actual.configuration.definition.direction,
        frequency: actual.configuration.definition.frequency,
        ownerName: actual.configuration.owner?.fullName ?? null,
        departmentName: actual.configuration.department?.name ?? null,
        targetValue: decimal(actual.targetValueSnapshot),
        actualValue: decimal(actual.actualValue),
        variance: decimal(actual.variance),
        variancePercentage: decimal(actual.variancePercentage),
      })),
    };
  }
}
