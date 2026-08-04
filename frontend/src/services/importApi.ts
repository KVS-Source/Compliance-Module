import { API_BASE_URL } from "../config/api";
import {
  ApiError,
  expireSession,
  getAccessToken,
  apiRequest,
} from "./apiClient";
import type {
  ImportBatch,
  ImportBatchError,
  ImportBatchErrorListResult,
  ImportBatchListResult,
} from "../types/api";

const fallbackMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export type ImportPreviewResponse = {
  importId: string;
  alreadyImported: boolean;
  csvImportType?: string;
  preview: {
    workbook: {
      filename: string;
      checksum: string;
      byteSize: number;
      sheetCount: number;
    };
    sheets: Array<{
      key: string;
      sheetName: string;
      target: string;
      present: boolean;
      totalRows: number;
      validRows: number;
      errorRows: number;
      flaggedRows: number;
      missingHeaders: string[];
      reason?: string;
    }>;
    unmappedSheets: string[];
    issues: Array<{
      sheet: string;
      rowNumber: number;
      businessKey: string | null;
      field: string;
      message: string;
    }>;
    totals: {
      totalRows: number;
      validRows: number;
      errorRows: number;
      flaggedRows: number;
    };
  };
};

export type ImportCommitResponse = {
  batchId: string;
  status: string;
  alreadyImported: boolean;
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    errors: number;
  };
  totals: ImportPreviewResponse["preview"]["totals"];
  issues: ImportPreviewResponse["preview"]["issues"];
  sheets: ImportPreviewResponse["preview"]["sheets"];
};

export type CsvTemplateMeta = {
  type: string;
  label: string;
  headers: string[];
  sheetKey: string;
};

const uploadPreview = async (
  path: string,
  file: File,
): Promise<ImportPreviewResponse> => {
  const body = new FormData();
  body.append("file", file);
  const headers = new Headers({ Accept: "application/json" });
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
    });
  } catch {
    throw new ApiError("Upload failed", 0, "NETWORK_ERROR");
  }
  if (response.status === 401) {
    expireSession();
    throw new ApiError("Session expired", 401, "UNAUTHORIZED");
  }
  const payload = (await response.json()) as {
    success: boolean;
    data?: ImportPreviewResponse;
    error?: { message?: string; code?: string };
  };
  if (!response.ok || !payload.success || !payload.data) {
    throw new ApiError(
      payload.error?.message ?? `Upload failed (${response.status})`,
      response.status,
      payload.error?.code,
    );
  }
  return payload.data;
};

export const importApi = {
  async list(page = 1, pageSize = 20): Promise<ImportBatchListResult> {
    const response = await apiRequest<ImportBatch[]>(
      `/imports?page=${page}&pageSize=${pageSize}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length),
    };
  },
  async get(id: string) {
    return (
      await apiRequest<ImportBatch>(`/imports/${encodeURIComponent(id)}`)
    ).data;
  },
  async errors(
    id: string,
    page = 1,
    pageSize = 50,
    sheet?: string,
  ): Promise<ImportBatchErrorListResult> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (sheet?.trim()) params.set("sheet", sheet.trim());
    const response = await apiRequest<ImportBatchError[]>(
      `/imports/${encodeURIComponent(id)}/errors?${params}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length),
    };
  },
  async listCsvTemplates() {
    return (await apiRequest<CsvTemplateMeta[]>("/imports/csv/templates")).data;
  },
  previewWorkbook(file: File) {
    return uploadPreview("/imports/workbook/preview", file);
  },
  previewCsv(file: File, type: string) {
    return uploadPreview(
      `/imports/csv/preview?type=${encodeURIComponent(type)}`,
      file,
    );
  },
  async commit(importId: string) {
    return (
      await apiRequest<ImportCommitResponse>(
        `/imports/${encodeURIComponent(importId)}/commit`,
        { method: "POST", body: "{}" },
      )
    ).data;
  },
  templateUrl(type: string) {
    return `${API_BASE_URL}/imports/csv/templates/${encodeURIComponent(type)}`;
  },
};
