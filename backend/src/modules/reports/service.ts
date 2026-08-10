import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { isFrameworkActiveInScope } from "../dashboard/framework-scope.js";
import { toCsv, type CsvColumn } from "../exports/csv.js";

/**
 * Tenant-scoped reports.
 *
 * Each report is one query family shared by the table view and the CSV, so a
 * downloaded file can never disagree with the screen it came from. Two
 * properties hold for every report here:
 *
 *  - `tenantId` comes from the authenticated token and is applied at the
 *    repository call, never from the request body;
 *  - rows are bounded. An unbounded report is both a denial-of-service surface
 *    and a way to walk a whole company's data out of the product in one click.
 *
 * Scheduling and email delivery remain absent. PDF board-pack export is
 * available alongside CSV (same rows, different packaging).
 */
export const REPORT_ROW_LIMIT = 5_000;

const DAY_MS = 86_400_000;

const decimal = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / DAY_MS);

/** Rows created after the as-of instant are excluded from snapshot reports. */
const asOfCreated = (filters: ReportFilters) =>
  filters.asOf ? { createdAt: { lte: filters.asOf } } : {};

/** Age buckets shared by the Evidence and CAPA aging reports. */
export const AGING_BUCKETS = [
  { key: "D_0_30", label: "0–30 days", min: 0, max: 30 },
  { key: "D_31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "D_61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "D_90_PLUS", label: "Over 90 days", min: 91, max: null },
] as const;

export const agingBucket = (days: number) => {
  if (days <= 30) return "D_0_30";
  if (days <= 60) return "D_31_60";
  if (days <= 90) return "D_61_90";
  return "D_90_PLUS";
};

export interface ReportFilters {
  readonly from?: Date;
  readonly to?: Date;
  /**
   * Point-in-time bound: only rows whose governing timestamps are on or before
   * this instant are included. Derived from live tables + audit timestamps
   * rather than a separate snapshot table — the audit trail is already
   * append-only, and a second snapshot store would drift from it.
   */
  readonly asOf?: Date;
  readonly frameworkId?: string;
  readonly departmentId?: string;
  readonly status?: string;
  readonly severity?: string;
  readonly priority?: string;
  readonly period?: string;
  readonly registerCode?: string;
}

/** Every report this release supports, with the permissions each one needs. */
export const REPORT_CATALOGUE = [
  {
    key: "kpi-target-actual",
    name: "KPI target versus actual",
    description:
      "Every measured KPI actual against the target snapshot it was judged on.",
    permissions: ["kpis:read"],
    filters: ["period", "departmentId", "from", "to", "asOf"],
  },
  {
    key: "kpi-variance",
    name: "KPI variance and achievement",
    description:
      "Achievement rate and variance by reporting period, derived from the actuals.",
    permissions: ["kpis:read"],
    filters: ["period", "departmentId", "asOf"],
  },
  {
    key: "framework-compliance",
    name: "Framework compliance",
    description:
      "Mapped and implemented Controls, rules and open Gaps per framework.",
    permissions: ["frameworks:read", "controls:read"],
    filters: ["frameworkId", "asOf"],
  },
  {
    key: "evidence-status",
    name: "Evidence status and aging",
    description:
      "Evidence lifecycle distribution and how long records have been waiting.",
    permissions: ["evidence:read"],
    filters: ["status", "departmentId", "asOf"],
  },
  {
    key: "risks",
    name: "Risks",
    description:
      "The Risk register with inherent and residual scoring and treatment state.",
    permissions: ["risk:read"],
    filters: ["status", "asOf"],
  },
  {
    key: "gaps",
    name: "Gaps",
    description: "The Gap register with severity, framework and due state.",
    permissions: ["gaps:read"],
    filters: ["status", "severity", "frameworkId", "departmentId", "asOf"],
  },
  {
    key: "capa-aging",
    name: "CAPA aging and overdue",
    description:
      "Open corrective actions by age against their recorded due date.",
    permissions: ["capa:read"],
    filters: ["status", "priority", "departmentId", "asOf"],
  },
  {
    key: "policy-review",
    name: "Policy review schedule",
    description:
      "Approved Policy Versions and the review date recorded against them.",
    permissions: ["policies:read"],
    filters: ["from", "to", "asOf"],
  },
  {
    key: "audit-activity",
    name: "Audit activity",
    description: "Governed activity from the append-only audit trail.",
    permissions: ["audit:read"],
    filters: ["from", "to", "asOf"],
  },
  {
    key: "operational-registers",
    name: "Operational Registers",
    description:
      "Record counts and imported rows across this Company's active registers.",
    permissions: ["registers:read"],
    filters: ["registerCode", "asOf"],
  },
] as const;

export type ReportKey = (typeof REPORT_CATALOGUE)[number]["key"];

export const isReportKey = (value: string): value is ReportKey =>
  REPORT_CATALOGUE.some((report) => report.key === value);

interface ReportResult {
  readonly key: ReportKey;
  readonly name: string;
  readonly generatedAt: Date;
  readonly filters: Record<string, string | null>;
  readonly columns: Array<{ key: string; header: string; numeric?: boolean }>;
  readonly rows: Array<Record<string, unknown>>;
  /** Optional chart payload; the UI draws a table when this is absent. */
  readonly chart?: {
    kind: "bars" | "donut" | "grouped-bars";
    series: Array<{ label: string; value: number | null; caption?: string }>;
    valueSuffix?: string;
  };
  readonly rowLimit: number;
  readonly truncated: boolean;
  readonly summary: Array<{ label: string; value: string }>;
}

export class ReportService {
  constructor(private readonly db: PrismaClient) {}

  catalogue() {
    return REPORT_CATALOGUE.map((report) => ({ ...report }));
  }

  async run(
    key: ReportKey,
    tenantId: string,
    filters: ReportFilters,
  ): Promise<ReportResult> {
    const now = new Date();
    switch (key) {
      case "kpi-target-actual":
        return this.kpiTargetActual(tenantId, filters, now);
      case "kpi-variance":
        return this.kpiVariance(tenantId, filters, now);
      case "framework-compliance":
        return this.frameworkCompliance(tenantId, filters, now);
      case "evidence-status":
        return this.evidenceStatus(tenantId, filters, now);
      case "risks":
        return this.risks(tenantId, filters, now);
      case "gaps":
        return this.gaps(tenantId, filters, now);
      case "capa-aging":
        return this.capaAging(tenantId, filters, now);
      case "policy-review":
        return this.policyReview(tenantId, filters, now);
      case "audit-activity":
        return this.auditActivity(tenantId, filters, now);
      case "operational-registers":
        return this.operationalRegisters(tenantId, filters, now);
      default:
        throw new AppError(404, "NOT_FOUND", "Unknown report");
    }
  }

  /**
   * CSV for a report, built from the same rows the table renders.
   *
   * `toCsv` neutralises any value a spreadsheet would evaluate, so a title
   * imported as `=cmd|...` reaches the file as text rather than as a formula.
   */
  async csv(key: ReportKey, tenantId: string, filters: ReportFilters) {
    const report = await this.run(key, tenantId, filters);
    const columns: CsvColumn<Record<string, unknown>>[] = report.columns.map(
      (column) => ({
        header: column.header,
        value: (row) => row[column.key],
      }),
    );
    return toCsv(columns, report.rows);
  }

  /**
   * PDF board pack for a report. Same permission model as CSV (`exports:read`
   * is required at the route) and the same row set as the on-screen table.
   */
  async pdf(key: ReportKey, tenantId: string, filters: ReportFilters) {
    const { buildReportPdf } = await import("./pdf.js");
    const report = await this.run(key, tenantId, filters);
    return buildReportPdf({
      title: report.name,
      subtitle: `Company report · ${key}`,
      generatedAt: report.generatedAt.toISOString(),
      ...(filters.asOf
        ? { asOf: filters.asOf.toISOString().slice(0, 10) }
        : {}),
      columns: report.columns.map((column) => ({
        key: column.key,
        header: column.header,
      })),
      rows: report.rows.map((row) => {
        const out: Record<string, string | number | null | undefined> = {};
        for (const column of report.columns) {
          const value = row[column.key];
          out[column.key] =
            value == null
              ? null
              : typeof value === "string" || typeof value === "number"
                ? value
                : String(value);
        }
        return out;
      }),
    });
  }

  private meta(
    key: ReportKey,
    filters: ReportFilters,
    now: Date,
  ): Pick<ReportResult, "key" | "name" | "generatedAt" | "filters"> {
    const definition = REPORT_CATALOGUE.find((report) => report.key === key)!;
    return {
      key,
      name: definition.name,
      generatedAt: now,
      filters: {
        from: dateOnly(filters.from ?? null),
        to: dateOnly(filters.to ?? null),
        asOf: dateOnly(filters.asOf ?? null),
        frameworkId: filters.frameworkId ?? null,
        departmentId: filters.departmentId ?? null,
        status: filters.status ?? null,
        severity: filters.severity ?? null,
        priority: filters.priority ?? null,
        period: filters.period ?? null,
        registerCode: filters.registerCode ?? null,
      },
    };
  }

  private async kpiTargetActual(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const rows = await this.db.kpiActual.findMany({
      where: {
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
          deletedAt: null,
          ...(filters.departmentId
            ? { departmentId: filters.departmentId }
            : {}),
        },
      },
      select: {
        code: true,
        period: true,
        periodStart: true,
        targetValueSnapshot: true,
        actualValue: true,
        variance: true,
        variancePercentage: true,
        ragStatus: true,
        targetMet: true,
        approvalStatus: true,
        configuration: {
          select: {
            definition: { select: { code: true, name: true, unit: true } },
            owner: { select: { fullName: true } },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ periodStart: "desc" }, { code: "asc" }],
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = rows.length > REPORT_ROW_LIMIT;
    const page = rows.slice(0, REPORT_ROW_LIMIT);
    const met = page.filter((row) => row.targetMet).length;
    return {
      ...this.meta("kpi-target-actual", filters, now),
      columns: [
        { key: "actualCode", header: "Actual Code" },
        { key: "kpiCode", header: "KPI Code" },
        { key: "kpiName", header: "KPI" },
        { key: "period", header: "Period" },
        { key: "unit", header: "Unit" },
        { key: "target", header: "Target", numeric: true },
        { key: "actual", header: "Actual", numeric: true },
        { key: "variance", header: "Variance", numeric: true },
        { key: "variancePercentage", header: "Variance %", numeric: true },
        { key: "rag", header: "RAG" },
        { key: "targetMet", header: "Target Met" },
        { key: "approvalStatus", header: "Approval" },
        { key: "owner", header: "Owner" },
        { key: "department", header: "Department" },
      ],
      rows: page.map((row) => ({
        actualCode: row.code,
        kpiCode: row.configuration.definition.code,
        kpiName: row.configuration.definition.name,
        period: row.period,
        unit: row.configuration.definition.unit,
        target: decimal(row.targetValueSnapshot),
        actual: decimal(row.actualValue),
        variance: decimal(row.variance),
        variancePercentage: decimal(row.variancePercentage),
        rag: row.ragStatus ?? "",
        targetMet: row.targetMet ? "Yes" : "No",
        approvalStatus: row.approvalStatus,
        owner: row.configuration.owner?.fullName ?? "",
        department: row.configuration.department?.name ?? "",
      })),
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Actuals in scope", value: String(page.length) },
        { label: "Target met", value: String(met) },
        { label: "Target missed", value: String(page.length - met) },
      ],
    };
  }

  private async kpiVariance(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const where: Prisma.KpiActualWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.period ? { period: filters.period } : {}),
      configuration: {
        deletedAt: null,
        enabled: true,
        status: "ACTIVE",
        definition: { direction: { not: "INFORMATIONAL" } },
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
      },
    };
    const [totals, met] = await Promise.all([
      this.db.kpiActual.groupBy({
        by: ["period"],
        where,
        _count: { _all: true },
        _avg: { variancePercentage: true },
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
    const rows = totals
      .map((row) => {
        const measured = row._count._all;
        const meeting = metByPeriod.get(row.period) ?? 0;
        return {
          period: row.period,
          periodStart: dateOnly(row._min.periodStart),
          measured,
          meetingTarget: meeting,
          missingTarget: measured - meeting,
          achievementRate:
            measured === 0
              ? null
              : Math.round((meeting / measured) * 1000) / 10,
          averageVariancePercentage:
            decimal(row._avg.variancePercentage) === null
              ? null
              : Math.round(decimal(row._avg.variancePercentage)! * 100) / 100,
        };
      })
      .sort((a, b) =>
        (a.periodStart ?? "").localeCompare(b.periodStart ?? "") ||
        a.period.localeCompare(b.period),
      );
    return {
      ...this.meta("kpi-variance", filters, now),
      columns: [
        { key: "period", header: "Period" },
        { key: "periodStart", header: "Period Start" },
        { key: "measured", header: "Measured", numeric: true },
        { key: "meetingTarget", header: "Meeting Target", numeric: true },
        { key: "missingTarget", header: "Missing Target", numeric: true },
        { key: "achievementRate", header: "Achievement %", numeric: true },
        {
          key: "averageVariancePercentage",
          header: "Avg Variance %",
          numeric: true,
        },
      ],
      rows,
      chart: {
        kind: "bars",
        valueSuffix: "%",
        series: rows.map((row) => ({
          label: row.period,
          value: row.achievementRate,
          caption: `${row.meetingTarget} of ${row.measured} met target`,
        })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated: false,
      summary: [
        { label: "Reporting periods", value: String(rows.length) },
        {
          label: "Measured actuals",
          value: String(rows.reduce((sum, row) => sum + row.measured, 0)),
        },
      ],
    };
  }

  private async frameworkCompliance(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
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
    const ids = inScopeFrameworks.map((framework) => framework.id);
    const controlScope: Prisma.ControlFrameworkWhereInput = {
      tenantId,
      frameworkId: { in: ids },
      control: { archivedAt: null, lifecycleStatus: "ACTIVE" },
    };
    const [mapped, implemented, openGaps, policies] =
      ids.length === 0
        ? [[], [], [], []]
        : await Promise.all([
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
                frameworkId: { in: ids },
              },
              _count: { _all: true },
            }),
            this.db.policyFramework.groupBy({
              by: ["frameworkId"],
              where: { tenantId, frameworkId: { in: ids } },
              _count: { _all: true },
            }),
          ]);
    const count = (
      groups: Array<{ frameworkId: string | null; _count: { _all: number } }>,
      id: string,
    ) => groups.find((group) => group.frameworkId === id)?._count._all ?? 0;
    const rows = inScopeFrameworks.map((framework) => {
      const mappedControls = count(mapped, framework.id);
      const implementedControls = count(implemented, framework.id);
      return {
        code: framework.code,
        name: framework.name,
        version: framework.version,
        scopeStatus: framework.scopeStatus ?? "",
        rules: framework._count.rules,
        mappedControls,
        implementedControls,
        // Null, not zero: a framework with no mapped Control has not been
        // assessed, which is a different statement from scoring 0%.
        compliancePercentage:
          mappedControls === 0
            ? null
            : Math.round((implementedControls / mappedControls) * 1000) / 10,
        mappedPolicies: count(policies, framework.id),
        openGaps: count(openGaps, framework.id),
      };
    });
    return {
      ...this.meta("framework-compliance", filters, now),
      columns: [
        { key: "code", header: "Framework" },
        { key: "version", header: "Version" },
        { key: "name", header: "Name" },
        { key: "scopeStatus", header: "Scope Status" },
        { key: "rules", header: "Rules", numeric: true },
        { key: "mappedControls", header: "Mapped Controls", numeric: true },
        { key: "implementedControls", header: "Implemented", numeric: true },
        { key: "compliancePercentage", header: "Compliance %", numeric: true },
        { key: "mappedPolicies", header: "Mapped Policies", numeric: true },
        { key: "openGaps", header: "Open Gaps", numeric: true },
      ],
      rows,
      chart: {
        kind: "bars",
        valueSuffix: "%",
        series: rows.map((row) => ({
          label: `${row.code} ${row.version}`,
          value: row.compliancePercentage,
          caption: `${row.implementedControls} of ${row.mappedControls} mapped controls implemented`,
        })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated: false,
      summary: [
        { label: "Frameworks in scope", value: String(rows.length) },
        {
          label: "Without a mapped Control",
          value: String(
            rows.filter((row) => row.compliancePercentage === null).length,
          ),
        },
      ],
    };
  }

  private async evidenceStatus(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const where: Prisma.EvidenceWhereInput = {
      tenantId,
      ...(filters.status
        ? { lifecycleStatus: filters.status as never }
        : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    };
    const records = await this.db.evidence.findMany({
      where,
      select: {
        code: true,
        title: true,
        lifecycleStatus: true,
        createdAt: true,
        submittedAt: true,
        reviewedAt: true,
        expiresAt: true,
        storageKey: true,
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = records.length > REPORT_ROW_LIMIT;
    const page = records.slice(0, REPORT_ROW_LIMIT);
    const rows = page.map((record) => {
      const ageDays = daysBetween(record.createdAt, now);
      return {
        code: record.code,
        title: record.title,
        lifecycleStatus: record.lifecycleStatus,
        owner: record.owner?.fullName ?? "",
        department: record.department?.name ?? "",
        created: dateOnly(record.createdAt),
        submitted: dateOnly(record.submittedAt),
        reviewed: dateOnly(record.reviewedAt),
        expires: dateOnly(record.expiresAt),
        // Only a stored object proves this platform holds the bytes. An
        // imported file path is a claim made by a spreadsheet.
        fileHeld: record.storageKey === null ? "No" : "Yes",
        ageDays,
        ageBucket:
          AGING_BUCKETS.find((bucket) => bucket.key === agingBucket(ageDays))
            ?.label ?? "",
      };
    });
    const statusCounts = new Map<string, number>();
    for (const row of rows) {
      statusCounts.set(
        row.lifecycleStatus,
        (statusCounts.get(row.lifecycleStatus) ?? 0) + 1,
      );
    }
    return {
      ...this.meta("evidence-status", filters, now),
      columns: [
        { key: "code", header: "Evidence Code" },
        { key: "title", header: "Title" },
        { key: "lifecycleStatus", header: "Status" },
        { key: "owner", header: "Owner" },
        { key: "department", header: "Department" },
        { key: "created", header: "Created" },
        { key: "submitted", header: "Submitted" },
        { key: "reviewed", header: "Reviewed" },
        { key: "expires", header: "Expires" },
        { key: "fileHeld", header: "File Held" },
        { key: "ageDays", header: "Age (days)", numeric: true },
        { key: "ageBucket", header: "Age Bucket" },
      ],
      rows,
      chart: {
        kind: "donut",
        series: [...statusCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Evidence records", value: String(rows.length) },
        {
          label: "Without a stored file",
          value: String(rows.filter((row) => row.fileHeld === "No").length),
        },
      ],
    };
  }

  private async risks(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const records = await this.db.risk.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...asOfCreated(filters),
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      select: {
        code: true,
        title: true,
        category: true,
        status: true,
        kpiRiskClass: true,
        generalLevel: true,
        inherentLikelihood: true,
        inherentImpact: true,
        inherentScore: true,
        residualScore: true,
        treatmentStrategy: true,
        reviewDate: true,
        createdAt: true,
        owner: { select: { fullName: true } },
      },
      orderBy: [{ inherentScore: "desc" }, { code: "asc" }],
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = records.length > REPORT_ROW_LIMIT;
    const page = records.slice(0, REPORT_ROW_LIMIT);
    return {
      ...this.meta("risks", filters, now),
      columns: [
        { key: "code", header: "Risk Code" },
        { key: "title", header: "Title" },
        { key: "category", header: "Category" },
        { key: "status", header: "Status" },
        { key: "kpiRiskClass", header: "KPI Risk Class" },
        { key: "generalLevel", header: "General Level" },
        { key: "likelihood", header: "Likelihood", numeric: true },
        { key: "impact", header: "Impact", numeric: true },
        { key: "inherentScore", header: "Inherent Score", numeric: true },
        { key: "residualScore", header: "Residual Score", numeric: true },
        { key: "treatmentStrategy", header: "Treatment" },
        { key: "owner", header: "Owner" },
        { key: "reviewDate", header: "Review Date" },
      ],
      rows: page.map((risk) => ({
        code: risk.code,
        title: risk.title,
        category: risk.category ?? "",
        status: risk.status,
        kpiRiskClass: risk.kpiRiskClass ?? "Enterprise",
        generalLevel: risk.generalLevel ?? "",
        likelihood: risk.inherentLikelihood,
        impact: risk.inherentImpact,
        inherentScore: risk.inherentScore,
        residualScore: risk.residualScore,
        treatmentStrategy: risk.treatmentStrategy ?? "",
        owner: risk.owner?.fullName ?? "",
        reviewDate: dateOnly(risk.reviewDate),
      })),
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Risks in scope", value: String(page.length) },
        {
          label: "Open",
          value: String(
            page.filter(
              (risk) => risk.status !== "CLOSED" && risk.status !== "ARCHIVED",
            ).length,
          ),
        },
      ],
    };
  }

  private async gaps(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const records = await this.db.gap.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...asOfCreated(filters),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.severity ? { severity: filters.severity as never } : {}),
        ...(filters.frameworkId ? { frameworkId: filters.frameworkId } : {}),
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
      },
      select: {
        code: true,
        title: true,
        severity: true,
        status: true,
        clauseRef: true,
        identifiedOn: true,
        dueDate: true,
        closedAt: true,
        sourceOwnerRef: true,
        framework: { select: { code: true, version: true } },
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
        _count: { select: { capas: true } },
      },
      orderBy: [{ severity: "asc" }, { code: "asc" }],
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = records.length > REPORT_ROW_LIMIT;
    const page = records.slice(0, REPORT_ROW_LIMIT);
    const rows = page.map((gap) => ({
      code: gap.code,
      title: gap.title,
      severity: gap.severity,
      status: gap.status,
      framework: gap.framework ? `${gap.framework.code} ${gap.framework.version}` : "",
      clauseRef: gap.clauseRef ?? "",
      owner: gap.owner?.fullName ?? gap.sourceOwnerRef ?? "",
      department: gap.department?.name ?? "",
      identifiedOn: dateOnly(gap.identifiedOn),
      dueDate: dateOnly(gap.dueDate),
      overdue:
        gap.dueDate !== null &&
        gap.dueDate < now &&
        gap.status !== "CLOSED" &&
        gap.status !== "CANCELLED"
          ? "Yes"
          : "No",
      linkedCapas: gap._count.capas,
    }));
    const bySeverity = new Map<string, number>();
    for (const row of rows) {
      bySeverity.set(row.severity, (bySeverity.get(row.severity) ?? 0) + 1);
    }
    return {
      ...this.meta("gaps", filters, now),
      columns: [
        { key: "code", header: "Gap Code" },
        { key: "title", header: "Title" },
        { key: "severity", header: "Severity" },
        { key: "status", header: "Status" },
        { key: "framework", header: "Framework" },
        { key: "clauseRef", header: "Clause" },
        { key: "owner", header: "Owner" },
        { key: "department", header: "Department" },
        { key: "identifiedOn", header: "Identified" },
        { key: "dueDate", header: "Due" },
        { key: "overdue", header: "Overdue" },
        { key: "linkedCapas", header: "Linked CAPAs", numeric: true },
      ],
      rows,
      chart: {
        kind: "bars",
        series: [...bySeverity.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Gaps in scope", value: String(rows.length) },
        {
          label: "Overdue",
          value: String(rows.filter((row) => row.overdue === "Yes").length),
        },
      ],
    };
  }

  private async capaAging(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const records = await this.db.capa.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.status
          ? { status: filters.status as never }
          : { status: { notIn: ["CLOSED", "CANCELLED"] } }),
        ...(filters.priority ? { priority: filters.priority as never } : {}),
        ...(filters.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
      },
      select: {
        code: true,
        title: true,
        priority: true,
        status: true,
        raisedOn: true,
        dueDate: true,
        completionPercentage: true,
        createdAt: true,
        sourceOwnerRef: true,
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
        gap: { select: { code: true } },
      },
      orderBy: [{ dueDate: "asc" }, { code: "asc" }],
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = records.length > REPORT_ROW_LIMIT;
    const page = records.slice(0, REPORT_ROW_LIMIT);
    const rows = page.map((capa) => {
      const ageDays = daysBetween(capa.raisedOn ?? capa.createdAt, now);
      const daysOverdue =
        capa.dueDate === null ? null : daysBetween(capa.dueDate, now);
      return {
        code: capa.code,
        title: capa.title,
        priority: capa.priority,
        status: capa.status,
        gap: capa.gap?.code ?? "",
        owner: capa.owner?.fullName ?? capa.sourceOwnerRef ?? "",
        department: capa.department?.name ?? "",
        raisedOn: dateOnly(capa.raisedOn ?? capa.createdAt),
        dueDate: dateOnly(capa.dueDate),
        completionPercentage: capa.completionPercentage,
        ageDays,
        ageBucket:
          AGING_BUCKETS.find((bucket) => bucket.key === agingBucket(ageDays))
            ?.label ?? "",
        daysOverdue: daysOverdue !== null && daysOverdue > 0 ? daysOverdue : 0,
        overdue: daysOverdue !== null && daysOverdue > 0 ? "Yes" : "No",
      };
    });
    const byBucket = new Map<string, number>(
      AGING_BUCKETS.map((bucket) => [bucket.label, 0]),
    );
    for (const row of rows) {
      byBucket.set(row.ageBucket, (byBucket.get(row.ageBucket) ?? 0) + 1);
    }
    return {
      ...this.meta("capa-aging", filters, now),
      columns: [
        { key: "code", header: "CAPA Code" },
        { key: "title", header: "Title" },
        { key: "priority", header: "Priority" },
        { key: "status", header: "Status" },
        { key: "gap", header: "Source Gap" },
        { key: "owner", header: "Owner" },
        { key: "department", header: "Department" },
        { key: "raisedOn", header: "Raised" },
        { key: "dueDate", header: "Due" },
        {
          key: "completionPercentage",
          header: "Completion %",
          numeric: true,
        },
        { key: "ageDays", header: "Age (days)", numeric: true },
        { key: "ageBucket", header: "Age Bucket" },
        { key: "daysOverdue", header: "Days Overdue", numeric: true },
        { key: "overdue", header: "Overdue" },
      ],
      rows,
      chart: {
        kind: "bars",
        series: [...byBucket.entries()].map(([label, value]) => ({
          label,
          value,
        })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "CAPAs in scope", value: String(rows.length) },
        {
          label: "Overdue",
          value: String(rows.filter((row) => row.overdue === "Yes").length),
        },
      ],
    };
  }

  private async policyReview(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const versions = await this.db.policyVersion.findMany({
      where: {
        tenantId,
        status: "APPROVED",
        policy: { archivedAt: null },
        ...(filters.from || filters.to
          ? {
              reviewDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      select: {
        versionMajor: true,
        versionMinor: true,
        effectiveDate: true,
        reviewDate: true,
        approvedAt: true,
        policy: {
          select: {
            code: true,
            title: true,
            lifecycleStatus: true,
            owner: { select: { fullName: true } },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ reviewDate: "asc" }],
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = versions.length > REPORT_ROW_LIMIT;
    const page = versions.slice(0, REPORT_ROW_LIMIT);
    const rows = page.map((version) => ({
      code: version.policy.code,
      title: version.policy.title,
      version: `${version.versionMajor}.${version.versionMinor}`,
      lifecycleStatus: version.policy.lifecycleStatus,
      owner: version.policy.owner?.fullName ?? "",
      department: version.policy.department?.name ?? "",
      effectiveDate: dateOnly(version.effectiveDate),
      reviewDate: dateOnly(version.reviewDate),
      approvedAt: dateOnly(version.approvedAt),
      reviewState:
        version.reviewDate === null
          ? "No review date recorded"
          : version.reviewDate < now
            ? "Overdue"
            : "Scheduled",
    }));
    return {
      ...this.meta("policy-review", filters, now),
      columns: [
        { key: "code", header: "Policy Code" },
        { key: "title", header: "Title" },
        { key: "version", header: "Version" },
        { key: "lifecycleStatus", header: "Lifecycle" },
        { key: "owner", header: "Owner" },
        { key: "department", header: "Department" },
        { key: "effectiveDate", header: "Effective" },
        { key: "reviewDate", header: "Review Date" },
        { key: "approvedAt", header: "Approved" },
        { key: "reviewState", header: "Review State" },
      ],
      rows,
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Approved Versions", value: String(rows.length) },
        {
          label: "Overdue for review",
          value: String(
            rows.filter((row) => row.reviewState === "Overdue").length,
          ),
        },
        {
          label: "No review date recorded",
          value: String(
            rows.filter((row) => row.reviewDate === null).length,
          ),
        },
      ],
    };
  }

  private async auditActivity(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const events = await this.db.auditEvent.findMany({
      where: {
        tenantId,
        ...(filters.from || filters.to || filters.asOf
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
                // asOf is the exclusive upper bound for snapshot reports.
                ...(filters.asOf ? { lte: filters.asOf } : {}),
              },
            }
          : {}),
      },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        source: true,
        createdAt: true,
        user: { select: { code: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: REPORT_ROW_LIMIT + 1,
    });
    const truncated = events.length > REPORT_ROW_LIMIT;
    const page = events.slice(0, REPORT_ROW_LIMIT);
    const byEntity = new Map<string, number>();
    for (const event of page) {
      byEntity.set(event.entityType, (byEntity.get(event.entityType) ?? 0) + 1);
    }
    return {
      ...this.meta("audit-activity", filters, now),
      columns: [
        { key: "at", header: "Recorded At" },
        { key: "action", header: "Action" },
        { key: "entityType", header: "Entity" },
        { key: "entityId", header: "Entity ID" },
        { key: "source", header: "Source" },
        { key: "actor", header: "Actor" },
      ],
      rows: page.map((event) => ({
        at: event.createdAt.toISOString(),
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? "",
        source: event.source,
        actor: event.user?.fullName ?? "System",
      })),
      chart: {
        kind: "bars",
        series: [...byEntity.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([label, value]) => ({ label, value })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated,
      summary: [
        { label: "Events in scope", value: String(page.length) },
        {
          label: "Recorded on this platform",
          value: String(page.filter((event) => event.source === "SYSTEM").length),
        },
      ],
    };
  }

  private async operationalRegisters(
    tenantId: string,
    filters: ReportFilters,
    now: Date,
  ): Promise<ReportResult> {
    const types = await this.db.operationalRegisterType.findMany({
      where: {
        tenantId,
        active: true,
        ...(filters.registerCode ? { code: filters.registerCode } : {}),
      },
      select: {
        code: true,
        name: true,
        _count: { select: { records: { where: { deletedAt: null } } } },
      },
      orderBy: { code: "asc" },
    });
    const rows = types.map((type) => ({
      code: type.code,
      name: type.name,
      recordCount: type._count.records,
    }));
    return {
      ...this.meta("operational-registers", filters, now),
      columns: [
        { key: "code", header: "Register Code" },
        { key: "name", header: "Register" },
        { key: "recordCount", header: "Records", numeric: true },
      ],
      rows,
      chart: {
        kind: "bars",
        series: rows.map((row) => ({ label: row.name, value: row.recordCount })),
      },
      rowLimit: REPORT_ROW_LIMIT,
      truncated: false,
      summary: [
        { label: "Active registers", value: String(rows.length) },
        {
          label: "Total records",
          value: String(rows.reduce((sum, row) => sum + row.recordCount, 0)),
        },
      ],
    };
  }
}
