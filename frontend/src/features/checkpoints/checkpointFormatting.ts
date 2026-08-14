import type {
  CheckpointLifecycleStatus,
  CheckpointOutcome,
  CheckpointPerson,
  CheckpointVerificationFrequency,
} from "../../types/api";

export const statusLabel = (status: string) => status.replaceAll("_", " ");

export const named = (
  value: CheckpointPerson | { code: string; name: string } | null | undefined,
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
export const formatCheckpointDate = (value: string | null | undefined) => {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const formatCheckpointDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const lifecycleTone = (
  status: CheckpointLifecycleStatus | string,
): "green" | "red" | "amber" | "grey" => {
  switch (status) {
    case "ACTIVE":
      return "green";
    case "ARCHIVED":
      return "grey";
    case "INACTIVE":
      return "amber";
    default:
      return "grey";
  }
};

export const outcomeTone = (
  outcome: CheckpointOutcome | string | null | undefined,
): "green" | "red" | "amber" | "grey" => {
  switch (outcome) {
    case "PASS":
      return "green";
    case "PARTIAL":
      return "amber";
    case "FAIL":
      return "red";
    case "NOT_APPLICABLE":
      return "grey";
    default:
      return "grey";
  }
};

export const auditActionLabel = (action: string) => statusLabel(action);

export const VERIFICATION_FREQUENCY_OPTIONS: CheckpointVerificationFrequency[] =
  [
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
    "HALF_YEARLY",
    "ANNUAL",
    "CONTINUOUS",
    "PER_EVENT",
    "ONE_TIME",
  ];

export const OUTCOME_OPTIONS: CheckpointOutcome[] = [
  "PASS",
  "PARTIAL",
  "FAIL",
  "NOT_APPLICABLE",
];

/** Free-text format help for reviewPeriod — never auto-suggest a value. */
export const reviewPeriodFormatHelp = (
  frequency: CheckpointVerificationFrequency | string,
): string => {
  switch (frequency) {
    case "DAILY":
      return "Format: YYYY-MM-DD (real calendar date). Example: 2026-07-15";
    case "WEEKLY":
      return "Format: YYYY-Www (ISO week 01–53). Example: 2026-W28";
    case "MONTHLY":
      return "Format: YYYY-MM. Example: 2026-07";
    case "QUARTERLY":
      return "Format: YYYY-Qn (Q1–Q4). Example: 2026-Q3";
    case "HALF_YEARLY":
      return "Format: YYYY-Hn (H1–H2). Example: 2026-H2";
    case "ANNUAL":
      return "Format: YYYY. Example: 2026";
    case "CONTINUOUS":
    case "PER_EVENT":
      return "Format: YYYY-MM-DD#TOKEN (TOKEN: A–Z, 0–9, _, -; max 32). Example: 2026-07-15#EVENT1";
    case "ONE_TIME":
      return "Format: literal ONE-TIME";
    default:
      return "Enter a review period that matches the Checkpoint verification frequency.";
  }
};

const UNSAFE_AUDIT_KEYS = new Set([
  "content",
  "purpose",
  "scope",
  "changeSummary",
  "comments",
  "rejectionReason",
  "approvalComments",
  "implementationNotes",
  "description",
  "objective",
  "verificationMethod",
  "expectedResult",
  "observation",
  "recommendation",
  "title",
  "token",
  "accessToken",
  "refreshToken",
  "password",
]);

/** Filter audit metadata to safe display keys only. */
export const safeAuditMetadataEntries = (
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
              (entry) =>
                typeof entry === "string" || typeof entry === "number",
            )
            .join(", ") || "—",
        ] as const;
      }
      return [key, "—"] as const;
    });
};
