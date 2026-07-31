import type {
  PolicyLifecycleStatus,
  PolicyPerson,
  PolicyVersionStatus,
} from "../../types/api";

export const statusLabel = (status: string) => status.replaceAll("_", " ");

export const named = (
  value: PolicyPerson | { code: string; name: string } | null | undefined,
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
export const formatPolicyDate = (value: string | null | undefined) => {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const formatPolicyDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

export const lifecycleTone = (
  status: PolicyLifecycleStatus | string,
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

export const versionStatusTone = (
  status: PolicyVersionStatus | string,
): "green" | "red" | "amber" | "blue" | "grey" => {
  switch (status) {
    case "APPROVED":
      return "green";
    case "REJECTED":
      return "red";
    case "SUBMITTED":
      return "blue";
    case "DRAFT":
      return "amber";
    case "SUPERSEDED":
    case "OBSOLETE":
      return "grey";
    default:
      return "grey";
  }
};

export const auditActionLabel = (action: string) => statusLabel(action);

/** Estimate the next Version label; the server allocates the final value. */
export const estimateNextVersion = (
  latest: { versionMajor: number; versionMinor: number } | null | undefined,
  bump: "MAJOR" | "MINOR",
) => {
  if (!latest) return "1.0";
  if (bump === "MAJOR") return `${latest.versionMajor + 1}.0`;
  return `${latest.versionMajor}.${latest.versionMinor + 1}`;
};

export const isEditableVersionStatus = (status: PolicyVersionStatus) =>
  status === "DRAFT" || status === "REJECTED";

export const EVIDENCE_UNAVAILABLE_MESSAGE =
  "Evidence Management is not available yet. Approving a Version that requires Evidence fails closed with 501 EVIDENCE_GATE_NOT_IMPLEMENTED and saves nothing.";

const UNSAFE_AUDIT_KEYS = new Set([
  "content",
  "purpose",
  "scope",
  "changeSummary",
  "comments",
  "rejectionReason",
  "approvalComments",
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
