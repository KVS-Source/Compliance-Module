import { apiRequest } from "./apiClient";
import type {
  CreateRiskReviewInput,
  CreateRiskTreatmentInput,
  Risk,
  RiskDetail,
  RiskListQuery,
  RiskListResult,
} from "../types/api";

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
    return (await apiRequest<RiskDetail>(`/risks/${encodeURIComponent(id)}`))
      .data;
  },

  async recordReview(id: string, input: CreateRiskReviewInput) {
    return (
      await apiRequest<RiskDetail>(`/risks/${encodeURIComponent(id)}/reviews`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async recordTreatment(id: string, input: CreateRiskTreatmentInput) {
    return (
      await apiRequest<RiskDetail>(
        `/risks/${encodeURIComponent(id)}/treatments`,
        { method: "POST", body: JSON.stringify(input) },
      )
    ).data;
  },

  /** Appends a superseding COMPLETED entry; never edits the original. */
  async completeTreatment(
    id: string,
    treatmentId: string,
    effectivenessNotes: string | null,
  ) {
    return (
      await apiRequest<RiskDetail>(
        `/risks/${encodeURIComponent(id)}/treatments/${encodeURIComponent(treatmentId)}/complete`,
        {
          method: "POST",
          body: JSON.stringify(
            effectivenessNotes ? { effectivenessNotes } : {},
          ),
        },
      )
    ).data;
  },

  async assignOwner(id: string, ownerId: string | null) {
    return (
      await apiRequest<RiskDetail>(`/risks/${encodeURIComponent(id)}/owner`, {
        method: "PATCH",
        body: JSON.stringify({ ownerId }),
      })
    ).data;
  },

  async close(id: string, reason: string) {
    return (
      await apiRequest<RiskDetail>(`/risks/${encodeURIComponent(id)}/close`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      })
    ).data;
  },

  async reopen(id: string, reason: string) {
    return (
      await apiRequest<RiskDetail>(`/risks/${encodeURIComponent(id)}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      })
    ).data;
  },
};
