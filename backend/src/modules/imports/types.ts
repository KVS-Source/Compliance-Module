import type { Prisma } from "@prisma/client";
import type { FrameworkResolver } from "./framework-resolver.js";
import type { SheetPlan } from "./sheet-plan.js";
import type { SheetTable } from "./sheet-table.js";

export interface RowError {
  /** Header label or field name the problem belongs to; `_row` for row-level. */
  readonly field: string;
  readonly message: string;
}

/**
 * A workbook row after normalisation and validation, before any database
 * write. `payload` is JSON-safe so it can be persisted on `import_batch_rows`
 * and replayed in a report without re-reading the workbook.
 */
export interface ValidatedRow {
  readonly rowNumber: number;
  readonly businessKey: string | null;
  readonly payload: Record<string, unknown>;
  readonly errors: readonly RowError[];
  /**
   * Set when a required value was absent and a documented deterministic
   * fallback was applied. The record is written but flagged for human review.
   */
  readonly reviewReason?: string;
}

export interface SheetValidation {
  readonly key: string;
  readonly sheetName: string;
  readonly present: boolean;
  readonly target: SheetPlan["target"];
  /** Headers the plan requires that the sheet does not provide. */
  readonly missingHeaders: readonly string[];
  readonly rows: readonly ValidatedRow[];
  /** Rows that carry no error. */
  readonly validCount: number;
  readonly errorCount: number;
  readonly derivedReason?: string;
}

export type RowOutcome = "CREATED" | "UPDATED" | "UNCHANGED" | "SKIPPED";

export interface CommitResult {
  readonly rowNumber: number;
  readonly outcome: RowOutcome;
  readonly destinationTable: string;
  readonly destinationRecordId: string | null;
}

/** Shared caches so each sheet importer resolves references once per run. */
export interface ImportContext {
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string;
  /** The authenticated actor recorded as createdBy/updatedBy on imported rows. */
  readonly actorUserId: string;
  readonly batchId: string;
  /**
   * Resolves the varied framework spellings used across sheets. Populated by
   * the framework master importer before any dependent sheet runs.
   */
  readonly frameworks: FrameworkResolver;
  /** FrameworkRule id by workbook checkpoint code. */
  readonly frameworkRules: Map<string, string>;
  /** OrgDepartment id by department name. */
  readonly departments: Map<string, string>;
  /** OrgUnit id by lower-cased name. */
  readonly orgUnits: Map<string, string>;
  /** OrgLocation id by lower-cased name or code. */
  readonly orgLocations: Map<string, string>;
  /** KpiDefinition id by KPI code. */
  readonly kpiDefinitions: Map<string, string>;
  /** KpiConfiguration id by KPI code. */
  readonly kpiConfigurations: Map<string, string>;
  /** KpiTarget id by `KPI code|period`. */
  readonly kpiTargets: Map<string, string>;
  /**
   * The configured target value per KPI code, as declared on
   * `15_KPI_Config_Targets`. Actuals are reported at a finer cadence than the
   * configured period, and the workbook echoes the same target against every
   * one of those rows, so this is the value a derived period target carries.
   */
  readonly kpiBaseTargets: Map<
    string,
    { readonly value: string; readonly period: string }
  >;
  /** Evidence id by workbook evidence code. */
  readonly evidence: Map<string, string>;
  /** Gap id by workbook gap code. */
  readonly gaps: Map<string, string>;
  /** Register type id by register code. */
  readonly registerTypes: Map<string, string>;
}

export interface SheetImporter {
  readonly key: string;
  /** Pure validation: never touches the database. */
  validate(table: SheetTable, plan: SheetPlan): ValidatedRow[];
  /** Writes the valid rows. Only called inside the commit transaction. */
  commit(
    rows: readonly ValidatedRow[],
    context: ImportContext,
    plan: SheetPlan,
  ): Promise<CommitResult[]>;
}

export const rowError = (field: string, message: string): RowError => ({
  field,
  message,
});
