import { ApiError } from "../services/apiClient";

export type FieldErrors = Record<string, string>;

const isDetail = (
  value: unknown,
): value is { path: string; message: string } =>
  Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      "message" in value &&
      typeof (value as { path: unknown }).path === "string" &&
      typeof (value as { message: unknown }).message === "string",
  );

/** Map envelope `error.details` entries onto form field names. */
export function fieldErrorsFromApi(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return {};
  }
  const fields: FieldErrors = {};
  for (const detail of error.details) {
    if (!isDetail(detail) || !detail.path || fields[detail.path]) continue;
    fields[detail.path] = detail.message;
  }
  return fields;
}

/** 409 conflicts are surfaced on email for the user write forms. */
export function duplicateEmailFieldError(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 409) {
    return "A user with this email already exists";
  }
  return null;
}

/** 409 conflicts are surfaced on code for organisation master forms. */
export function duplicateCodeFieldError(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 409) {
    return "A record with this code already exists in the active Company";
  }
  return null;
}

export interface MappedApiError {
  fieldErrors: FieldErrors;
  formError: string | null;
}

const nonApiError = (error: unknown): MappedApiError => ({
  fieldErrors: {},
  formError: error instanceof Error ? error.message : "Request failed",
});

/**
 * The backend deliberately withholds which unique index fired (see the comment
 * in backend/src/common/middleware/http.ts), so a 409 on a configuration write
 * can only be attributed to the scope tuple as a whole.
 */
const DUPLICATE_SCOPE_MESSAGE =
  "An active KPI configuration already exists for this KPI with the same Business Unit, Location, Organisation Unit, Product/Service and Department. Change the scope, or edit the existing configuration.";

/** Two unique indexes can produce this 409; the response cannot say which. */
const DUPLICATE_TARGET_MESSAGE =
  "This conflicts with an existing target: either the target code is already used in this Company, or this period already has a target at this version number. Change the code or the period.";

/** Map known KPI configuration write errors onto form fields or a banner. */
export function kpiConfigurationError(error: unknown): MappedApiError {
  if (!(error instanceof ApiError)) return nonApiError(error);
  if (error.status === 409) {
    return { fieldErrors: {}, formError: DUPLICATE_SCOPE_MESSAGE };
  }
  if (error.code === "KPI_THRESHOLDS_INVALID") {
    return {
      fieldErrors: { redThresholdPct: error.message },
      formError: null,
    };
  }
  if (error.code === "KPI_CONFIGURATION_DATES_INVALID") {
    return { fieldErrors: { effectiveTo: error.message }, formError: null };
  }
  if (error.code === "RELATED_RECORD_INVALID") {
    // The server message names the offending relation; attach it to that field.
    const message = error.message.toLowerCase();
    const field = message.startsWith("owner")
      ? "ownerId"
      : message.startsWith("approver")
        ? "approverId"
        : message.startsWith("organisation unit")
          ? "orgUnitId"
          : message.startsWith("location")
            ? "orgLocationId"
            : message.startsWith("department")
              ? "departmentId"
              : message.startsWith("kpi definition")
                ? "kpiDefinitionId"
                : null;
    return field
      ? { fieldErrors: { [field]: error.message }, formError: null }
      : { fieldErrors: {}, formError: error.message };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return { fieldErrors: {}, formError: error.message };
}

/** Map known KPI target write and lifecycle errors onto fields or a banner. */
export function kpiTargetError(error: unknown): MappedApiError {
  if (!(error instanceof ApiError)) return nonApiError(error);
  if (error.code === "KPI_TARGET_APPROVED_IMMUTABLE") {
    return {
      fieldErrors: {},
      formError:
        "This target is approved and can no longer be edited. Create a new version instead.",
    };
  }
  if (error.status === 409 && error.code === "CONFLICT") {
    return { fieldErrors: {}, formError: DUPLICATE_TARGET_MESSAGE };
  }
  // KPI_TARGET_STATE_INVALID and the date/tolerance codes already carry
  // specific, safe server wording.
  if (error.code === "KPI_TARGET_TOLERANCE_INVALID") {
    return { fieldErrors: { maxValue: error.message }, formError: null };
  }
  if (error.code === "KPI_TARGET_DATES_INVALID") {
    return { fieldErrors: { periodEnd: error.message }, formError: null };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return { fieldErrors: {}, formError: error.message };
}

/**
 * The backend returns a single FORBIDDEN code for four distinct cases, so the
 * message is the only discriminator. Known messages get clearer wording; the
 * fallback surfaces the server text verbatim rather than swallowing it.
 */
export function kpiTargetDecisionError(
  error: unknown,
  permission: string,
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Request failed";
  }
  if (error.status === 403) {
    if (error.message === "KPI target self-approval is forbidden") {
      return "You submitted this target, so you cannot approve or reject it. Another user holding kpi-target:approve must decide.";
    }
    if (error.message === "Only the configured KPI target approver may decide") {
      return "Only the approver named on this KPI configuration may approve or reject this target.";
    }
    if (error.message === "A KPI target approver cannot submit the same target") {
      return "You are the configured approver for this KPI, so you cannot also submit its target. Another user must submit it.";
    }
    if (error.message === "Permission denied") {
      return `Your active Company role does not include ${permission}.`;
    }
  }
  return error.message;
}

/**
 * Approve, reject and resubmit share one FORBIDDEN code across several
 * distinct rules, so the message is the only discriminator. Known messages get
 * clearer wording; anything else surfaces the server text verbatim rather than
 * being flattened into a generic failure.
 */
export function kpiActualDecisionError(
  error: unknown,
  permission: string,
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Request failed";
  }
  if (error.code === "EVIDENCE_GATE_NOT_IMPLEMENTED") {
    return "This KPI configuration requires evidence, and the Evidence domain is not implemented yet. Approval is blocked and nothing was saved. Turn off “Requires evidence” on the configuration, or wait for Evidence to ship.";
  }
  if (error.status === 403) {
    if (error.message === "KPI actual self-approval is forbidden") {
      return "You submitted this actual, so you cannot approve or reject it. Another user holding kpi-actual:approve must decide.";
    }
    if (error.message === "Only the configured KPI actual approver may decide") {
      return "Only the approver named on this KPI configuration may approve or reject this actual.";
    }
    if (error.message === "Only the original submitter may resubmit this actual") {
      return "Only the user who submitted this actual may resubmit it.";
    }
    if (error.message === "Permission denied") {
      return `Your active Company role does not include ${permission}.`;
    }
  }
  if (error.code === "KPI_ACTUAL_INVALID_STATE") {
    return error.message;
  }
  return error.message;
}

/** Map known KPI actual submission errors onto form fields or a form banner. */
export function kpiActualSubmissionError(error: unknown): {
  fieldErrors: FieldErrors;
  formError: string | null;
} {
  if (!(error instanceof ApiError)) {
    return {
      fieldErrors: {},
      formError: error instanceof Error ? error.message : "Request failed",
    };
  }
  if (error.code === "KPI_ACTUAL_PERIOD_EXISTS") {
    return {
      fieldErrors: {
        period:
          "An actual already exists for this KPI configuration and period",
      },
      formError: null,
    };
  }
  if (error.code === "KPI_TARGET_NOT_FOUND") {
    return {
      fieldErrors: {
        period:
          "No approved target exists for this KPI and period. Approve a target before submitting an actual.",
      },
      formError: null,
    };
  }
  if (error.code === "KPI_CONFIGURATION_NOT_FOUND") {
    return {
      fieldErrors: {},
      formError:
        "The selected KPI configuration is no longer active for this Company.",
    };
  }
  if (error.code === "EVIDENCE_GATE_NOT_IMPLEMENTED") {
    return {
      fieldErrors: {},
      formError:
        "This KPI requires evidence before approval, and evidence support is not implemented yet.",
    };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return { fieldErrors: {}, formError: error.message };
}
