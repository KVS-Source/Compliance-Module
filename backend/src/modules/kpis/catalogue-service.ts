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
   * Live KPI compliance traceability derived from governed relationships.
   *
   * There is deliberately no standalone "KPI mapping" table. The chain is
   * assembled from active Evidence↔KPI Actual and Evidence↔Control links,
   * then from the Control's active Policy Version, Framework and Framework
   * Rule mappings. Risk is the governed Risk linked to the same KPI Actual.
   * This keeps the page truthful and prevents a second, contradictory mapping
   * store from being introduced solely for presentation.
   *
   * `kpi.frameworkMapping` is reported alongside that derived chain but is not
   * part of it. It is the clause list the Company *declared* in
   * `14_KPI_Master`, carried verbatim from the workbook. A declared clause is
   * an intent, not evidence, so it never contributes to `completeness` — the
   * `declaredWithoutChain` summary counts exactly the KPIs where the workbook
   * claims a framework link that no governed control chain yet supports, which
   * is the gap an auditor needs to see rather than have papered over.
   */
  async traceability(tenantId: string) {
    const actuals = await this.db.kpiActual.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        period: true,
        targetValueSnapshot: true,
        actualValue: true,
        variance: true,
        variancePercentage: true,
        ragStatus: true,
        targetMet: true,
        approvalStatus: true,
        submittedAt: true,
        configuration: {
          select: {
            id: true,
            definition: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                direction: true,
                frameworkMapping: true,
              },
            },
            owner: { select: { id: true, fullName: true } },
            department: { select: { id: true, code: true, name: true } },
          },
        },
        target: { select: { id: true, code: true, version: true } },
        risks: {
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            code: true,
            title: true,
            kpiRiskClass: true,
            generalLevel: true,
            status: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        },
        evidenceLinks: {
          where: { tenantId, isActive: true },
          select: {
            evidence: {
              select: {
                id: true,
                code: true,
                title: true,
                lifecycleStatus: true,
                controlLinks: {
                  where: { tenantId, isActive: true },
                  select: {
                    control: {
                      select: {
                        id: true,
                        code: true,
                        title: true,
                        implementationStatus: true,
                        policyVersionMappings: {
                          where: { tenantId, isActive: true },
                          select: {
                            policyVersion: {
                              select: {
                                id: true,
                                versionMajor: true,
                                versionMinor: true,
                                status: true,
                                policy: {
                                  select: { id: true, code: true, title: true },
                                },
                              },
                            },
                          },
                        },
                        frameworkMappings: {
                          where: { tenantId, isActive: true },
                          select: {
                            framework: {
                              select: {
                                id: true,
                                code: true,
                                name: true,
                                version: true,
                                scopeStatus: true,
                              },
                            },
                            ruleControls: {
                              where: { tenantId, isActive: true },
                              select: {
                                frameworkRule: {
                                  select: {
                                    id: true,
                                    code: true,
                                    title: true,
                                    clauseRef: true,
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
      take: 100,
    });

    const uniqueById = <T extends { id: string }>(items: T[]) =>
      [...new Map(items.map((item) => [item.id, item])).values()];

    const rows = actuals.map((actual) => {
      const evidence = uniqueById(
        actual.evidenceLinks.map((link) => ({
          id: link.evidence.id,
          code: link.evidence.code,
          title: link.evidence.title,
          status: link.evidence.lifecycleStatus,
        })),
      );
      const controls = uniqueById(
        actual.evidenceLinks.flatMap((link) =>
          link.evidence.controlLinks.map(({ control }) => ({
            id: control.id,
            code: control.code,
            title: control.title,
            status: control.implementationStatus,
          })),
        ),
      );
      const controlRecords = actual.evidenceLinks.flatMap((link) =>
        link.evidence.controlLinks.map(({ control }) => control),
      );
      const policies = uniqueById(
        controlRecords.flatMap((control) =>
          control.policyVersionMappings.map(({ policyVersion }) => ({
            id: policyVersion.policy.id,
            code: policyVersion.policy.code,
            title: policyVersion.policy.title,
            versionId: policyVersion.id,
            version: `${policyVersion.versionMajor}.${policyVersion.versionMinor}`,
            status: policyVersion.status,
          })),
        ),
      );
      const frameworks = uniqueById(
        controlRecords.flatMap((control) =>
          control.frameworkMappings.map(({ framework }) => ({
            id: framework.id,
            code: framework.code,
            name: framework.name,
            version: framework.version,
            scopeStatus: framework.scopeStatus,
          })),
        ),
      );
      const rules = uniqueById(
        controlRecords.flatMap((control) =>
          control.frameworkMappings.flatMap((mapping) =>
            mapping.ruleControls.map(({ frameworkRule }) => ({
              id: frameworkRule.id,
              code: frameworkRule.code,
              title: frameworkRule.title,
              clauseRef: frameworkRule.clauseRef,
            })),
          ),
        ),
      );
      const risks = actual.risks.map((risk) => ({
        id: risk.id,
        code: risk.code,
        title: risk.title,
        classification: risk.kpiRiskClass ?? risk.generalLevel,
        status: risk.status,
      }));
      const mappedNodes =
        2 +
        Number(policies.length > 0) +
        Number(frameworks.length > 0) +
        Number(rules.length > 0) +
        Number(evidence.length > 0) +
        Number(controls.length > 0) +
        Number(risks.length > 0);

      return {
        id: actual.id,
        kpi: actual.configuration.definition,
        configuration: {
          id: actual.configuration.id,
          owner: actual.configuration.owner
            ? {
                id: actual.configuration.owner.id,
                name: actual.configuration.owner.fullName,
              }
            : null,
          department: actual.configuration.department,
        },
        targetActual: {
          targetId: actual.target.id,
          targetCode: actual.target.code,
          targetVersion: actual.target.version,
          actualId: actual.id,
          actualCode: actual.code,
          period: actual.period,
          targetValue: String(actual.targetValueSnapshot),
          actualValue: String(actual.actualValue),
          variance: String(actual.variance),
          variancePercentage:
            actual.variancePercentage === null
              ? null
              : String(actual.variancePercentage),
          ragStatus: actual.ragStatus,
          targetMet: actual.targetMet,
          approvalStatus: actual.approvalStatus,
        },
        policies,
        frameworks,
        rules,
        evidence,
        controls,
        risks,
        completeness: {
          mappedNodes,
          totalNodes: 8,
          complete: mappedNodes === 8,
        },
      };
    });

    return {
      generatedAt: new Date(),
      summary: {
        actuals: rows.length,
        completeChains: rows.filter((row) => row.completeness.complete).length,
        missingEvidence: rows.filter((row) => row.evidence.length === 0).length,
        riskLinked: rows.filter((row) => row.risks.length > 0).length,
        declaredWithoutChain: rows.filter(
          (row) =>
            row.kpi.frameworkMapping !== null && row.frameworks.length === 0,
        ).length,
      },
      rows,
    };
  }

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
