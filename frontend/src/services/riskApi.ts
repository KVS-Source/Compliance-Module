import { apiRequest } from "./apiClient";
import type { Risk, RiskListQuery, RiskListResult } from "../types/api";

const buildListQuery = (query: RiskListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.lifecycle) params.set("lifecycle", query.lifecycle);
  if (query.status) params.set("status", query.status);
  if (query.kpiRiskClass) params.set("kpiRiskClass", query.kpiRiskClass);
  if (query.generalLevel) params.set("generalLevel", query.generalLevel);
  if (query.q?.trim()) params.set("q", query.q.trim());
  return params.toString();
};

export const riskApi = {
  async list(query: RiskListQuery = {}): Promise<RiskListResult> {
    const response = await apiRequest<Risk[]>(`/risks?${buildListQuery(query)}`);
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
    return (await apiRequest<Risk>(`/risks/${encodeURIComponent(id)}`)).data;
  },
};
