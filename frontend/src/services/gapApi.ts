import { apiRequest } from "./apiClient";
import type {
  CreateGapInput,
  Gap,
  GapListQuery,
  GapListResult,
  UpdateGapInput,
} from "../types/api";

const queryString = (query: GapListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  if (query.severity) params.set("severity", query.severity);
  if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.order) params.set("order", query.order);
  return params.toString();
};

export const gapApi = {
  async list(query: GapListQuery = {}): Promise<GapListResult> {
    const response = await apiRequest<Gap[]>(`/gaps?${queryString(query)}`);
    return {
      data: response.data,
      meta: response.meta ?? {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: response.data.length,
        totalPages: 1,
      },
    };
  },

  async get(id: string) {
    return (await apiRequest<Gap>(`/gaps/${encodeURIComponent(id)}`)).data;
  },

  async create(input: CreateGapInput) {
    return (
      await apiRequest<Gap>("/gaps", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async update(id: string, input: UpdateGapInput) {
    return (
      await apiRequest<Gap>(`/gaps/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async assignOwner(id: string, ownerId: string | null) {
    return (
      await apiRequest<Gap>(`/gaps/${encodeURIComponent(id)}/owner`, {
        method: "PATCH",
        body: JSON.stringify({ ownerId }),
      })
    ).data;
  },

  async close(id: string, closureNote: string) {
    return (
      await apiRequest<Gap>(`/gaps/${encodeURIComponent(id)}/close`, {
        method: "POST",
        body: JSON.stringify({ closureNote }),
      })
    ).data;
  },

  async reopen(id: string, reason: string | null) {
    return (
      await apiRequest<Gap>(`/gaps/${encodeURIComponent(id)}/reopen`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      })
    ).data;
  },
};
