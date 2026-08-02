import { apiRequest } from "./apiClient";
import type {
  Capa,
  CapaListQuery,
  CapaListResult,
  CreateCapaInput,
  UpdateCapaInput,
} from "../types/api";

const queryString = (query: CapaListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.gapId) params.set("gapId", query.gapId);
  if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
  return params.toString();
};

export const capaApi = {
  async list(query: CapaListQuery = {}): Promise<CapaListResult> {
    const response = await apiRequest<Capa[]>(`/capas?${queryString(query)}`);
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
    return (await apiRequest<Capa>(`/capas/${encodeURIComponent(id)}`)).data;
  },
  async create(input: CreateCapaInput) {
    return (
      await apiRequest<Capa>("/capas", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async update(id: string, input: UpdateCapaInput) {
    return (
      await apiRequest<Capa>(`/capas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async assignOwner(id: string, ownerId: string | null) {
    return (
      await apiRequest<Capa>(`/capas/${encodeURIComponent(id)}/owner`, {
        method: "PATCH",
        body: JSON.stringify({ ownerId }),
      })
    ).data;
  },
  async close(id: string, closureNote: string) {
    return (
      await apiRequest<Capa>(`/capas/${encodeURIComponent(id)}/close`, {
        method: "POST",
        body: JSON.stringify({ closureNote }),
      })
    ).data;
  },
  async reopen(id: string, reason: string | null) {
    return (
      await apiRequest<Capa>(`/capas/${encodeURIComponent(id)}/reopen`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      })
    ).data;
  },
};
