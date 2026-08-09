import { Prisma, type KpiDirection, type KpiFrequency } from "@prisma/client";
import { KpiPerformanceService } from "../../kpis/performance-service.js";
import {
  AUTOMATIC_KPI_RISK_FACTORS,
  formatRiskCode,
  generalLevelForScore,
} from "../../risks/service.js";
import {
  FieldParseError,
  mapEnum,
  normaliseBoolean,
  normaliseNumber,
  normaliseText,
} from "../normalise.js";
import type { SheetTable } from "../sheet-table.js";
import {
  type CommitResult,
  type ImportContext,
  type SheetImporter,
  type ValidatedRow,
  rowError,
} from "../types.js";
import { flagDuplicateKeys } from "./masters.js";

const DIRECTIONS: Record<string, KpiDirection> = {
  "Higher is Better": "HIGHER_IS_BETTER",
  "Lower is Better": "LOWER_IS_BETTER",
  "Target Exact": "TARGET_EXACT",
  Informational: "INFORMATIONAL",
};

const FREQUENCIES: Record<string, KpiFrequency> = {
  Daily: "DAILY",
  Weekly: "WEEKLY",
  Monthly: "MONTHLY",
  Quarterly: "QUARTERLY",
  "Half-Yearly": "HALF_YEARLY",
  Annual: "ANNUAL",
  Continuous: "CONTINUOUS",
  "Per-Event": "PER_EVENT",
  "One-Time": "ONE_TIME",
};

/**
 * Derives the period window for a workbook period label.
 *
 * The client operates an Indian financial year (April–March), so `FY26-27 Q1`
 * is April–June 2026 and `FY26-27` spans April 2026 to March 2027. Windows are
 * computed here rather than read from the sheet so every row is consistent.
 */
export const periodWindow = (period: string) => {
  const financialYear = /^FY(\d{2})-(\d{2})(?:\s*Q([1-4]))?$/i.exec(
    period.trim(),
  );
  if (financialYear) {
    const startYear = 2000 + Number(financialYear[1]);
    const quarter = financialYear[3] ? Number(financialYear[3]) : undefined;
    if (quarter === undefined) {
      return {
        start: new Date(Date.UTC(startYear, 3, 1)),
        end: new Date(Date.UTC(startYear + 1, 2, 31)),
      };
    }
    const startMonth = 3 + (quarter - 1) * 3;
    const start = new Date(Date.UTC(startYear, startMonth, 1));
    const end = new Date(Date.UTC(startYear, startMonth + 3, 0));
    return { start, end };
  }
  const monthYear = /^([A-Za-z]{3})-(\d{2})$/.exec(period.trim());
  if (monthYear) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = months.indexOf(monthYear[1]!.toLowerCase());
    if (month >= 0) {
      const year = 2000 + Number(monthYear[2]);
      return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 0)),
      };
    }
  }
  return undefined;
};

/**
 * Creates or revises the approved target for one KPI period.
 *
 * An approved target is immutable — the `kpi_targets_approved_immutable`
 * trigger freezes every column except `superseded_by_id`. A revised workbook
 * that changes a target value therefore supersedes the existing row with a new
 * version rather than editing it, which is also what the management API does.
 * An unchanged value writes nothing at all, so a rerun is a no-op.
 */
const upsertApprovedTarget = async (
  context: ImportContext,
  input: {
    kpiCode: string;
    configurationId: string;
    period: string;
    targetValue: number | string;
    window: { start: Date; end: Date };
  },
) => {
  const value = new Prisma.Decimal(input.targetValue);
  const current = await context.tx.kpiTarget.findFirst({
    where: {
      tenantId: context.tenantId,
      kpiConfigurationId: input.configurationId,
      period: input.period,
      deletedAt: null,
      supersededById: null,
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      targetValue: true,
      approvalStatus: true,
    },
  });

  if (current && current.targetValue.equals(value)) {
    context.kpiTargets.set(`${input.kpiCode}|${input.period}`, current.id);
    return { id: current.id, changed: false };
  }

  if (current && current.approvalStatus !== "APPROVED") {
    const updated = await context.tx.kpiTarget.update({
      where: { id: current.id },
      data: { targetValue: value, updatedById: context.actorUserId },
      select: { id: true },
    });
    context.kpiTargets.set(`${input.kpiCode}|${input.period}`, updated.id);
    return { id: updated.id, changed: true };
  }

  const version = current ? current.version + 1 : 1;
  const created = await context.tx.kpiTarget.create({
    data: {
      tenantId: context.tenantId,
      kpiConfigurationId: input.configurationId,
      code: `TGT-${input.kpiCode}-${input.period.replace(/\s+/g, "")}-V${version}`,
      period: input.period,
      periodStart: input.window.start,
      periodEnd: input.window.end,
      targetValue: value,
      version,
      // An imported target is the client's already-agreed number, so it
      // arrives approved rather than re-entering this platform's approval
      // workflow. `approvedById` stays null because no platform user approved
      // it; the import batch and its audit event record who loaded it.
      approvalStatus: "APPROVED",
      approvedById: null,
      approvedAt: new Date(),
      effectiveFrom: input.window.start,
      createdById: context.actorUserId,
      updatedById: context.actorUserId,
    },
    select: { id: true },
  });
  if (current) {
    await context.tx.kpiTarget.update({
      where: { id: current.id },
      data: { supersededById: created.id, updatedById: context.actorUserId },
    });
  }
  context.kpiTargets.set(`${input.kpiCode}|${input.period}`, created.id);
  return { id: created.id, changed: true };
};

/** `14_KPI_Master` — the global KPI definition catalogue. */
export const kpiDefinitionImporter: SheetImporter = {
  key: "kpi_master",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("kpi code"));
      if (code === undefined) continue;
      const name = normaliseText(row.cell("kpi name"));
      const unit = normaliseText(row.cell("unit"));
      const direction = mapEnum(row.cell("direction"), DIRECTIONS);
      const frequency = mapEnum(row.cell("frequency"), FREQUENCIES);
      const errors = [];
      if (name === undefined)
        errors.push(rowError("KPI Name", "Name is required"));
      if (unit === undefined) {
        errors.push(rowError("Unit", "Unit of measure is required"));
      }
      if (direction === undefined) {
        errors.push(
          rowError("Direction", "Direction is not a recognised value"),
        );
      }
      if (frequency === undefined) {
        errors.push(
          rowError("Frequency", "Frequency is not a recognised value"),
        );
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          name: name ?? null,
          unit: unit ?? null,
          direction: direction ?? null,
          frequency: frequency ?? null,
          description: normaliseText(row.cell("description")) ?? null,
          frameworkMapping:
            normaliseText(row.cell("compliance framework mapping")) ?? null,
          defaultDataSource:
            normaliseText(row.cell("default data source")) ?? null,
          ownerSuggestion: normaliseText(row.cell("owner suggestion")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "KPI Code");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        name: string;
        unit: string;
        direction: KpiDirection;
        frequency: KpiFrequency;
        description: string | null;
        frameworkMapping: string | null;
        defaultDataSource: string | null;
        ownerSuggestion: string | null;
      };
      const existing = await context.tx.kpiDefinition.findUnique({
        where: { code: payload.code },
        select: { id: true },
      });
      const definition = await context.tx.kpiDefinition.upsert({
        where: { code: payload.code },
        update: {
          name: payload.name,
          unit: payload.unit,
          direction: payload.direction,
          frequency: payload.frequency,
          description: payload.description,
          frameworkMapping: payload.frameworkMapping,
          defaultDataSource: payload.defaultDataSource,
          ownerSuggestion: payload.ownerSuggestion,
        },
        create: {
          code: payload.code,
          name: payload.name,
          unit: payload.unit,
          direction: payload.direction,
          frequency: payload.frequency,
          description: payload.description,
          frameworkMapping: payload.frameworkMapping,
          defaultDataSource: payload.defaultDataSource,
          ownerSuggestion: payload.ownerSuggestion,
        },
        select: { id: true },
      });
      context.kpiDefinitions.set(payload.code, definition.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "kpi_definitions",
        destinationRecordId: definition.id,
      });
    }
    return results;
  },
};

/**
 * `15_KPI_Config_Targets` — per-company configuration plus the approved target
 * for the stated period. Rows marked `Enabled? = No` are configured but carry
 * no target, so only enabled rows produce a `kpi_targets` row.
 */
export const kpiConfigurationImporter: SheetImporter = {
  key: "kpi_config",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("kpi code"));
      if (code === undefined) continue;
      const enabled = normaliseBoolean(row.cell("enabled")) ?? false;
      const errors = [];
      let targetValue: number | undefined;
      try {
        targetValue = normaliseNumber(row.cell("target value"));
      } catch (error) {
        errors.push(
          rowError(
            "Target Value",
            error instanceof FieldParseError ? error.message : "Invalid target",
          ),
        );
      }
      const period = normaliseText(row.cell("period"));
      if (enabled && targetValue === undefined && errors.length === 0) {
        errors.push(
          rowError("Target Value", "An enabled KPI requires a target value"),
        );
      }
      if (enabled && period === undefined) {
        errors.push(rowError("Period", "An enabled KPI requires a period"));
      }
      if (enabled && period !== undefined && !periodWindow(period)) {
        errors.push(
          rowError("Period", `Period "${period}" is not a recognised window`),
        );
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          enabled,
          targetValue: targetValue ?? null,
          period: period ?? null,
          reviewFrequency: mapEnum(row.cell("review frequency"), FREQUENCIES),
          ownerRef: normaliseText(row.cell("owner user id")) ?? null,
          businessUnit: normaliseText(row.cell("business unit")) ?? null,
          location: normaliseText(row.cell("location")) ?? null,
          productService: normaliseText(row.cell("product service")) ?? null,
          notes: normaliseText(row.cell("notes")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "KPI Code");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        enabled: boolean;
        targetValue: number | null;
        period: string | null;
        reviewFrequency: KpiFrequency | undefined;
        ownerRef: string | null;
        businessUnit: string | null;
        location: string | null;
        productService: string | null;
      };
      const kpiDefinitionId = context.kpiDefinitions.get(payload.code);
      if (!kpiDefinitionId) {
        results.push({
          rowNumber: row.rowNumber,
          outcome: "SKIPPED",
          destinationTable: "kpi_configurations",
          destinationRecordId: null,
        });
        continue;
      }
      const definition = await context.tx.kpiDefinition.findUnique({
        where: { id: kpiDefinitionId },
        select: { frequency: true },
      });

      const existing = await context.tx.kpiConfiguration.findFirst({
        where: {
          tenantId: context.tenantId,
          kpiDefinitionId,
          deletedAt: null,
        },
        select: { id: true },
      });
      const data = {
        enabled: payload.enabled,
        reviewFrequency:
          payload.reviewFrequency ?? definition?.frequency ?? "QUARTERLY",
        orgUnitId: payload.businessUnit
          ? (context.orgUnits.get(payload.businessUnit.toLowerCase()) ?? null)
          : null,
        orgLocationId: payload.location
          ? (context.orgLocations.get(payload.location.toLowerCase()) ?? null)
          : null,
        productService: payload.productService,
        sourceOwnerRef: payload.ownerRef,
        updatedById: context.actorUserId,
      };
      const configuration = existing
        ? await context.tx.kpiConfiguration.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.kpiConfiguration.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              kpiDefinitionId,
              // The workbook's owner column holds a `U-00n` token, not a
              // platform account. The import actor owns the record while the
              // original token is retained as non-authoritative metadata.
              ownerId: context.actorUserId,
              effectiveFrom: new Date(Date.UTC(2025, 3, 1)),
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      context.kpiConfigurations.set(payload.code, configuration.id);

      if (payload.enabled && payload.targetValue !== null && payload.period) {
        const window = periodWindow(payload.period);
        if (window) {
          await upsertApprovedTarget(context, {
            kpiCode: payload.code,
            configurationId: configuration.id,
            period: payload.period,
            targetValue: payload.targetValue,
            window,
          });
        }
      }
      if (payload.enabled && payload.targetValue !== null && payload.period) {
        context.kpiBaseTargets.set(payload.code, {
          value: String(payload.targetValue),
          period: payload.period,
        });
      }

      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "kpi_configurations",
        destinationRecordId: configuration.id,
      });
    }
    return results;
  },
};

/**
 * Finds the target an actual is measured against, deriving one when needed.
 *
 * `kpi_actuals` is joined to `kpi_targets` on the period itself, so an actual
 * can only reference a target for exactly its own period. The workbook
 * configures a single financial-year target per KPI but reports actuals
 * quarterly and monthly, echoing that same target value against every reported
 * row. A period target is therefore materialised from the configured value,
 * marked in its code and change history so the derivation stays visible.
 *
 * A period with no configured target at all — and a label with no derivable
 * window, such as `Per-Event` — yields no target, and the caller skips the row.
 */
const resolveTargetForPeriod = async (
  context: ImportContext,
  kpiCode: string,
  configurationId: string,
  period: string,
) => {
  const cached = context.kpiTargets.get(`${kpiCode}|${period}`);
  if (cached) return cached;

  const base = context.kpiBaseTargets.get(kpiCode);
  if (!base) return undefined;
  const window = periodWindow(period);
  if (!window) return undefined;

  const target = await upsertApprovedTarget(context, {
    kpiCode,
    configurationId,
    period,
    targetValue: base.value,
    window,
  });
  return target.id;
};

/**
 * Applies the platform's KPI risk rule to an imported actual.
 *
 * A met target shows No Risk and writes no risk record. A miss that evaluates
 * AMBER or RED creates exactly one linked risk, classified only as Minor or
 * Major — the enterprise `generalLevel` scale stays a separate field. Because
 * the importer is rerunnable, an existing active risk for the same actual is
 * updated in place and a risk whose KPI now meets its target is closed, so
 * reprocessing a period never accumulates duplicates. The
 * `risks_one_active_per_kpi_actual` partial unique index is the backstop.
 */
const synchroniseKpiRisk = async (
  context: ImportContext,
  input: {
    actualId: string;
    configurationId: string;
    targetId: string;
    period: string;
    kpiCode: string;
    kpiName: string;
    targetValue: string;
    actualValue: string;
    variance: string;
    ragStatus: "GREEN" | "AMBER" | "RED" | null;
    riskClass: "MINOR" | "MAJOR" | null;
  },
) => {
  const active = await context.tx.risk.findFirst({
    where: {
      tenantId: context.tenantId,
      kpiActualId: input.actualId,
      deletedAt: null,
      status: { notIn: ["CLOSED", "ARCHIVED"] },
    },
    select: { id: true },
  });

  if (!input.riskClass || !input.ragStatus || input.ragStatus === "GREEN") {
    if (active) {
      await context.tx.risk.update({
        where: { id: active.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closureReason:
            "KPI now meets its target after a workbook import; no risk remains.",
          updatedById: context.actorUserId,
        },
      });
    }
    return;
  }

  const factors = AUTOMATIC_KPI_RISK_FACTORS[input.riskClass];
  const inherentScore = factors.likelihood * factors.impact;
  const shared = {
    title: `KPI target missed: ${input.kpiCode} ${input.kpiName} (${input.period})`,
    description:
      "Raised from a workbook import. " +
      `Target snapshot: ${input.targetValue}; ` +
      `actual value: ${input.actualValue}; ` +
      `variance: ${input.variance}; RAG: ${input.ragStatus}.`,
    inherentLikelihood: factors.likelihood,
    inherentImpact: factors.impact,
    inherentScore,
    kpiRiskClass: input.riskClass,
    generalLevel: generalLevelForScore(inherentScore),
    updatedById: context.actorUserId,
  };

  if (active) {
    await context.tx.risk.update({ where: { id: active.id }, data: shared });
    return;
  }

  const tenant = await context.tx.tenant.update({
    where: { id: context.tenantId },
    data: { nextRiskNumber: { increment: 1 } },
    select: { nextRiskNumber: true },
  });
  await context.tx.risk.create({
    data: {
      ...shared,
      tenantId: context.tenantId,
      code: formatRiskCode(tenant.nextRiskNumber - 1),
      kpiActualId: input.actualId,
      kpiConfigurationId: input.configurationId,
      kpiTargetId: input.targetId,
      status: "OPEN",
      createdById: context.actorUserId,
    },
  });
};

/**
 * `16_KPI_Actuals_Entry` — reported values per period.
 *
 * The sheet carries its own Variance, Variance % and RAG columns. They are
 * deliberately ignored: variance and RAG are recomputed by
 * `KpiPerformanceService` so the demo shows backend logic, and so a stale
 * spreadsheet formula cannot contradict the database.
 */
export const kpiActualImporter: SheetImporter = {
  key: "kpi_actuals",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("kpi code"));
      if (code === undefined) continue;
      const period = normaliseText(row.cell("period"));
      const errors = [];
      let actualValue: number | undefined;
      try {
        actualValue = normaliseNumber(row.cell("actual"));
      } catch (error) {
        errors.push(
          rowError(
            "Actual",
            error instanceof FieldParseError ? error.message : "Invalid actual",
          ),
        );
      }
      if (period === undefined) {
        errors.push(rowError("Period", "Period is required"));
      }
      if (actualValue === undefined && errors.length === 0) {
        errors.push(rowError("Actual", "Actual value is required"));
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: period ? `${code}|${period}` : code,
        payload: {
          code,
          period: period ?? null,
          actualValue: actualValue ?? null,
          comments: normaliseText(row.cell("comments")) ?? null,
          leaderRef: normaliseText(row.cell("leader")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "KPI Code and Period");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const performance = new KpiPerformanceService();
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        period: string;
        actualValue: number;
        comments: string | null;
      };
      const configurationId = context.kpiConfigurations.get(payload.code);
      if (!configurationId) {
        results.push({
          rowNumber: row.rowNumber,
          outcome: "SKIPPED",
          destinationTable: "kpi_actuals",
          destinationRecordId: null,
        });
        continue;
      }
      const targetId = await resolveTargetForPeriod(
        context,
        payload.code,
        configurationId,
        payload.period,
      );
      if (!targetId) {
        // An actual with no target for its period has no baseline to compare
        // against. It is skipped and reported rather than measured against an
        // invented number.
        results.push({
          rowNumber: row.rowNumber,
          outcome: "SKIPPED",
          destinationTable: "kpi_actuals",
          destinationRecordId: null,
        });
        continue;
      }
      const target = await context.tx.kpiTarget.findUnique({
        where: { id: targetId },
        select: {
          targetValue: true,
          minValue: true,
          maxValue: true,
          periodStart: true,
          periodEnd: true,
        },
      });
      const configuration = await context.tx.kpiConfiguration.findUnique({
        where: { id: configurationId },
        select: {
          amberThresholdPct: true,
          redThresholdPct: true,
          definition: { select: { code: true, name: true, direction: true } },
          tenant: {
            select: {
              defaultAmberThresholdPct: true,
              defaultRedThresholdPct: true,
            },
          },
        },
      });
      if (!target || !configuration) {
        results.push({
          rowNumber: row.rowNumber,
          outcome: "SKIPPED",
          destinationTable: "kpi_actuals",
          destinationRecordId: null,
        });
        continue;
      }

      // Same service the submission API uses, so an imported actual and a
      // hand-entered one produce identical variance and RAG.
      const evaluation = performance.calculate({
        direction: configuration.definition.direction,
        targetValue: target.targetValue,
        actualValue: new Prisma.Decimal(payload.actualValue),
        minValue: target.minValue,
        maxValue: target.maxValue,
        amberThresholdPct:
          configuration.amberThresholdPct ??
          configuration.tenant.defaultAmberThresholdPct,
        redThresholdPct:
          configuration.redThresholdPct ??
          configuration.tenant.defaultRedThresholdPct,
      });

      const existing = await context.tx.kpiActual.findFirst({
        where: {
          tenantId: context.tenantId,
          kpiConfigurationId: configurationId,
          period: payload.period,
          deletedAt: null,
        },
        select: { id: true },
      });
      const shared = {
        // A revised workbook supersedes the target, so an existing actual is
        // re-pointed at the current version rather than left measuring against
        // a snapshot the register no longer shows.
        kpiTargetId: targetId,
        targetValueSnapshot: target.targetValue,
        actualValue: new Prisma.Decimal(payload.actualValue),
        variance: evaluation.variance,
        variancePercentage: evaluation.variancePercentage,
        ragStatus: evaluation.ragStatus,
        targetMet: evaluation.targetMet,
        comments: payload.comments,
        updatedById: context.actorUserId,
      };
      const actual = existing
        ? await context.tx.kpiActual.update({
            where: { id: existing.id },
            data: shared,
            select: { id: true },
          })
        : await context.tx.kpiActual.create({
            data: {
              ...shared,
              tenantId: context.tenantId,
              code: `ACT-${payload.code}-${payload.period.replace(/\s+/g, "")}`,
              kpiConfigurationId: configurationId,
              kpiTargetId: targetId,
              period: payload.period,
              periodStart: target.periodStart,
              periodEnd: target.periodEnd,
              approvalStatus: "APPROVED",
              submittedById: context.actorUserId,
              submittedAt: new Date(),
              // `kpi_actuals_no_self_approval` forbids the submitter from also
              // being the approver, and rightly so: the import actor did not
              // review this value. It was approved in the client's own process
              // before export, so the row is APPROVED with no platform
              // approver attached.
              approvedById: null,
              approvedAt: new Date(),
              createdById: context.actorUserId,
            },
            select: { id: true },
          });

      await synchroniseKpiRisk(context, {
        actualId: actual.id,
        configurationId,
        targetId,
        period: payload.period,
        kpiCode: configuration.definition.code,
        kpiName: configuration.definition.name,
        targetValue: target.targetValue.toString(),
        actualValue: payload.actualValue.toString(),
        variance: evaluation.variance.toString(),
        ragStatus: evaluation.ragStatus,
        riskClass: evaluation.recommendedRiskClass,
      });

      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "kpi_actuals",
        destinationRecordId: actual.id,
      });
    }
    return results;
  },
};
