import type {
  EvidenceDecisionOutcome,
  EvidenceDepartmentRef,
  EvidenceLifecycleStatus,
  EvidencePerson,
} from "../../types/api";

export const EVIDENCE_LIFECYCLE_OPTIONS: EvidenceLifecycleStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
];

/**
 * SUBMITTED is the only API value for evidence awaiting a decision. It is shown
 * as "Pending review" because that is what the state means to a reviewer; the
 * API value itself is never renamed and PENDING_REVIEW is not an API value.
 */
export const evidenceStatusLabel = (
  status: EvidenceLifecycleStatus | string,
): string => (status === "SUBMITTED" ? "Pending review" : String(status));

export const evidenceStatusTone = (
  status: EvidenceLifecycleStatus | string,
): "green" | "red" | "amber" | "blue" | "grey" => {
  switch (status) {
    case "APPROVED":
      return "green";
    case "REJECTED":
      return "red";
    case "SUBMITTED":
      return "amber";
    case "DRAFT":
      return "blue";
    default:
      return "grey";
  }
};

export const evidenceDecisionTone = (
  decision: EvidenceDecisionOutcome | string,
): "green" | "red" | "grey" =>
  decision === "APPROVED" ? "green" : decision === "REJECTED" ? "red" : "grey";

export const named = (
  value: EvidencePerson | EvidenceDepartmentRef | null | undefined,
  fallback = "Not assigned",
) => (value ? `${value.name} (${value.code})` : fallback);

export const display = (
  value: string | number | null | undefined,
  fallback = "Not provided",
) =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);

/** Date-only values stay YYYY-MM-DD; timestamps use locale formatting. */
export const formatEvidenceDate = (value: string | null | undefined) => {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const formatEvidenceDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const formatFileSize = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "—";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const auditActionLabel = (action: string) => action.replaceAll("_", " ");

/** RFC 4122 v1–v5 shape; guards reserved segments from reaching the detail API. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isEvidenceId = (value: string | undefined): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

/**
 * Audit metadata keys that could echo free text or storage internals back into
 * the UI. Everything else in the safe metadata envelope may be displayed.
 */
const UNSAFE_AUDIT_KEYS = new Set([
  "storageKey",
  "contentSha256",
  "path",
  "absolutePath",
  "tempPath",
  "title",
  "description",
  "reason",
  "comment",
  "comments",
  "originalFileName",
  "token",
  "accessToken",
  "refreshToken",
  "password",
]);

export const safeEvidenceAuditEntries = (
  metadata: Record<string, unknown> | null | undefined,
): Array<[string, string]> => {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata)
    .filter(([key]) => !UNSAFE_AUDIT_KEYS.has(key))
    .map(([key, value]) => {
      if (value === null || value === undefined) return [key, "—"] as const;
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return [key, String(value)] as const;
      }
      if (Array.isArray(value)) {
        return [
          key,
          value
            .filter(
              (entry) => typeof entry === "string" || typeof entry === "number",
            )
            .join(", ") || "—",
        ] as const;
      }
      return [key, "—"] as const;
    });
};
