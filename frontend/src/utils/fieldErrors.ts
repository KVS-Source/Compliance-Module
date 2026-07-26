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
