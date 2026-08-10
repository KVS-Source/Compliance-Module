import {
  ApiError,
  SERVICE_UNAVAILABLE_MESSAGE,
  apiRequest,
  expireSession,
  getAccessToken,
  isExplicitSessionInvalid,
  refreshSession,
} from "./apiClient";
import type {
  ApiFailure,
  ApiSuccess,
  ApproveEvidenceInput,
  CreateEvidenceInput,
  Evidence,
  EvidenceAuditListResult,
  EvidenceCheckpointLink,
  EvidenceControlLink,
  EvidenceDetail,
  EvidenceDownloadResult,
  EvidenceKpiActualLink,
  EvidenceLinkListResult,
  EvidenceListQuery,
  EvidenceListResult,
  EvidenceReviewDecisionListResult,
  EvidenceReviewQueueQuery,
  EvidenceReviewQueueResult,
  EvidenceUploadOptions,
  RejectEvidenceInput,
  UpdateEvidenceInput,
} from "../types/api";

const DEFAULT_PAGE_SIZE = 20;

/** Mirrors the backend `EVIDENCE_UPLOAD_FIELD` multipart field name. */
const UPLOAD_FIELD = "file";

/** Client-side guidance only; the backend stays authoritative for every rule. */
export const EVIDENCE_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
] as const;

/** Matches the `EVIDENCE_MAX_UPLOAD_BYTES` default (10 MiB). */
export const EVIDENCE_DEFAULT_MAX_UPLOAD_BYTES = 10_485_760;

export const EVIDENCE_UPLOAD_CANCELLED = "EVIDENCE_UPLOAD_CANCELLED";

const evidencePath = (evidenceId: string) =>
  `/evidence/${encodeURIComponent(evidenceId)}`;

const listParams = (query: EvidenceListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
  if (query.q) params.set("q", query.q);
  if (query.lifecycleStatus) params.set("lifecycleStatus", query.lifecycleStatus);
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.expiresBefore) params.set("expiresBefore", query.expiresBefore);
  if (query.expiresAfter) params.set("expiresAfter", query.expiresAfter);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.order) params.set("order", query.order);
  if (query.expiringSoon) params.set("expiringSoon", "true");
  return params.toString();
};

const queueParams = (query: EvidenceReviewQueueQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
  if (query.q) params.set("q", query.q);
  if (query.expiresBefore) params.set("expiresBefore", query.expiresBefore);
  if (query.expiresAfter) params.set("expiresAfter", query.expiresAfter);
  return params.toString();
};

const pageParams = (page = 1, pageSize = DEFAULT_PAGE_SIZE) =>
  `?page=${page}&pageSize=${pageSize}`;

const fallbackMeta = (page: number | undefined, pageSize: number | undefined, total: number) => ({
  page: page ?? 1,
  pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
  total,
  totalPages: 1,
});

/**
 * `apiRequest` cannot carry multipart bodies or Blob responses, so upload and
 * download repeat only its 401 recovery: one refresh, one retry, then the same
 * terminal session-expiry treatment. Nothing else about authentication changes.
 */
const withSessionRetry = async <T>(
  attempt: () => Promise<T>,
): Promise<T> => {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      await refreshSession();
    } catch (refreshError) {
      if (isExplicitSessionInvalid(refreshError)) {
        expireSession();
        throw new ApiError(
          "Your session has expired. Please sign in again.",
          401,
          "SESSION_EXPIRED",
        );
      }
      throw refreshError;
    }
    return attempt();
  }
};

const authHeaders = (accept: string) => {
  const headers: Record<string, string> = { Accept: accept };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const errorFromEnvelope = (
  status: number,
  raw: string,
  fallbackMessage: string,
): ApiError => {
  let payload: ApiSuccess<unknown> | ApiFailure | null = null;
  try {
    payload = JSON.parse(raw) as ApiSuccess<unknown> | ApiFailure;
  } catch {
    // A proxy or storage layer can answer with non-JSON; never surface it.
  }
  const failure = payload && payload.success === false ? payload.error : null;
  return new ApiError(
    failure?.message ?? fallbackMessage,
    status,
    failure?.code,
    failure?.details,
  );
};

/**
 * Real multipart upload with genuine progress and cancellation. `Content-Type`
 * is never set by hand so the browser supplies the multipart boundary.
 */
const uploadOnce = (
  evidenceId: string,
  file: File,
  options: EvidenceUploadOptions,
): Promise<EvidenceDetail> =>
  new Promise<EvidenceDetail>((resolve, reject) => {
    const { signal, onProgress } = options;
    if (signal?.aborted) {
      reject(new ApiError("Upload cancelled", 0, EVIDENCE_UPLOAD_CANCELLED));
      return;
    }

    const body = new FormData();
    body.append(UPLOAD_FIELD, file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1${evidencePath(evidenceId)}/file`);
    xhr.responseType = "text";
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(authHeaders("application/json"))) {
      xhr.setRequestHeader(name, value);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        // Without a computable total there is no honest percentage to show.
        const total = event.lengthComputable ? event.total : null;
        onProgress({
          loaded: event.loaded,
          total,
          percent:
            total && total > 0
              ? Math.min(100, Math.round((event.loaded / total) * 100))
              : null,
        });
      };
    }

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(SERVICE_UNAVAILABLE_MESSAGE, 0, "SERVICE_UNAVAILABLE"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError(SERVICE_UNAVAILABLE_MESSAGE, 0, "SERVICE_UNAVAILABLE"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError("Upload cancelled", 0, EVIDENCE_UPLOAD_CANCELLED));
    };
    xhr.onload = () => {
      cleanup();
      const raw = typeof xhr.response === "string" ? xhr.response : "";
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          errorFromEnvelope(
            xhr.status,
            raw,
            `Upload failed (${xhr.status})`,
          ),
        );
        return;
      }
      let payload: ApiSuccess<EvidenceDetail> | ApiFailure | null = null;
      try {
        payload = JSON.parse(raw) as ApiSuccess<EvidenceDetail> | ApiFailure;
      } catch {
        // Fall through to the envelope error below.
      }
      if (!payload || payload.success === false) {
        reject(
          errorFromEnvelope(xhr.status, raw, "Upload response was not readable"),
        );
        return;
      }
      resolve(payload.data);
    };

    xhr.send(body);
  });

/** Strip anything that could escape a display name or a save dialog. */
const sanitizeDownloadFilename = (value: string | null): string => {
  const fallback = "evidence-file";
  if (!value) return fallback;
  let name = value.normalize("NFC").split(/[/\\]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "");
  name = name.replace(/["<>|:*?\\]/g, "_").trim();
  name = name.replace(/^\.+/, "");
  if (!name) return fallback;
  return name.slice(0, 200);
};

const filenameFromDisposition = (disposition: string | null): string | null => {
  if (!disposition) return null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(disposition);
  if (extended?.[2]) {
    try {
      return decodeURIComponent(extended[2].trim());
    } catch {
      return extended[2].trim();
    }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(disposition);
  if (quoted?.[1]) return quoted[1].replace(/\\(.)/g, "$1");
  const bare = /filename\s*=\s*([^;]+)/i.exec(disposition);
  return bare?.[1]?.trim() ?? null;
};

const downloadOnce = async (
  evidenceId: string,
): Promise<{ blob: Blob; fileName: string }> => {
  let response: Response;
  try {
    response = await fetch(`/api/v1${evidencePath(evidenceId)}/file`, {
      method: "GET",
      credentials: "same-origin",
      headers: authHeaders("application/octet-stream, application/json"),
    });
  } catch {
    throw new ApiError(SERVICE_UNAVAILABLE_MESSAGE, 0, "SERVICE_UNAVAILABLE");
  }
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw errorFromEnvelope(
      response.status,
      raw,
      `Download failed (${response.status})`,
    );
  }
  const blob = await response.blob();
  return {
    blob,
    fileName: sanitizeDownloadFilename(
      filenameFromDisposition(response.headers.get("content-disposition")),
    ),
  };
};

export const evidenceApi = {
  async listEvidence(
    query: EvidenceListQuery = {},
  ): Promise<EvidenceListResult> {
    const response = await apiRequest<Evidence[]>(
      `/evidence?${listParams(query)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async getEvidence(evidenceId: string) {
    return (await apiRequest<EvidenceDetail>(evidencePath(evidenceId))).data;
  },

  async createEvidence(input: CreateEvidenceInput) {
    return (
      await apiRequest<EvidenceDetail>("/evidence", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async updateEvidence(evidenceId: string, input: UpdateEvidenceInput) {
    return (
      await apiRequest<EvidenceDetail>(evidencePath(evidenceId), {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async submitEvidence(evidenceId: string) {
    return (
      await apiRequest<EvidenceDetail>(`${evidencePath(evidenceId)}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    ).data;
  },

  async approveEvidence(evidenceId: string, input: ApproveEvidenceInput = {}) {
    const comment = input.comment?.trim();
    return (
      await apiRequest<EvidenceDetail>(`${evidencePath(evidenceId)}/approve`, {
        method: "POST",
        body: JSON.stringify(comment ? { comment } : {}),
      })
    ).data;
  },

  async rejectEvidence(evidenceId: string, input: RejectEvidenceInput) {
    return (
      await apiRequest<EvidenceDetail>(`${evidencePath(evidenceId)}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: input.reason.trim() }),
      })
    ).data;
  },

  async archiveEvidence(evidenceId: string) {
    return (
      await apiRequest<EvidenceDetail>(`${evidencePath(evidenceId)}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    ).data;
  },

  async listEvidenceReviewQueue(
    query: EvidenceReviewQueueQuery = {},
  ): Promise<EvidenceReviewQueueResult> {
    const response = await apiRequest<EvidenceReviewQueueResult["data"]>(
      `/evidence/review-queue?${queueParams(query)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async listEvidenceReviewDecisions(
    evidenceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<EvidenceReviewDecisionListResult> {
    const response = await apiRequest<EvidenceReviewDecisionListResult["data"]>(
      `${evidencePath(evidenceId)}/review-decisions${pageParams(query.page, query.pageSize)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async listEvidenceAuditEvents(
    evidenceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<EvidenceAuditListResult> {
    const response = await apiRequest<EvidenceAuditListResult["data"]>(
      `${evidencePath(evidenceId)}/audit-events${pageParams(query.page, query.pageSize)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  /**
   * Uploads to one already-created DRAFT Evidence. A 401 retry re-sends the file
   * to the same Evidence ID, so recovery never creates a second record.
   */
  async uploadEvidenceFile(
    evidenceId: string,
    file: File,
    options: EvidenceUploadOptions = {},
  ): Promise<EvidenceDetail> {
    return withSessionRetry(() => uploadOnce(evidenceId, file, options));
  },

  /**
   * Streams the file through an authenticated request and hands the browser a
   * short-lived object URL. No token ever reaches a URL and the object URL is
   * revoked as soon as the download has been handed off.
   */
  async downloadEvidenceFile(
    evidenceId: string,
    fallbackFileName?: string | null,
  ): Promise<EvidenceDownloadResult> {
    const { blob, fileName } = await withSessionRetry(() =>
      downloadOnce(evidenceId),
    );
    const resolvedName =
      fileName === "evidence-file" && fallbackFileName
        ? sanitizeDownloadFilename(fallbackFileName)
        : fileName;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = resolvedName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      // Revoke on the next frame so the navigation has already been queued.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
    return { fileName: resolvedName, byteSize: blob.size };
  },

  async listControlLinks(
    evidenceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<EvidenceLinkListResult<EvidenceControlLink>> {
    const response = await apiRequest<EvidenceControlLink[]>(
      `${evidencePath(evidenceId)}/controls${pageParams(query.page, query.pageSize)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async linkControl(evidenceId: string, controlId: string) {
    return (
      await apiRequest<EvidenceControlLink>(
        `${evidencePath(evidenceId)}/controls/${encodeURIComponent(controlId)}`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },

  async unlinkControl(evidenceId: string, controlId: string) {
    return (
      await apiRequest<EvidenceControlLink>(
        `${evidencePath(evidenceId)}/controls/${encodeURIComponent(controlId)}/unlink`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },

  async listCheckpointLinks(
    evidenceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<EvidenceLinkListResult<EvidenceCheckpointLink>> {
    const response = await apiRequest<EvidenceCheckpointLink[]>(
      `${evidencePath(evidenceId)}/checkpoints${pageParams(query.page, query.pageSize)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async linkCheckpoint(evidenceId: string, checkpointId: string) {
    return (
      await apiRequest<EvidenceCheckpointLink>(
        `${evidencePath(evidenceId)}/checkpoints/${encodeURIComponent(checkpointId)}`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },

  async unlinkCheckpoint(evidenceId: string, checkpointId: string) {
    return (
      await apiRequest<EvidenceCheckpointLink>(
        `${evidencePath(evidenceId)}/checkpoints/${encodeURIComponent(checkpointId)}/unlink`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },

  async listKpiActualLinks(
    evidenceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<EvidenceLinkListResult<EvidenceKpiActualLink>> {
    const response = await apiRequest<EvidenceKpiActualLink[]>(
      `${evidencePath(evidenceId)}/kpi-actuals${pageParams(query.page, query.pageSize)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(query.page, query.pageSize, response.data.length),
    };
  },

  async linkKpiActual(evidenceId: string, kpiActualId: string) {
    return (
      await apiRequest<EvidenceKpiActualLink>(
        `${evidencePath(evidenceId)}/kpi-actuals/${encodeURIComponent(kpiActualId)}`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },

  async unlinkKpiActual(evidenceId: string, kpiActualId: string) {
    return (
      await apiRequest<EvidenceKpiActualLink>(
        `${evidencePath(evidenceId)}/kpi-actuals/${encodeURIComponent(kpiActualId)}/unlink`,
        { method: "POST", body: JSON.stringify({}) },
      )
    ).data;
  },
};
