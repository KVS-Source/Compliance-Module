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

export const pageQuery = (page = 1, pageSize = 100) =>
  `?page=${page}&pageSize=${pageSize}`;
