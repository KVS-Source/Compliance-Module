import { readFile } from "node:fs/promises";
import { AppError } from "../../../common/errors/app-error.js";
import { parseCsv } from "../../imports/csv-parser.js";
import { normaliseHeader } from "../../imports/normalise.js";
import {
  GENRAC_OWNED_ENTITY_TYPES,
  hashPayload,
  type ExternalConnector,
  type SyncChange,
  type SyncPreviewCounts,
  type SyncValidation,
} from "../connector.js";

/**
 * Controlled CSV adapter for GenRAC-shaped master extracts.
 * Required headers: entity_type, external_id, updated_at, plus payload columns.
 */
export class GenracCsvAdapter implements ExternalConnector {
  constructor(private readonly absoluteCsvPath: string) {}

  async testConnection() {
    try {
      await readFile(this.absoluteCsvPath);
      return { ok: true, message: "CSV file is readable" };
    } catch {
      return { ok: false, message: "CSV file is not readable" };
    }
  }

  async fetchChanges() {
    const buffer = await readFile(this.absoluteCsvPath);
    const rows = parseCsv(buffer);
    const headers = (rows[0] ?? []).map((header) => normaliseHeader(header));
    const entityIdx = headers.indexOf("entity type");
    const idIdx = headers.indexOf("external id");
    const updatedIdx = headers.indexOf("updated at");
    if (entityIdx < 0 || idIdx < 0) {
      throw new AppError(
        400,
        "GENRAC_CSV_INVALID",
        "GenRAC CSV requires entity_type and external_id headers",
      );
    }
    const changes: SyncChange[] = [];
    for (const row of rows.slice(1)) {
      const entityType = (row[entityIdx] ?? "").trim().toUpperCase();
      const externalId = (row[idIdx] ?? "").trim();
      if (!entityType || !externalId) continue;
      const payload: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (index === entityIdx || index === idIdx || index === updatedIdx) return;
        payload[header] = row[index] ?? "";
      });
      const updatedRaw = updatedIdx >= 0 ? row[updatedIdx] : undefined;
      changes.push({
        sourceEntityType: entityType,
        externalRecordId: externalId,
        sourceUpdatedAt: updatedRaw ? new Date(updatedRaw) : null,
        payload,
        syncHash: hashPayload({ entityType, externalId, payload }),
      });
    }
    return { changes, nextCursor: null };
  }

  normalise(raw: Record<string, unknown>): SyncChange {
    const entityType = String(raw.entity_type ?? raw.entityType ?? "")
      .trim()
      .toUpperCase();
    const externalId = String(raw.external_id ?? raw.externalId ?? "").trim();
    const payload = { ...raw };
    delete payload.entity_type;
    delete payload.entityType;
    delete payload.external_id;
    delete payload.externalId;
    return {
      sourceEntityType: entityType,
      externalRecordId: externalId,
      sourceUpdatedAt: null,
      payload,
      syncHash: hashPayload({ entityType, externalId, payload }),
    };
  }

  validate(change: SyncChange): SyncValidation {
    if (
      !(GENRAC_OWNED_ENTITY_TYPES as readonly string[]).includes(
        change.sourceEntityType,
      )
    ) {
      return {
        ok: false,
        change,
        reason: `Entity type ${change.sourceEntityType} is not in the approved GenRAC first-sync set`,
      };
    }
    if (!change.externalRecordId) {
      return { ok: false, change, reason: "external_id is required" };
    }
    return {
      ok: true,
      change,
      localEntityType: `GENRAC_${change.sourceEntityType}`,
    };
  }

  async preview(changes: readonly SyncChange[]) {
    const validations = changes.map((change) => this.validate(change));
    let create = 0;
    let invalid = 0;
    for (const item of validations) {
      if (!item.ok) invalid += 1;
      else create += 1;
    }
    const counts: SyncPreviewCounts = {
      create,
      update: 0,
      conflict: 0,
      invalid,
      skip: 0,
    };
    return { counts, validations };
  }

  async commit(validations: readonly SyncValidation[]) {
    let create = 0;
    let invalid = 0;
    for (const item of validations) {
      if (!item.ok) invalid += 1;
      else create += 1;
    }
    return {
      create,
      update: 0,
      conflict: 0,
      invalid,
      skip: 0,
    };
  }
}
