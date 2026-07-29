import type {
  KpiConfiguration,
  KpiDirection,
  KpiNamedRef,
  KpiPerson,
  SubmissionStatus,
} from "../../types/api";

/** ENUM_CASE to Title-Case for display, e.g. HALF_YEARLY to Half-Yearly. */
export const enumLabel = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");

export const directionLabel = (direction: KpiDirection) => {
  switch (direction) {
    case "HIGHER_IS_BETTER":
      return "Higher is better";
    case "LOWER_IS_BETTER":
      return "Lower is better";
    case "TARGET_EXACT":
      return "Exact target";
    case "INFORMATIONAL":
      return "Informational";
    default:
      return direction;
  }
};

export const directionDescription = (direction: KpiDirection) => {
  switch (direction) {
    case "HIGHER_IS_BETTER":
      return "Values at or above target perform better.";
    case "LOWER_IS_BETTER":
      return "Values at or below target perform better.";
    case "TARGET_EXACT":
      return "Values are evaluated using the configured tolerance.";
    case "INFORMATIONAL":
      return "No pass/fail risk is automatically generated.";
    default:
      return "";
  }
};

export const approvalStatusLabel = (status: SubmissionStatus) =>
  status.replaceAll("_", " ");

export const named = (
  value: KpiNamedRef | KpiPerson | null | undefined,
  fallback = "Not set",
) => (value ? `${value.name} (${value.code})` : fallback);

/** Scope dimensions per section 3.1, joined for a single-line summary. */
export const scopeSummary = (
  configuration: KpiConfiguration,
  fallback = "Company-wide",
) =>
  [
    configuration.department?.name,
    configuration.orgUnit?.name,
    configuration.orgLocation?.name,
    configuration.productService,
  ]
    .filter(Boolean)
    .join(" · ") || fallback;

export const configurationLabel = (configuration: KpiConfiguration) =>
  `${configuration.kpi.code} · ${configuration.kpi.name} (${scopeSummary(configuration)})`;

export const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

/**
 * Suggested target code. The backend requires a client-supplied code (unlike
 * ACT- and RSK- codes, which the server allocates), so the form pre-fills a
 * consistent default rather than presenting an empty required field.
 * See docs/reviews/kpi-target-code-generation.md.
 */
export const suggestedTargetCode = (kpiCode: string, period: string) => {
  const normalise = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const parts = ["TGT", normalise(kpiCode), normalise(period)].filter(Boolean);
  return parts.join("-").slice(0, 64);
};
