import { apiRequest } from "./apiClient";
import type { ImportBatch, ImportBatchError, ImportBatchErrorListResult, ImportBatchListResult } from "../types/api";

const fallbackMeta = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) });
export const importApi = {
  async list(page = 1, pageSize = 20): Promise<ImportBatchListResult> {
    const response = await apiRequest<ImportBatch[]>(`/imports?page=${page}&pageSize=${pageSize}`);
    return { data: response.data, meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length) };
  },
  async get(id: string) { return (await apiRequest<ImportBatch>(`/imports/${encodeURIComponent(id)}`)).data; },
  async errors(id: string, page = 1, pageSize = 50, sheet?: string): Promise<ImportBatchErrorListResult> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (sheet?.trim()) params.set("sheet", sheet.trim());
    const response = await apiRequest<ImportBatchError[]>(`/imports/${encodeURIComponent(id)}/errors?${params}`);
    return { data: response.data, meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length) };
  },
};
