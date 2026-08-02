import { normaliseText } from "../normalise.js";
import type { SheetTable } from "../sheet-table.js";
import {
  type CommitResult,
  type SheetImporter,
  type ValidatedRow,
  rowError,
} from "../types.js";

/**
 * Turns a human label into a stable, company-scoped code. Import keys must not
 * drift between runs, so the code is a pure function of the label.
 */
export const codeFromLabel = (label: string, maximum = 32) =>
  label
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum);

/**
 * Rejects a sheet whose rows repeat a business key. Merging them would pick a
 * winner arbitrarily, so both rows are failed and reported instead.
 */
export const flagDuplicateKeys = (
  rows: ValidatedRow[],
  keyLabel: string,
): ValidatedRow[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.businessKey) {
      counts.set(row.businessKey, (counts.get(row.businessKey) ?? 0) + 1);
    }
  }
  return rows.map((row) =>
    row.businessKey && (counts.get(row.businessKey) ?? 0) > 1
      ? {
          ...row,
          errors: [
            ...row.errors,
            rowError(
              keyLabel,
              `Duplicate ${keyLabel} "${row.businessKey}" appears more than once in this sheet`,
            ),
          ],
        }
      : row,
  );
};

/**
 * `03_Company_Setup` section B: the business unit, department and location
 * grid. The company profile block above it is left to the operator, because
 * every profile field in the supplied workbooks is blank.
 */
export const organisationImporter: SheetImporter = {
  key: "company",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const department = normaliseText(row.cell("department function"));
      const unit = normaliseText(row.cell("business unit"));
      const location = normaliseText(row.cell("location"));
      // The grid ends at the next banner row, which has no department cell.
      if (department === undefined && unit === undefined) continue;
      const errors = [];
      if (department === undefined) {
        errors.push(
          rowError("Department / Function", "Department is required"),
        );
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: department ? codeFromLabel(department) : null,
        payload: {
          department: department ?? null,
          departmentCode: department ? codeFromLabel(department) : null,
          businessUnit: unit ?? null,
          location: location ?? null,
          leader: normaliseText(row.cell("leader")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Department / Function");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        department: string;
        departmentCode: string;
        businessUnit: string | null;
        location: string | null;
        leader: string | null;
      };

      if (payload.businessUnit) {
        const code = codeFromLabel(payload.businessUnit);
        await context.tx.orgUnit.upsert({
          where: { tenantId_code: { tenantId: context.tenantId, code } },
          update: { name: payload.businessUnit },
          create: {
            tenantId: context.tenantId,
            code,
            name: payload.businessUnit,
          },
        });
      }
      if (payload.location) {
        const code = codeFromLabel(payload.location);
        // `Thane (India)` carries the country in brackets.
        const country = /\(([^)]+)\)/.exec(payload.location)?.[1] ?? null;
        const city = payload.location.replace(/\s*\([^)]*\)\s*/, "").trim();
        await context.tx.orgLocation.upsert({
          where: { tenantId_code: { tenantId: context.tenantId, code } },
          update: { name: payload.location, city, country },
          create: {
            tenantId: context.tenantId,
            code,
            name: payload.location,
            city,
            country,
          },
        });
      }

      const existing = await context.tx.orgDepartment.findUnique({
        where: {
          tenantId_code: {
            tenantId: context.tenantId,
            code: payload.departmentCode,
          },
        },
        select: { id: true },
      });
      const department = await context.tx.orgDepartment.upsert({
        where: {
          tenantId_code: {
            tenantId: context.tenantId,
            code: payload.departmentCode,
          },
        },
        update: { name: payload.department, headName: payload.leader },
        create: {
          tenantId: context.tenantId,
          code: payload.departmentCode,
          name: payload.department,
          headName: payload.leader,
        },
        select: { id: true },
      });
      context.departments.set(payload.department.toLowerCase(), department.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "org_departments",
        destinationRecordId: department.id,
      });
    }
    return results;
  },
};

/** `05_Frameworks_Master`. Frameworks are a global shared master with no tenant. */
export const frameworksImporter: SheetImporter = {
  key: "frameworks",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const name = normaliseText(row.cell("framework"));
      if (name === undefined) continue;
      const version = normaliseText(row.cell("version"));
      const scopeStatus = normaliseText(row.cell("status"));
      const errors = [];
      if (version === undefined) {
        errors.push(rowError("Version", "Version is required"));
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: version ? `${name}:${version}` : name,
        payload: {
          code: name,
          version: version ?? null,
          scopeStatus: scopeStatus ?? null,
          description: normaliseText(row.cell("scope")) ?? null,
          // "Not Applicable" is the workbook's way of parking a framework, so
          // it becomes DISABLED rather than being dropped from the catalogue.
          active: scopeStatus?.toLowerCase() !== "not applicable",
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Framework");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        version: string;
        scopeStatus: string | null;
        description: string | null;
        active: boolean;
      };
      const existing = await context.tx.framework.findUnique({
        where: {
          code_version: { code: payload.code, version: payload.version },
        },
        select: { id: true },
      });
      const framework = await context.tx.framework.upsert({
        where: {
          code_version: { code: payload.code, version: payload.version },
        },
        update: {
          name: payload.code,
          description: payload.description,
          scopeStatus: payload.scopeStatus,
          status: payload.active ? "ACTIVE" : "DISABLED",
        },
        create: {
          code: payload.code,
          name: payload.code,
          version: payload.version,
          description: payload.description,
          scopeStatus: payload.scopeStatus,
          status: payload.active ? "ACTIVE" : "DISABLED",
        },
        select: { id: true },
      });
      context.frameworks.register(payload.code, framework.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "frameworks",
        destinationRecordId: framework.id,
      });
    }
    return results;
  },
};

/**
 * `06_Framework_Checkpoints` — the clause-level audit checkpoint catalogue.
 *
 * These are framework *rules*, not tenant `checkpoints`: they are published by
 * the standards bodies and shared by every company, and they occupy the Rule
 * position in Policy → Framework → Rule → Evidence → Control → KPI.
 */
export const frameworkRulesImporter: SheetImporter = {
  key: "framework_checkpoints",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("chk id"));
      if (code === undefined) continue;
      const frameworkReference = normaliseText(row.cell("framework"));
      const title = normaliseText(row.cell("audit checkpoint"));
      const errors = [];
      if (frameworkReference === undefined) {
        errors.push(rowError("Framework", "Framework reference is required"));
      }
      if (title === undefined) {
        errors.push(
          rowError("Audit Checkpoint", "Checkpoint text is required"),
        );
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          frameworkReference: frameworkReference ?? null,
          title: title ?? null,
          clauseRef: normaliseText(row.cell("clause ref")) ?? null,
          theme: normaliseText(row.cell("theme area")) ?? null,
          criticality: normaliseText(row.cell("criticality")) ?? null,
          frequency: normaliseText(row.cell("frequency")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Chk ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        frameworkReference: string;
        title: string;
        clauseRef: string | null;
        theme: string | null;
        criticality: string | null;
        frequency: string | null;
      };
      const frameworkId = context.frameworks.resolve(
        payload.frameworkReference,
      );
      if (!frameworkId) {
        // The framework master is imported first, so an unresolved reference
        // means the workbook cites a framework it never declared.
        results.push({
          rowNumber: row.rowNumber,
          outcome: "SKIPPED",
          destinationTable: "framework_rules",
          destinationRecordId: null,
        });
        continue;
      }
      const existing = await context.tx.frameworkRule.findUnique({
        where: { frameworkId_code: { frameworkId, code: payload.code } },
        select: { id: true },
      });
      // The checkpoint text doubles as the rule title; the full sentence is
      // kept in description so nothing is lost to truncation.
      const title = payload.title.slice(0, 180);
      const rule = await context.tx.frameworkRule.upsert({
        where: { frameworkId_code: { frameworkId, code: payload.code } },
        update: {
          title,
          description: payload.title,
          clauseRef: payload.clauseRef,
          theme: payload.theme,
          criticality: payload.criticality,
          frequency: payload.frequency,
        },
        create: {
          frameworkId,
          code: payload.code,
          title,
          description: payload.title,
          clauseRef: payload.clauseRef,
          theme: payload.theme,
          criticality: payload.criticality,
          frequency: payload.frequency,
        },
        select: { id: true },
      });
      context.frameworkRules.set(payload.code, rule.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "framework_rules",
        destinationRecordId: rule.id,
      });
    }
    return results;
  },
};
