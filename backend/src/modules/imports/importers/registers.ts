import { FieldParseError, normaliseDate, normaliseText } from "../normalise.js";
import type { SheetPlan } from "../sheet-plan.js";
import type { SheetTable } from "../sheet-table.js";
import {
  type CommitResult,
  type RowError,
  type SheetImporter,
  type ValidatedRow,
  rowError,
} from "../types.js";
import { flagDuplicateKeys } from "./masters.js";

const safeDate = (value: unknown, label: string, errors: RowError[]) => {
  try {
    return normaliseDate(value as never) ?? null;
  } catch (error) {
    errors.push(
      rowError(
        label,
        error instanceof FieldParseError ? error.message : "Invalid date",
      ),
    );
    return null;
  }
};

/**
 * One importer serves every generic register sheet. The per-sheet differences
 * — which column is the business code, the title, the status — are declared in
 * `sheet-plan.ts`, so adding a register is a config change, not a new module.
 *
 * The full row is kept in `payload` under its original header labels, which is
 * what lets a single list and CSV endpoint render any register faithfully.
 */
export const registerImporter: SheetImporter = {
  key: "register",

  validate(table: SheetTable, plan: SheetPlan): ValidatedRow[] {
    const config = plan.register;
    if (!config) return [];
    const rows: ValidatedRow[] = [];
    let sequence = 0;
    for (const row of table.dataRows()) {
      const errors: RowError[] = [];
      const title = normaliseText(row.cell(config.titleHeader));
      const code = config.codeHeader
        ? normaliseText(row.cell(config.codeHeader))
        : undefined;
      // Sheets keyed by a business code skip rows without one: those are the
      // sheet's summary or spacer rows, not records.
      if (config.codeHeader && code === undefined) continue;
      if (!config.codeHeader && title === undefined) continue;
      sequence += 1;
      if (title === undefined) {
        errors.push(rowError(config.titleHeader, "A record title is required"));
      }
      // A sheet with no identifier column (the cross-framework map) gets a
      // stable positional code, so a rerun updates the same record.
      const businessKey =
        code ?? `${config.code}-${String(sequence).padStart(3, "0")}`;
      rows.push({
        rowNumber: row.rowNumber,
        businessKey,
        payload: {
          businessRecordCode: businessKey,
          title: title ?? businessKey,
          status: config.statusHeader
            ? (normaliseText(row.cell(config.statusHeader)) ?? null)
            : null,
          ownerRef: config.ownerHeader
            ? (normaliseText(row.cell(config.ownerHeader)) ?? null)
            : null,
          recordDate: config.dateHeader
            ? (safeDate(
                row.cell(config.dateHeader),
                config.dateHeader,
                errors,
              )?.toISOString() ?? null)
            : null,
          dueDate: config.dueDateHeader
            ? (safeDate(
                row.cell(config.dueDateHeader),
                config.dueDateHeader,
                errors,
              )?.toISOString() ?? null)
            : null,
          fields: row.labelled,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, config.codeHeader || "record");
  },

  async commit(rows, context, plan): Promise<CommitResult[]> {
    const config = plan.register;
    if (!config) return [];
    const registerTypeId = context.registerTypes.get(config.code);
    if (!registerTypeId) return [];

    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        businessRecordCode: string;
        title: string;
        status: string | null;
        ownerRef: string | null;
        recordDate: string | null;
        dueDate: string | null;
        fields: Record<string, string>;
      };
      const existing = await context.tx.operationalRegisterRecord.findUnique({
        where: {
          tenantId_registerTypeId_businessRecordCode: {
            tenantId: context.tenantId,
            registerTypeId,
            businessRecordCode: payload.businessRecordCode,
          },
        },
        select: { id: true },
      });
      const data = {
        title: payload.title,
        status: payload.status,
        sourceOwnerRef: payload.ownerRef,
        recordDate: payload.recordDate ? new Date(payload.recordDate) : null,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        payload: payload.fields,
        sourceSheet: plan.sheetName,
        sourceRow: row.rowNumber,
        importBatchId: context.batchId,
        updatedById: context.actorUserId,
      };
      const record = existing
        ? await context.tx.operationalRegisterRecord.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.operationalRegisterRecord.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              registerTypeId,
              businessRecordCode: payload.businessRecordCode,
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "operational_register_records",
        destinationRecordId: record.id,
      });
    }
    return results;
  },
};

/**
 * `26_Audit_Trail` — history the client recorded in the workbook.
 *
 * Written with `source = IMPORT` so it is never mistaken for an event this
 * platform observed. `createdAt` remains the time the row was written; the
 * workbook's own timestamp and hash are preserved in `metadata`. The
 * `prevent_audit_event_mutation` trigger makes these rows append-only, so a
 * rerun inserts nothing when the event is already present.
 */
export const auditTrailImporter: SheetImporter = {
  key: "audit_trail",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("event id"));
      if (code === undefined) continue;
      const errors: RowError[] = [];
      const action = normaliseText(row.cell("action"));
      if (action === undefined) {
        errors.push(rowError("Action", "Action is required"));
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          eventId: code,
          action: action ?? null,
          module: normaliseText(row.cell("module")) ?? null,
          userRef: normaliseText(row.cell("user id")) ?? null,
          severity: normaliseText(row.cell("severity")) ?? null,
          timestamp: normaliseText(row.cell("timestamp")) ?? null,
          before: normaliseText(row.cell("before")) ?? null,
          after: normaliseText(row.cell("after")) ?? null,
          hash: normaliseText(row.cell("hash chain")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Event ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as Record<string, string | null> & {
        eventId: string;
        action: string;
      };
      // Audit events are append-only, so idempotency is a presence check
      // rather than an upsert.
      const existing = await context.tx.auditEvent.findFirst({
        where: {
          tenantId: context.tenantId,
          source: "IMPORT",
          entityType: "WORKBOOK_AUDIT_TRAIL",
          entityId: payload.eventId,
        },
        select: { id: true },
      });
      if (existing) {
        results.push({
          rowNumber: row.rowNumber,
          outcome: "UNCHANGED",
          destinationTable: "audit_events",
          destinationRecordId: existing.id,
        });
        continue;
      }
      const event = await context.tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          userId: null,
          action: payload.action,
          entityType: "WORKBOOK_AUDIT_TRAIL",
          entityId: payload.eventId,
          source: "IMPORT",
          metadata: {
            workbookEventId: payload.eventId,
            workbookTimestamp: payload.timestamp,
            workbookUserReference: payload.userRef,
            module: payload.module,
            severity: payload.severity,
            before: payload.before,
            after: payload.after,
            workbookHash: payload.hash,
            importBatchId: context.batchId,
          },
        },
        select: { id: true },
      });
      results.push({
        rowNumber: row.rowNumber,
        outcome: "CREATED",
        destinationTable: "audit_events",
        destinationRecordId: event.id,
      });
    }
    return results;
  },
};
