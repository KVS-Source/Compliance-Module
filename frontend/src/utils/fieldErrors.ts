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
