import { createHash } from "node:crypto";

export type SyncChange = {
  readonly sourceEntityType: string;
  readonly externalRecordId: string;
  readonly sourceUpdatedAt?: Date | null;
  readonly payload: Record<string, unknown>;
  readonly syncHash: string;
};

export type SyncValidation =
  | { readonly ok: true; readonly change: SyncChange; readonly localEntityType: string }
  | { readonly ok: false; readonly change: SyncChange; readonly reason: string };

export type SyncPreviewCounts = {
  readonly create: number;
  readonly update: number;
  readonly conflict: number;
  readonly invalid: number;
  readonly skip: number;
};

export interface ExternalConnector {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  fetchChanges(cursor?: string | null): Promise<{
    changes: readonly SyncChange[];
    nextCursor: string | null;
  }>;
  normalise(raw: Record<string, unknown>): SyncChange;
  validate(change: SyncChange): SyncValidation;
  preview(changes: readonly SyncChange[]): Promise<{
    counts: SyncPreviewCounts;
    validations: readonly SyncValidation[];
  }>;
  commit(validations: readonly SyncValidation[]): Promise<SyncPreviewCounts>;
}

export const hashPayload = (payload: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

/** Entity types GenRAC may sync into GenBioCa reference masters only. */
export const GENRAC_OWNED_ENTITY_TYPES = [
  "CUSTOMER_MASTER",
  "COMPANY_CUSTOMER_MAP",
  "DEAL",
  "SHARED_FRAMEWORK",
  "SHARED_REGULATORY_RULE",
  "ORG_REFERENCE",
] as const;

/** Local compliance transactions GenRAC must never overwrite. */
export const GENBIOCA_AUTHORITATIVE_TYPES = [
  "POLICY",
  "CONTROL",
  "CHECKPOINT",
  "KPI_CONFIGURATION",
  "KPI_TARGET",
  "KPI_ACTUAL",
  "EVIDENCE",
  "RISK",
  "GAP",
  "CAPA",
  "AUDIT_EVENT",
  "IMPORT_BATCH",
] as const;

export const isProtectedLocalType = (localEntityType: string) =>
  (GENBIOCA_AUTHORITATIVE_TYPES as readonly string[]).includes(localEntityType);
