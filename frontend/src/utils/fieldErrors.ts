import { ApiError } from "../services/apiClient";

export type FieldErrors = Record<string, string>;

export const SAFE_DECIMAL_MESSAGE =
  "Enter a valid number with up to 14 digits before the decimal and up to 4 digits after it.";

const safeValidationMessage = (message: string) =>
  /decimal\s*\(\s*18\s*,\s*4\s*\)/i.test(message)
    ? SAFE_DECIMAL_MESSAGE
    : message;

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
    fields[detail.path] = safeValidationMessage(detail.message);
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

/**
 * Map risk review, treatment, closure and reopen errors. The reopen conflict
 * gets specific wording because a bare 409 would not explain that another live
 * risk on the same KPI actual is the blocker.
 */
export function riskWorkflowError(
  error: unknown,
  permission: string,
): MappedApiError {
  if (!(error instanceof ApiError)) return nonApiError(error);
  if (error.code === "RISK_ACTIVE_DUPLICATE_FOR_ACTUAL") {
    return { fieldErrors: {}, formError: error.message };
  }
  if (
    error.code === "RISK_STATUS_TRANSITION_INVALID" ||
    error.code === "RISK_TREATMENT_ALREADY_COMPLETED" ||
    error.code === "RISK_TREATMENT_CANCELLED" ||
    error.code === "RISK_TREATMENT_SUPERSEDED"
  ) {
    return { fieldErrors: {}, formError: error.message };
  }
  if (error.code === "RELATED_RECORD_INVALID") {
    const field = error.message.toLowerCase().includes("owner")
      ? "ownerId"
      : null;
    return field
      ? { fieldErrors: { [field]: error.message }, formError: null }
      : { fieldErrors: {}, formError: error.message };
  }
  if (error.status === 403 && error.message === "Permission denied") {
    return {
      fieldErrors: {},
      formError: `Your active Company role does not include ${permission}.`,
    };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return { fieldErrors: {}, formError: error.message };
}

const POLICY_GENERIC_FALLBACK =
  "The request could not be completed. Refresh the page and try again.";

/**
 * Map Policy write, Version, Framework and archive errors onto form fields or a
 * banner. Domain codes from the Policy module are preferred over raw status.
 */
export function policyWriteError(
  error: unknown,
  permission: string,
): MappedApiError {
  if (!(error instanceof ApiError)) return nonApiError(error);

  if (error.code === "EVIDENCE_GATE_NOT_IMPLEMENTED") {
    return {
      fieldErrors: {},
      formError:
        "This Policy requires Evidence. Evidence Management is not available yet, so this Version cannot be approved.",
    };
  }
  if (error.code === "POLICY_SELF_APPROVAL_FORBIDDEN") {
    return {
      fieldErrors: {},
      formError:
        "You cannot approve a Policy Version that you submitted.",
    };
  }
  if (error.code === "POLICY_APPROVER_INVALID") {
    return {
      fieldErrors: {},
      formError:
        "This Policy Version is assigned to another approver or your approval access is no longer valid.",
    };
  }
  if (error.code === "POLICY_NOT_FOUND") {
    return {
      fieldErrors: {},
      formError: "This Policy is not available in the active Company.",
    };
  }
  if (error.code === "POLICY_VERSION_NOT_FOUND") {
    return {
      fieldErrors: {},
      formError: "This Policy Version is not available in the active Company.",
    };
  }
  if (error.code === "POLICY_ARCHIVED") {
    return {
      fieldErrors: {},
      formError:
        "This Policy is archived and can no longer be changed.",
    };
  }
  if (
    error.code === "POLICY_VERSION_IMMUTABLE" ||
    error.code === "POLICY_VERSION_CONFLICT"
  ) {
    return {
      fieldErrors: {},
      formError:
        "This Policy Version can no longer be edited. Refresh to see its current state.",
    };
  }
  if (
    error.code === "POLICY_VERSION_INVALID_STATE" ||
    error.code === "POLICY_CURRENT_VERSION_CONFLICT"
  ) {
    return {
      fieldErrors: {},
      formError: error.message || POLICY_GENERIC_FALLBACK,
    };
  }
  if (error.code === "POLICY_CONTENT_HTML_FORBIDDEN") {
    return {
      fieldErrors: {
        content: "Raw HTML is not permitted in Policy content.",
      },
      formError: null,
    };
  }
  if (error.code === "POLICY_CONTENT_INVALID") {
    return {
      fieldErrors: { content: error.message },
      formError: null,
    };
  }
  if (error.code === "RELATED_RECORD_INVALID") {
    const message = error.message.toLowerCase();
    const field = message.includes("owner")
      ? "ownerId"
      : message.includes("department")
        ? "departmentId"
        : message.includes("approver")
          ? "requestedApproverId"
          : message.includes("framework")
            ? "frameworkIds"
            : null;
    return field
      ? { fieldErrors: { [field]: error.message }, formError: null }
      : { fieldErrors: {}, formError: error.message };
  }
  if (error.status === 403) {
    if (error.message === "Permission denied") {
      return {
        fieldErrors: {},
        formError: `Your active Company role does not include ${permission}.`,
      };
    }
    return { fieldErrors: {}, formError: error.message };
  }
  if (error.code === "VALIDATION_ERROR" || error.status === 400) {
    const details = fieldErrorsFromApi(error);
    if (Object.keys(details).length > 0) {
      return { fieldErrors: details, formError: null };
    }
    return {
      fieldErrors: {},
      formError: error.message || POLICY_GENERIC_FALLBACK,
    };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return {
    fieldErrors: {},
    formError: error.message || POLICY_GENERIC_FALLBACK,
  };
}

/** Decision-banner mapper for submit / approve / reject. */
export function policyDecisionError(
  error: unknown,
  permission: string,
): string {
  return (
    policyWriteError(error, permission).formError ??
    (error instanceof Error ? error.message : POLICY_GENERIC_FALLBACK)
  );
}

const CONTROL_GENERIC_FALLBACK =
  "The request could not be completed. Refresh the page and try again.";

/**
 * Map Control write, lifecycle and mapping errors onto form fields or a banner.
 * Domain codes from the Control module are preferred over raw status.
 */
export function controlWriteError(
  error: unknown,
  permission: string,
): MappedApiError {
  if (!(error instanceof ApiError)) return nonApiError(error);

  if (error.code === "CONTROL_HAS_ACTIVE_CHECKPOINTS") {
    return {
      fieldErrors: {},
      formError:
        "This Control still has active Checkpoints. Deactivate or archive those Checkpoints before archiving the Control.",
    };
  }
  if (error.code === "CONTROL_NOT_FOUND") {
    return {
      fieldErrors: {},
      formError: "This Control is not available in the active Company.",
    };
  }
  if (error.code === "CONTROL_INVALID_STATE") {
    const message = error.message.toLowerCase();
    if (
      message.includes("framework") &&
      (message.includes("rule") || message.includes("depend"))
    ) {
      return {
        fieldErrors: {},
        formError:
          "This Framework cannot be removed while active Framework Rule mappings still depend on it.",
      };
    }
    return {
      fieldErrors: {},
      formError: error.message || CONTROL_GENERIC_FALLBACK,
    };
  }
  if (error.code === "CONTROL_MAPPING_INVALID") {
    const message = error.message.toLowerCase();
    if (
      message.includes("framework rule") &&
      message.includes("framework mapping")
    ) {
      return {
        fieldErrors: {
          frameworkRuleIds:
            "Map the Rule’s Framework to this Control before selecting the Rule.",
        },
        formError: null,
      };
    }
    if (message.includes("approved")) {
      return {
        fieldErrors: {
          policyVersionIds:
            "Only APPROVED Policy Versions may be actively mapped.",
        },
        formError: null,
      };
    }
    if (message.includes("same policy") || message.includes("two versions")) {
      return {
        fieldErrors: {
          policyVersionIds:
            "A Control cannot map two Versions of the same Policy at once.",
        },
        formError: null,
      };
    }
    return {
      fieldErrors: {},
      formError: error.message || CONTROL_GENERIC_FALLBACK,
    };
  }
  if (error.code === "RELATED_RECORD_INVALID") {
    const message = error.message.toLowerCase();
    const field = message.includes("owner") || message.includes("user")
      ? "ownerId"
      : message.includes("department")
        ? "departmentId"
        : message.includes("framework rule") || message.includes("rule")
          ? "frameworkRuleIds"
          : message.includes("framework")
            ? "frameworkIds"
            : message.includes("policy version") || message.includes("policy")
              ? "policyVersionIds"
              : null;
    return field
      ? { fieldErrors: { [field]: error.message }, formError: null }
      : { fieldErrors: {}, formError: error.message };
  }
  if (
    error.code === "VALIDATION_ERROR" &&
    /not_applicable|implementation notes/i.test(error.message)
  ) {
    return {
      fieldErrors: {
        implementationNotes:
          "NOT_APPLICABLE Controls require implementation notes.",
      },
      formError: null,
    };
  }
  if (error.status === 403) {
    if (error.message === "Permission denied") {
      return {
        fieldErrors: {},
        formError: `Your active Company role does not include ${permission}.`,
      };
    }
    return { fieldErrors: {}, formError: error.message };
  }
  if (error.code === "VALIDATION_ERROR" || error.status === 400) {
    const details = fieldErrorsFromApi(error);
    if (Object.keys(details).length > 0) {
      return { fieldErrors: details, formError: null };
    }
    return {
      fieldErrors: {},
      formError: error.message || CONTROL_GENERIC_FALLBACK,
    };
  }
  const details = fieldErrorsFromApi(error);
  if (Object.keys(details).length > 0) {
    return { fieldErrors: details, formError: null };
  }
  return {
    fieldErrors: {},
    formError: error.message || CONTROL_GENERIC_FALLBACK,
  };
}

/** Lifecycle-banner mapper for activate / deactivate / archive. */
export function controlLifecycleError(
  error: unknown,
  permission: string,
): string {
  return (
    controlWriteError(error, permission).formError ??
    (error instanceof Error ? error.message : CONTROL_GENERIC_FALLBACK)
  );
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
