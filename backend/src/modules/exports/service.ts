import type { PrismaClient } from "@prisma/client";
import { notFound } from "../../common/errors/app-error.js";
import { toCsv, type CsvColumn } from "./csv.js";

/**
 * CSV exports for the registers the demo shows.
 *
 * Every query is company-scoped from the authenticated token, and every export
 * is bounded: an unbounded export is a denial-of-service surface and a way to
 * quietly walk a whole tenant's data out of the product.
 */
export const EXPORT_ROW_LIMIT = 5_000;

const dateOnly = (value: Date | null) =>
  value === null ? null : value.toISOString().slice(0, 10);

export class ExportService {
  constructor(private readonly db: PrismaClient) {}

  async gaps(tenantId: string) {
    const rows = await this.db.gap.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        owner: { select: { code: true, fullName: true } },
        department: { select: { name: true } },
        framework: { select: { code: true, version: true } },
      },
      orderBy: { code: "asc" },
      take: EXPORT_ROW_LIMIT,
    });
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Gap Code", value: (row) => row.code },
      { header: "Title", value: (row) => row.title },
      { header: "Severity", value: (row) => row.severity },
      { header: "Status", value: (row) => row.status },
      { header: "Framework", value: (row) => row.framework?.code ?? "" },
      { header: "Clause", value: (row) => row.clauseRef },
      { header: "Owner", value: (row) => row.owner?.fullName ?? "" },
      { header: "Owner Reference", value: (row) => row.sourceOwnerRef },
      { header: "Department", value: (row) => row.department?.name ?? "" },
      { header: "Identified On", value: (row) => dateOnly(row.identifiedOn) },
      { header: "Due Date", value: (row) => dateOnly(row.dueDate) },
      { header: "Closed At", value: (row) => row.closedAt },
      { header: "Needs Review", value: (row) => row.needsReview },
      { header: "Description", value: (row) => row.description },
    ];
    return toCsv(columns, rows);
  }

  async capas(tenantId: string) {
    const rows = await this.db.capa.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
        gap: { select: { code: true } },
        framework: { select: { code: true } },
      },
      orderBy: { code: "asc" },
      take: EXPORT_ROW_LIMIT,
    });
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "CAPA Code", value: (row) => row.code },
      { header: "Title", value: (row) => row.title },
      { header: "Priority", value: (row) => row.priority },
      { header: "Status", value: (row) => row.status },
      { header: "Linked Gap", value: (row) => row.gap?.code ?? "" },
      { header: "Framework", value: (row) => row.framework?.code ?? "" },
      { header: "Root Cause", value: (row) => row.rootCause },
      { header: "Corrective Action", value: (row) => row.correctiveAction },
      { header: "Preventive Action", value: (row) => row.preventiveAction },
      { header: "Owner", value: (row) => row.owner?.fullName ?? "" },
      { header: "Owner Reference", value: (row) => row.sourceOwnerRef },
      { header: "Department", value: (row) => row.department?.name ?? "" },
      { header: "Raised On", value: (row) => dateOnly(row.raisedOn) },
      { header: "Due Date", value: (row) => dateOnly(row.dueDate) },
      { header: "Completion %", value: (row) => row.completionPercentage },
      { header: "Closed At", value: (row) => row.closedAt },
    ];
    return toCsv(columns, rows);
  }

  async kpiActuals(tenantId: string) {
    const rows = await this.db.kpiActual.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        configuration: {
          include: {
            definition: {
              select: {
                code: true,
                name: true,
                unit: true,
                direction: true,
                frequency: true,
              },
            },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ period: "asc" }, { code: "asc" }],
      take: EXPORT_ROW_LIMIT,
    });
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "KPI Code", value: (row) => row.configuration.definition.code },
      { header: "KPI Name", value: (row) => row.configuration.definition.name },
      { header: "Unit", value: (row) => row.configuration.definition.unit },
      {
        header: "Direction",
        value: (row) => row.configuration.definition.direction,
      },
      {
        header: "Frequency",
        value: (row) => row.configuration.definition.frequency,
      },
      { header: "Period", value: (row) => row.period },
      { header: "Target", value: (row) => row.targetValueSnapshot.toString() },
      { header: "Actual", value: (row) => row.actualValue.toString() },
      { header: "Variance", value: (row) => row.variance.toString() },
      {
        header: "Variance %",
        value: (row) => row.variancePercentage?.toString() ?? "",
      },
      { header: "RAG", value: (row) => row.ragStatus ?? "" },
      { header: "Target Met", value: (row) => row.targetMet },
      {
        header: "Department",
        value: (row) => row.configuration.department?.name ?? "",
      },
      { header: "Approval Status", value: (row) => row.approvalStatus },
    ];
    return toCsv(columns, rows);
  }

  async risks(tenantId: string) {
    const rows = await this.db.risk.findMany({
      where: { tenantId, deletedAt: null },
      include: { owner: { select: { fullName: true } } },
      orderBy: { code: "asc" },
      take: EXPORT_ROW_LIMIT,
    });
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Risk Code", value: (row) => row.code },
      { header: "Title", value: (row) => row.title },
      { header: "Category", value: (row) => row.category },
      { header: "Status", value: (row) => row.status },
      // The two scales stay in separate columns, as they are separate fields.
      { header: "KPI Risk Class", value: (row) => row.kpiRiskClass ?? "" },
      { header: "Enterprise Level", value: (row) => row.generalLevel ?? "" },
      { header: "Inherent Likelihood", value: (row) => row.inherentLikelihood },
      { header: "Inherent Impact", value: (row) => row.inherentImpact },
      { header: "Inherent Score", value: (row) => row.inherentScore },
      { header: "Residual Score", value: (row) => row.residualScore ?? "" },
      { header: "Treatment", value: (row) => row.treatmentStrategy ?? "" },
      { header: "Owner", value: (row) => row.owner?.fullName ?? "" },
      { header: "Review Date", value: (row) => dateOnly(row.reviewDate) },
      { header: "Description", value: (row) => row.description },
    ];
    return toCsv(columns, rows);
  }

  async evidence(tenantId: string) {
    const rows = await this.db.evidence.findMany({
      where: { tenantId },
      include: {
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
      },
      orderBy: { code: "asc" },
      take: EXPORT_ROW_LIMIT,
    });
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Evidence Code", value: (row) => row.code },
      { header: "Title", value: (row) => row.title },
      { header: "Lifecycle Status", value: (row) => row.lifecycleStatus },
      { header: "Owner", value: (row) => row.owner?.fullName ?? "" },
      { header: "Department", value: (row) => row.department?.name ?? "" },
      { header: "Issue Date", value: (row) => dateOnly(row.issueDate) },
      { header: "Expires At", value: (row) => dateOnly(row.expiresAt) },
      // Truthful file state: a stored key is the only proof of held bytes.
      { header: "File Held", value: (row) => row.storageKey !== null },
      {
        header: "Workbook File Reference",
        value: (row) => row.sourceFileReference,
      },
    ];
    return toCsv(columns, rows);
  }

  async registerRecords(tenantId: string, registerCode: string) {
    const type = await this.db.operationalRegisterType.findUnique({
      where: { tenantId_code: { tenantId, code: registerCode } },
      select: { id: true, code: true, fieldConfiguration: true },
    });
    if (!type) throw notFound("Operational register not found");
    const rows = await this.db.operationalRegisterRecord.findMany({
      where: { tenantId, registerTypeId: type.id, deletedAt: null },
      include: {
        owner: { select: { fullName: true } },
        department: { select: { name: true } },
      },
      orderBy: { businessRecordCode: "asc" },
      take: EXPORT_ROW_LIMIT,
    });
    // The register's own columns come from its field configuration, so an
    // export mirrors the source sheet rather than a fixed shape.
    const fields = Array.isArray(type.fieldConfiguration)
      ? (type.fieldConfiguration as { key?: unknown; label?: unknown }[])
          .map((field) => String(field.label ?? field.key ?? ""))
          .filter((label) => label.length > 0)
      : [];
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Record Code", value: (row) => row.businessRecordCode },
      { header: "Title", value: (row) => row.title },
      { header: "Status", value: (row) => row.status },
      { header: "Owner", value: (row) => row.owner?.fullName ?? "" },
      { header: "Owner Reference", value: (row) => row.sourceOwnerRef },
      { header: "Department", value: (row) => row.department?.name ?? "" },
      { header: "Record Date", value: (row) => dateOnly(row.recordDate) },
      { header: "Due Date", value: (row) => dateOnly(row.dueDate) },
      ...fields.map((label) => ({
        header: label,
        value: (row: (typeof rows)[number]) =>
          (row.payload as Record<string, unknown>)?.[label] ?? "",
      })),
    ];
    return toCsv(columns, rows);
  }
}
