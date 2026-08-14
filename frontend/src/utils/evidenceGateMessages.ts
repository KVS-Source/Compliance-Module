import type { ApiError } from "../services/apiClient";

/** Reads `details.reason` from an Evidence gate 409 response. */
export const evidenceGateReason = (error: ApiError): string => {
  if (
    error.details &&
    typeof error.details === "object" &&
    "reason" in error.details &&
    typeof (error.details as { reason?: unknown }).reason === "string"
  ) {
    return (error.details as { reason: string }).reason;
  }
  return "";
};

const POLICY_REASON_MESSAGES: Record<string, string> = {
  EVIDENCE_GATE_NOT_CONFIGURED:
    "This Policy Version requires Evidence, but no qualifying Control or Checkpoint targets are configured yet. Map Controls and Checkpoints to this Version, then link approved Evidence before approval.",
  EVIDENCE_CONTROL_COVERAGE_INCOMPLETE:
    "This Policy Version requires approved Evidence linked to every mapped Control. Link qualifying Evidence to the required Controls, then try again.",
  EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE:
    "This Policy Version requires approved Evidence linked to every mapped Checkpoint. Link qualifying Evidence to the required Checkpoints, then try again.",
  EVIDENCE_COVERAGE_INCOMPLETE:
    "This Policy Version requires approved Evidence coverage for all mapped Controls and Checkpoints. Link qualifying Evidence, then try again.",
};

const CHECKPOINT_REASON_MESSAGES: Record<string, string> = {
  EVIDENCE_COVERAGE_INCOMPLETE:
    "This Checkpoint review requires at least one qualifying approved Evidence link. Link approved Evidence to this Checkpoint while the Evidence is DRAFT, then try again.",
};

const KPI_REASON_MESSAGES: Record<string, string> = {
  EVIDENCE_KPI_LINK_REQUIRED:
    "This KPI actual requires at least one linked Evidence record before approval. Create or link Evidence to this actual, then try again. Nothing was saved.",
  EVIDENCE_KPI_COVERAGE_INCOMPLETE:
    "This KPI actual has Evidence links, but none currently qualify (approved with a complete file and valid dates). Nothing was saved.",
};

export function policyEvidenceGateMessage(error: ApiError): string | null {
  if (error.code !== "EVIDENCE_REQUIRED") return null;
  const reason = evidenceGateReason(error);
  return (
    POLICY_REASON_MESSAGES[reason] ??
    "This Policy Version requires qualifying approved Evidence before approval. Nothing was saved."
  );
}

export function checkpointEvidenceGateMessage(error: ApiError): string | null {
  if (error.code !== "EVIDENCE_REQUIRED") return null;
  const reason = evidenceGateReason(error);
  return (
    CHECKPOINT_REASON_MESSAGES[reason] ??
    "This Checkpoint review requires qualifying approved Evidence. Nothing was saved."
  );
}

export function kpiEvidenceGateMessage(error: ApiError): string | null {
  if (error.code !== "EVIDENCE_REQUIRED") return null;
  const reason = evidenceGateReason(error);
  return (
    KPI_REASON_MESSAGES[reason] ??
    "This KPI actual requires qualifying Evidence before approval. Nothing was saved."
  );
}

/** Informational copy when a Policy Version has requiresEvidence before approve. */
export const POLICY_EVIDENCE_GATE_HINT =
  "This Policy Version requires qualifying approved Evidence for every mapped Control and Checkpoint before approval can succeed.";

/** Informational copy when a KPI configuration requires evidence. */
export const KPI_EVIDENCE_GATE_HINT =
  "This KPI configuration requires linked, qualifying approved Evidence before an actual can be approved.";

/** Informational copy when a Checkpoint requires evidence on review. */
export const CHECKPOINT_EVIDENCE_GATE_HINT =
  "This Checkpoint requires at least one qualifying approved Evidence link before a review can be submitted.";
