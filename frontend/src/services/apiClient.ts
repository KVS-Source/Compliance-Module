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
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  return { response, payload: await parseResponse<T>(response) };
};

export const refreshSession = async (): Promise<AuthResult> => {
  if (!refreshInFlight) {
    refreshInFlight = requestOnce<AuthResult>("/auth/refresh", {
      method: "POST",
    })
      .then(({ payload }) => {
        setAccessToken(payload.data.accessToken);
        return payload.data;
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
      } catch {
        clearAccessToken();
        sessionExpiredHandler?.();
        throw new ApiError(
          "Your session has expired. Please sign in again.",
          401,
          "SESSION_EXPIRED",
        );
      }
    }
    throw error;
  }
};

export const pageQuery = (page = 1, pageSize = 100) =>
  `?page=${page}&pageSize=${pageSize}`;
