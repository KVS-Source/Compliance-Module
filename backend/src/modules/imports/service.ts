import { createHash } from "node:crypto";
import type { ImportBatchStatus, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { FrameworkResolver } from "./framework-resolver.js";
import {
  IMPORT_ORDER,
  SHEET_PLANS,
  planForKey,
  planForSheet,
  type SheetPlan,
} from "./sheet-plan.js";
import { SheetTable } from "./sheet-table.js";
import {
  type CommitResult,
  type ImportContext,
  type SheetImporter,
  type SheetValidation,
  type ValidatedRow,
} from "./types.js";
import {
  WorkbookFormatError,
  parseWorkbook,
  type ParsedWorkbook,
} from "./xlsx/workbook-reader.js";
import {
  frameworksImporter,
  frameworkRulesImporter,
  organisationImporter,
} from "./importers/masters.js";
import { evidenceImporter, policyImporter } from "./importers/governance.js";
import {
  kpiActualImporter,
  kpiConfigurationImporter,
  kpiDefinitionImporter,
} from "./importers/kpis.js";
import {
  capaImporter,
  gapImporter,
  riskImporter,
} from "./importers/risk-gap-capa.js";
import { auditTrailImporter, registerImporter } from "./importers/registers.js";

/** Upper bound for an accepted workbook, matching the documented API limit. */
export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

const NORMALISED_IMPORTERS: Record<string, SheetImporter> = {
  company: organisationImporter,
  frameworks: frameworksImporter,
  framework_checkpoints: frameworkRulesImporter,
  policies: policyImporter,
  evidence: evidenceImporter,
  kpi_master: kpiDefinitionImporter,
  kpi_config: kpiConfigurationImporter,
  kpi_actuals: kpiActualImporter,
  risks: riskImporter,
  gaps: gapImporter,
  capas: capaImporter,
  audit_trail: auditTrailImporter,
};

const importerFor = (plan: SheetPlan) =>
  plan.target === "register"
    ? registerImporter
    : NORMALISED_IMPORTERS[plan.key];

export interface SheetSummary {
  readonly key: string;
  readonly sheetName: string;
  readonly target: SheetPlan["target"];
  readonly present: boolean;
  readonly totalRows: number;
  readonly validRows: number;
  readonly errorRows: number;
  readonly flaggedRows: number;
  readonly missingHeaders: readonly string[];
  readonly reason?: string;
}

export interface RowIssue {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly businessKey: string | null;
  readonly field: string;
  readonly message: string;
}

export interface PreviewReport {
  readonly workbook: {
    readonly filename: string;
    readonly checksum: string;
    readonly byteSize: number;
    readonly sheetCount: number;
  };
  readonly sheets: readonly SheetSummary[];
  /** Sheets present in the file that the mapping does not recognise. */
  readonly unmappedSheets: readonly string[];
  readonly issues: readonly RowIssue[];
  readonly totals: {
    readonly totalRows: number;
    readonly validRows: number;
    readonly errorRows: number;
    readonly flaggedRows: number;
  };
}

export interface CommitReport extends PreviewReport {
  readonly batchId: string;
  readonly status: ImportBatchStatus;
  readonly alreadyImported: boolean;
  readonly counts: {
    readonly created: number;
    readonly updated: number;
    readonly unchanged: number;
    readonly skipped: number;
    readonly errors: number;
  };
  readonly perSheetOutcomes: readonly {
    readonly sheet: string;
    readonly created: number;
    readonly updated: number;
    readonly unchanged: number;
    readonly skipped: number;
  }[];
}

export const workbookChecksum = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

/**
 * Runs the mapping over a parsed workbook without touching the database.
 * Shared by preview and commit so a committed row is always a row the preview
 * already validated.
 */
const validateWorkbook = (workbook: ParsedWorkbook) => {
  const validations = new Map<string, SheetValidation>();
  const recognised = new Set<string>();

  for (const plan of SHEET_PLANS) {
    const sheet = workbook.sheets.find(
      (candidate) => planForSheet(candidate.name)?.key === plan.key,
    );
    if (!sheet) {
      validations.set(plan.key, {
        key: plan.key,
        sheetName: plan.sheetName,
        present: false,
        target: plan.target,
        missingHeaders: [],
        rows: [],
        validCount: 0,
        errorCount: 0,
        ...(plan.derivedReason ? { derivedReason: plan.derivedReason } : {}),
      });
      continue;
    }
    recognised.add(sheet.name);
    if (plan.target === "derived") {
      validations.set(plan.key, {
        key: plan.key,
        sheetName: sheet.name,
        present: true,
        target: plan.target,
        missingHeaders: [],
        rows: [],
        validCount: 0,
        errorCount: 0,
        ...(plan.derivedReason ? { derivedReason: plan.derivedReason } : {}),
      });
      continue;
    }

    const table = SheetTable.from(sheet, plan.headerRow);
    const missingHeaders = table.missingHeaders(plan.requiredHeaders);
    if (missingHeaders.length > 0) {
      // A sheet missing a required column is refused wholesale rather than
      // imported with silently absent values.
      validations.set(plan.key, {
        key: plan.key,
        sheetName: sheet.name,
        present: true,
        target: plan.target,
        missingHeaders,
        rows: [],
        validCount: 0,
        errorCount: 0,
      });
      continue;
    }
    const importer = importerFor(plan);
    const rows = importer ? importer.validate(table, plan) : [];
    validations.set(plan.key, {
      key: plan.key,
      sheetName: sheet.name,
      present: true,
      target: plan.target,
      missingHeaders: [],
      rows,
      validCount: rows.filter((row) => row.errors.length === 0).length,
      errorCount: rows.filter((row) => row.errors.length > 0).length,
    });
  }

  const unmappedSheets = workbook.sheets
    .filter((sheet) => !recognised.has(sheet.name))
    .map((sheet) => sheet.name);
  return { validations, unmappedSheets };
};

const buildPreview = (
  filename: string,
  buffer: Buffer,
  workbook: ParsedWorkbook,
  validations: Map<string, SheetValidation>,
  unmappedSheets: readonly string[],
): PreviewReport => {
  const sheets: SheetSummary[] = [];
  const issues: RowIssue[] = [];
  let totalRows = 0;
  let validRows = 0;
  let errorRows = 0;
  let flaggedRows = 0;

  for (const plan of SHEET_PLANS) {
    const validation = validations.get(plan.key);
    if (!validation) continue;
    const flagged = validation.rows.filter(
      (row) => row.reviewReason !== undefined,
    ).length;
    sheets.push({
      key: plan.key,
      sheetName: validation.sheetName,
      target: plan.target,
      present: validation.present,
      totalRows: validation.rows.length,
      validRows: validation.validCount,
      errorRows: validation.errorCount,
      flaggedRows: flagged,
      missingHeaders: validation.missingHeaders,
      ...(validation.derivedReason ? { reason: validation.derivedReason } : {}),
    });
    totalRows += validation.rows.length;
    validRows += validation.validCount;
    errorRows += validation.errorCount;
    flaggedRows += flagged;
    for (const row of validation.rows) {
      for (const error of row.errors) {
        issues.push({
          sheet: validation.sheetName,
          rowNumber: row.rowNumber,
          businessKey: row.businessKey,
          field: error.field,
          message: error.message,
        });
      }
    }
  }

  return {
    workbook: {
      filename,
      checksum: workbookChecksum(buffer),
      byteSize: buffer.length,
      sheetCount: workbook.sheets.length,
    },
    sheets,
    unmappedSheets,
    issues,
    totals: { totalRows, validRows, errorRows, flaggedRows },
  };
};

const workbookRejected = (message: string) =>
  new AppError(400, "WORKBOOK_INVALID", message);

const readWorkbook = (buffer: Buffer) => {
  if (buffer.length === 0) throw workbookRejected("Workbook file is empty");
  if (buffer.length > MAX_WORKBOOK_BYTES) {
    throw workbookRejected(
      `Workbook exceeds the ${MAX_WORKBOOK_BYTES / (1024 * 1024)} MB limit`,
    );
  }
  try {
    return parseWorkbook(buffer);
  } catch (error) {
    if (error instanceof WorkbookFormatError) {
      throw workbookRejected(error.message);
    }
    throw error;
  }
};

export class WorkbookImportService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Reads and validates a workbook. Compliance-domain tables are never
   * written, so a preview is safe to run against production data.
   */
  preview(filename: string, buffer: Buffer): PreviewReport {
    const workbook = readWorkbook(buffer);
    const { validations, unmappedSheets } = validateWorkbook(workbook);
    return buildPreview(
      filename,
      buffer,
      workbook,
      validations,
      unmappedSheets,
    );
  }

  /**
   * Validates and writes a workbook in one transaction.
   *
   * Idempotency has two layers. The file checksum makes a byte-identical
   * workbook return the original batch untouched. Company-scoped business keys
   * make a *revised* workbook update the records it already created, so a
   * corrected spreadsheet never duplicates a register.
   */
  async commit(
    tenantId: string,
    actorUserId: string,
    filename: string,
    buffer: Buffer,
    options: { readonly idempotencyKey?: string } = {},
  ): Promise<CommitReport> {
    const workbook = readWorkbook(buffer);
    const checksum = workbookChecksum(buffer);
    const idempotencyKey = options.idempotencyKey ?? checksum;

    const previous = await this.db.importBatch.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: { id: true, status: true, report: true },
    });
    if (previous && previous.status !== "FAILED") {
      // An identical workbook returns the recorded result instead of writing
      // a second set of records.
      return {
        ...(previous.report as unknown as CommitReport),
        batchId: previous.id,
        status: previous.status,
        alreadyImported: true,
      };
    }

    const { validations, unmappedSheets } = validateWorkbook(workbook);
    const preview = buildPreview(
      filename,
      buffer,
      workbook,
      validations,
      unmappedSheets,
    );

    const batch = await this.db.importBatch.upsert({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      update: {
        status: "COMMITTING",
        startedAt: new Date(),
        completedAt: null,
        originalFilename: filename,
        fileChecksum: checksum,
        uploadedById: actorUserId,
      },
      create: {
        tenantId,
        originalFilename: filename,
        fileChecksum: checksum,
        idempotencyKey,
        status: "COMMITTING",
        uploadedById: actorUserId,
      },
      select: { id: true },
    });

    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
    const perSheetOutcomes: {
      sheet: string;
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
    }[] = [];

    try {
      await this.db.$transaction(
        async (tx) => {
          const context: ImportContext = {
            tx,
            tenantId,
            actorUserId,
            batchId: batch.id,
            frameworks: new FrameworkResolver(),
            frameworkRules: new Map(),
            departments: new Map(),
            kpiDefinitions: new Map(),
            kpiConfigurations: new Map(),
            kpiTargets: new Map(),
            kpiBaseTargets: new Map(),
            evidence: new Map(),
            gaps: new Map(),
            registerTypes: new Map(),
          };
          await this.primeContext(context);
          await this.ensureRegisterTypes(context, validations);
          await tx.importBatchRow.deleteMany({
            where: { tenantId, batchId: batch.id },
          });

          for (const key of IMPORT_ORDER) {
            const plan = planForKey(key);
            const validation = validations.get(key);
            if (!plan || !validation || !validation.present) continue;
            const importer = importerFor(plan);
            if (!importer) continue;

            const valid = validation.rows.filter(
              (row) => row.errors.length === 0,
            );
            const results = await importer.commit(valid, context, plan);
            const byRow = new Map(
              results.map((result) => [result.rowNumber, result]),
            );
            const sheetCounts = {
              created: 0,
              updated: 0,
              unchanged: 0,
              skipped: 0,
            };
            for (const result of results) {
              switch (result.outcome) {
                case "CREATED":
                  sheetCounts.created += 1;
                  break;
                case "UPDATED":
                  sheetCounts.updated += 1;
                  break;
                case "UNCHANGED":
                  sheetCounts.unchanged += 1;
                  break;
                case "SKIPPED":
                  sheetCounts.skipped += 1;
                  break;
              }
            }
            counts.created += sheetCounts.created;
            counts.updated += sheetCounts.updated;
            counts.unchanged += sheetCounts.unchanged;
            counts.skipped += sheetCounts.skipped;
            perSheetOutcomes.push({
              sheet: validation.sheetName,
              ...sheetCounts,
            });
            await this.recordRows(
              context,
              validation.sheetName,
              validation.rows,
              byRow,
            );
          }

          await tx.auditEvent.create({
            data: {
              tenantId,
              userId: actorUserId,
              action: "WORKBOOK_IMPORT_COMMITTED",
              entityType: "IMPORT_BATCH",
              entityId: batch.id,
              // The filename and checksum identify the workbook without
              // reproducing any confidential row.
              metadata: {
                originalFilename: filename,
                fileChecksum: checksum,
                sheetCount: workbook.sheets.length,
                created: counts.created,
                updated: counts.updated,
                skipped: counts.skipped,
                errorRows: preview.totals.errorRows,
              },
            },
          });
        },
        { timeout: 180_000, maxWait: 20_000 },
      );
    } catch (error) {
      // A failed commit must not leave totals that imply partial success.
      await this.db.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: preview.totals.errorRows,
        },
      });
      throw error;
    }

    const status: ImportBatchStatus =
      preview.totals.errorRows > 0 || counts.skipped > 0
        ? "PARTIAL"
        : "COMPLETED";
    const report: CommitReport = {
      ...preview,
      batchId: batch.id,
      status,
      alreadyImported: false,
      counts: { ...counts, errors: preview.totals.errorRows },
      perSheetOutcomes,
    };
    await this.db.importBatch.update({
      where: { id: batch.id },
      data: {
        status,
        completedAt: new Date(),
        createdCount: counts.created,
        updatedCount: counts.updated,
        skippedCount: counts.skipped,
        errorCount: preview.totals.errorRows,
        report: JSON.parse(JSON.stringify(report)) as object,
      },
    });
    return report;
  }

  /**
   * Loads references that already exist, so a rerun resolves them even when
   * the sheet that creates them reported no changes.
   */
  private async primeContext(context: ImportContext) {
    const frameworks = await context.tx.framework.findMany({
      select: { id: true, code: true },
    });
    for (const framework of frameworks) {
      context.frameworks.register(framework.code, framework.id);
    }
    const departments = await context.tx.orgDepartment.findMany({
      where: { tenantId: context.tenantId },
      select: { id: true, name: true },
    });
    for (const department of departments) {
      context.departments.set(department.name.toLowerCase(), department.id);
    }
    const definitions = await context.tx.kpiDefinition.findMany({
      select: { id: true, code: true },
    });
    for (const definition of definitions) {
      context.kpiDefinitions.set(definition.code, definition.id);
    }
    const configurations = await context.tx.kpiConfiguration.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      select: { id: true, definition: { select: { code: true } } },
    });
    for (const configuration of configurations) {
      context.kpiConfigurations.set(
        configuration.definition.code,
        configuration.id,
      );
      const targets = await context.tx.kpiTarget.findMany({
        where: {
          tenantId: context.tenantId,
          kpiConfigurationId: configuration.id,
          deletedAt: null,
        },
        select: { id: true, period: true, targetValue: true },
      });
      for (const target of targets) {
        context.kpiTargets.set(
          `${configuration.definition.code}|${target.period}`,
          target.id,
        );
        // A whole-financial-year target is the base a period target derives
        // from, so it wins over an already-derived quarterly or monthly row.
        if (/^FY\d{2}-\d{2}$/i.test(target.period)) {
          context.kpiBaseTargets.set(configuration.definition.code, {
            value: target.targetValue.toString(),
            period: target.period,
          });
        }
      }
    }
    const gaps = await context.tx.gap.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      select: { id: true, code: true },
    });
    for (const gap of gaps) context.gaps.set(gap.code, gap.id);
    const evidence = await context.tx.evidence.findMany({
      where: { tenantId: context.tenantId },
      select: { id: true, code: true },
    });
    for (const record of evidence) context.evidence.set(record.code, record.id);
  }

  /**
   * Creates or refreshes the register type for each register sheet present in
   * the workbook, recording its column layout for generic rendering.
   */
  private async ensureRegisterTypes(
    context: ImportContext,
    validations: Map<string, SheetValidation>,
  ) {
    for (const plan of SHEET_PLANS) {
      if (plan.target !== "register" || !plan.register) continue;
      const validation = validations.get(plan.key);
      if (!validation?.present) continue;
      const labels = new Set<string>();
      for (const row of validation.rows) {
        const fields = (row.payload as { fields?: Record<string, string> })
          .fields;
        for (const label of Object.keys(fields ?? {})) labels.add(label);
      }
      const fieldConfiguration = [...labels].map((label) => ({
        key: label,
        label,
        type: "string",
      }));
      const type = await context.tx.operationalRegisterType.upsert({
        where: {
          tenantId_code: {
            tenantId: context.tenantId,
            code: plan.register.code,
          },
        },
        update: {
          name: plan.register.name,
          sourceSheet: validation.sheetName,
          fieldConfiguration,
          active: true,
        },
        create: {
          tenantId: context.tenantId,
          code: plan.register.code,
          name: plan.register.name,
          sourceSheet: validation.sheetName,
          fieldConfiguration,
        },
        select: { id: true },
      });
      context.registerTypes.set(plan.register.code, type.id);
    }
  }

  /** Persists every row's outcome, including the ones that failed validation. */
  private async recordRows(
    context: ImportContext,
    sheetName: string,
    rows: readonly ValidatedRow[],
    outcomes: Map<number, CommitResult>,
  ) {
    if (rows.length === 0) return;
    await context.tx.importBatchRow.createMany({
      data: rows.map((row) => {
        const outcome = outcomes.get(row.rowNumber);
        return {
          tenantId: context.tenantId,
          batchId: context.batchId,
          sheet: sheetName,
          rowNumber: row.rowNumber,
          businessKey: row.businessKey,
          normalizedPayload: JSON.parse(JSON.stringify(row.payload)) as object,
          validationErrors: JSON.parse(JSON.stringify(row.errors)) as object,
          importResult:
            row.errors.length > 0 ? "FAILED" : (outcome?.outcome ?? "SKIPPED"),
          destinationTable: outcome?.destinationTable ?? null,
          destinationRecordId: outcome?.destinationRecordId ?? null,
        };
      }),
    });
  }
}
