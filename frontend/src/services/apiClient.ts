import type { ApiFailure, ApiSuccess, AuthResult } from "../types/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "REQUEST_FAILED",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const SERVICE_UNAVAILABLE_MESSAGE =
  "The service is temporarily unavailable. Please retry when the connection is restored.";

let accessToken = "";
let refreshInFlight: Promise<AuthResult> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const clearAccessToken = () => {
  accessToken = "";
};

export const onSessionExpired = (handler: (() => void) | null) => {
  sessionExpiredHandler = handler;
};

/**
 * Read access for transports that cannot use `apiRequest`, such as the Evidence
 * multipart upload and the authenticated Blob download. The token is never
 * persisted and never placed in a URL.
 */
export const getAccessToken = () => accessToken;

/** Terminal 401 handling shared with `apiRequest` for those transports. */
export const expireSession = () => {
  clearAccessToken();
  sessionExpiredHandler?.();
};

const parseResponse = async <T>(response: Response): Promise<ApiSuccess<T>> => {
  let payload: ApiSuccess<T> | ApiFailure | null = null;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    // The envelope error below is safer than leaking an HTML proxy response.
  }
  if (!response.ok || !payload || payload.success === false) {
    const failure = payload && payload.success === false ? payload.error : null;
    throw new ApiError(
      failure?.message ?? `Request failed (${response.status})`,
      response.status,
      failure?.code,
      failure?.details,
    );
  }
  return payload;
};

const requestOnce = async <T>(path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      SERVICE_UNAVAILABLE_MESSAGE,
      0,
      "SERVICE_UNAVAILABLE",
    );
  }
  return { response, payload: await parseResponse<T>(response) };
};

export const isExplicitSessionInvalid = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 401 &&
  error.code === "UNAUTHORIZED";

export const refreshSession = async (): Promise<AuthResult> => {
  if (!refreshInFlight) {
    refreshInFlight = requestOnce<AuthResult>("/auth/refresh", {
      method: "POST",
    })
      .then(({ payload }) => {
        setAccessToken(payload.data.accessToken);
        return payload.data;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status >= 500) {
          throw new ApiError(
            SERVICE_UNAVAILABLE_MESSAGE,
            error.status,
            "SERVICE_UNAVAILABLE",
          );
        }
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

export const apiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<ApiSuccess<T>> => {
  try {
    return (await requestOnce<T>(path, options)).payload;
  } catch (error) {
    if (
      retry &&
      error instanceof ApiError &&
      error.status === 401 &&
      path !== "/auth/refresh" &&
      path !== "/auth/login"
    ) {
      try {
        await refreshSession();
        return await apiRequest<T>(path, options, false);
      } catch (refreshError) {
        if (isExplicitSessionInvalid(refreshError)) {
          clearAccessToken();
          sessionExpiredHandler?.();
          throw new ApiError(
            "Your session has expired. Please sign in again.",
            401,
            "SESSION_EXPIRED",
          );
        }
        throw refreshError;
      }
    }
    throw error;
  }
};

const safeDownloadName = (value: string | null, fallback: string) => {
  let name = (value ?? fallback).normalize("NFC").split(/[/\\]/).pop() ?? fallback;
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/["<>|:*?\\]/g, "_").replace(/^\.+/, "").trim();
  return (name || fallback).slice(0, 200);
};

const dispositionName = (value: string | null) => {
  if (!value) return null;
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded.trim()); } catch { return encoded.trim(); }
  }
  return /filename\s*=\s*"([^"]+)"/i.exec(value)?.[1] ?? /filename\s*=\s*([^;]+)/i.exec(value)?.[1]?.trim() ?? null;
};

const blobOnce = async (path: string, fallbackFilename: string) => {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      headers: {
        Accept: "text/csv, application/octet-stream, application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    throw new ApiError(SERVICE_UNAVAILABLE_MESSAGE, 0, "SERVICE_UNAVAILABLE");
  }
  if (!response.ok) {
    let failure: ApiFailure | null = null;
    try { failure = (await response.json()) as ApiFailure; } catch { /* A proxy may return HTML. */ }
    throw new ApiError(failure?.error.message ?? `Download failed (${response.status})`, response.status, failure?.error.code, failure?.error.details);
  }
  return {
    blob: await response.blob(),
    fileName: safeDownloadName(dispositionName(response.headers.get("content-disposition")), fallbackFilename),
  };
};

/** Authenticated Blob transport with the same one-refresh policy as JSON APIs. */
export const apiBlobRequest = async (path: string, fallbackFilename: string, retry = true): Promise<{ blob: Blob; fileName: string }> => {
  try {
    return await blobOnce(path, fallbackFilename);
  } catch (error) {
    if (retry && error instanceof ApiError && error.status === 401) {
      try {
        await refreshSession();
        return await apiBlobRequest(path, fallbackFilename, false);
      } catch (refreshError) {
        if (isExplicitSessionInvalid(refreshError)) {
          expireSession();
          throw new ApiError("Your session has expired. Please sign in again.", 401, "SESSION_EXPIRED");
        }
        throw refreshError;
      }
    }
    throw error;
  }
};

export const pageQuery = (page = 1, pageSize = 100) =>
  `?page=${page}&pageSize=${pageSize}`;
