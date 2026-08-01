import type {
  ControlImplementationStatus,
  ControlLifecycleStatus,
  ControlPerson,
} from "../../types/api";

export const statusLabel = (status: string) => status.replaceAll("_", " ");

export const named = (
  value: ControlPerson | { code: string; name: string } | null | undefined,
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
export const formatControlDate = (value: string | null | undefined) => {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const formatControlDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const lifecycleTone = (
  status: ControlLifecycleStatus | string,
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

export const implementationTone = (
  status: ControlImplementationStatus | string,
): "green" | "red" | "amber" | "blue" | "grey" => {
  switch (status) {
    case "IMPLEMENTED":
      return "green";
    case "PARTIALLY_IMPLEMENTED":
    case "IN_PROGRESS":
      return "amber";
    case "NOT_STARTED":
      return "blue";
    case "NOT_APPLICABLE":
      return "grey";
    default:
      return "grey";
  }
};

export const auditActionLabel = (action: string) => statusLabel(action);

export const IMPLEMENTATION_STATUS_OPTIONS: ControlImplementationStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PARTIALLY_IMPLEMENTED",
  "IMPLEMENTED",
  "NOT_APPLICABLE",
];

export const CONTROL_TYPE_OPTIONS = [
  "PREVENTIVE",
  "DETECTIVE",
  "CORRECTIVE",
  "DIRECTIVE",
] as const;

export const FREQUENCY_OPTIONS = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "CONTINUOUS",
  "PER_EVENT",
  "ONE_TIME",
] as const;

export const EVIDENCE_UNAVAILABLE_MESSAGE =
  "Controls that require Evidence need qualifying approved Evidence linked before Evidence-gated workflows can succeed.";

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
