import { apiRequest, pageQuery } from "./apiClient";
import type {
  CreateKpiActualInput,
  CreateKpiConfigurationInput,
  CreateKpiTargetInput,
  KpiActual,
  KpiActualListQuery,
  KpiActualListResult,
  KpiActualRecord,
  KpiConfiguration,
  KpiConfigurationListQuery,
  KpiConfigurationListResult,
  KpiTarget,
  KpiTargetListQuery,
  KpiTargetListResult,
  KpiThresholdDefaults,
  UpdateKpiConfigurationInput,
  UpdateKpiTargetInput,
  VersionKpiTargetInput,
} from "../types/api";

const DEFAULT_PAGE_SIZE = 20;

const buildConfigurationQuery = (query: KpiConfigurationListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
  if (query.kpiDefinitionId) params.set("kpiDefinitionId", query.kpiDefinitionId);
  if (query.status) params.set("status", query.status);
  if (query.enabled !== undefined) params.set("enabled", String(query.enabled));
  return params.toString();
};

const buildTargetQuery = (query: KpiTargetListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
  if (query.kpiConfigurationId) {
    params.set("kpiConfigurationId", query.kpiConfigurationId);
  }
  if (query.approvalStatus) params.set("approvalStatus", query.approvalStatus);
  if (query.status) params.set("status", query.status);
  return params.toString();
};

export const kpiApi = {
  async listActiveConfigurations() {
    return (
      await apiRequest<KpiConfiguration[]>(
        `/kpi-configurations${pageQuery()}&enabled=true&status=ACTIVE`,
      )
    ).data;
  },

  async listApprovedTargets(kpiConfigurationId: string) {
    return (
      await apiRequest<KpiTarget[]>(
        `/kpi-targets${pageQuery()}&kpiConfigurationId=${encodeURIComponent(kpiConfigurationId)}&approvalStatus=APPROVED&status=ACTIVE`,
      )
    ).data;
  },

  async submitActual(input: CreateKpiActualInput) {
    return (
      await apiRequest<KpiActual>("/kpi-actuals", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async listActuals(
    query: KpiActualListQuery = {},
  ): Promise<KpiActualListResult> {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
    if (query.approvalStatus) params.set("approvalStatus", query.approvalStatus);
    if (query.kpiConfigurationId) {
      params.set("kpiConfigurationId", query.kpiConfigurationId);
    }
    if (query.kpiDefinitionId) {
      params.set("kpiDefinitionId", query.kpiDefinitionId);
    }
    if (query.ragStatus) params.set("ragStatus", query.ragStatus);
    if (query.awaitingMyDecision) params.set("awaitingMyDecision", "true");
    const response = await apiRequest<KpiActualRecord[]>(
      `/kpi-actuals?${params.toString()}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
        total: response.data.length,
        totalPages: 1,
      },
    };
  },

  async getActual(id: string) {
    return (
      await apiRequest<KpiActualRecord>(
        `/kpi-actuals/${encodeURIComponent(id)}`,
      )
    ).data;
  },

  async approveActual(id: string, comments: string | null) {
    return (
      await apiRequest<KpiActual>(
        `/kpi-actuals/${encodeURIComponent(id)}/approve`,
        {
          method: "POST",
          body: JSON.stringify(comments ? { comments } : {}),
        },
      )
    ).data;
  },

  async rejectActual(id: string, reason: string) {
    return (
      await apiRequest<KpiActual>(
        `/kpi-actuals/${encodeURIComponent(id)}/reject`,
        { method: "POST", body: JSON.stringify({ reason }) },
      )
    ).data;
  },

  async resubmitActual(id: string, comments: string | null) {
    return (
      await apiRequest<KpiActual>(
        `/kpi-actuals/${encodeURIComponent(id)}/resubmit`,
        {
          method: "POST",
          body: JSON.stringify(comments ? { comments } : {}),
        },
      )
    ).data;
  },

  /** Company defaults used when a configuration leaves its overrides null. */
  async getThresholdDefaults() {
    return (
      await apiRequest<KpiThresholdDefaults>(
        "/kpi-configurations/threshold-defaults",
      )
    ).data;
  },

  async listConfigurations(
    query: KpiConfigurationListQuery = {},
  ): Promise<KpiConfigurationListResult> {
    const response = await apiRequest<KpiConfiguration[]>(
      `/kpi-configurations?${buildConfigurationQuery(query)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
        total: response.data.length,
        totalPages: 1,
      },
    };
  },

  async getConfiguration(id: string) {
    return (
      await apiRequest<KpiConfiguration>(
        `/kpi-configurations/${encodeURIComponent(id)}`,
      )
    ).data;
  },

  async createConfiguration(input: CreateKpiConfigurationInput) {
    return (
      await apiRequest<KpiConfiguration>("/kpi-configurations", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async updateConfiguration(id: string, input: UpdateKpiConfigurationInput) {
    return (
      await apiRequest<KpiConfiguration>(
        `/kpi-configurations/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      )
    ).data;
  },

  async deleteConfiguration(id: string) {
    return (
      await apiRequest<KpiConfiguration>(
        `/kpi-configurations/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
    ).data;
  },

  async listTargets(
    query: KpiTargetListQuery = {},
  ): Promise<KpiTargetListResult> {
    const response = await apiRequest<KpiTarget[]>(
      `/kpi-targets?${buildTargetQuery(query)}`,
    );
    return {
      data: response.data,
      meta: response.meta ?? {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
        total: response.data.length,
        totalPages: 1,
      },
    };
  },

  async createTarget(input: CreateKpiTargetInput) {
    return (
      await apiRequest<KpiTarget>("/kpi-targets", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async updateTarget(id: string, input: UpdateKpiTargetInput) {
    return (
      await apiRequest<KpiTarget>(`/kpi-targets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async deleteTarget(id: string) {
    return (
      await apiRequest<KpiTarget>(`/kpi-targets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    ).data;
  },

  async submitTarget(id: string) {
    return (
      await apiRequest<KpiTarget>(
        `/kpi-targets/${encodeURIComponent(id)}/submit`,
        { method: "POST" },
      )
    ).data;
  },

  async approveTarget(id: string) {
    return (
      await apiRequest<KpiTarget>(
        `/kpi-targets/${encodeURIComponent(id)}/approve`,
        { method: "POST" },
      )
    ).data;
  },

  async rejectTarget(id: string, reason: string) {
    return (
      await apiRequest<KpiTarget>(
        `/kpi-targets/${encodeURIComponent(id)}/reject`,
        { method: "POST", body: JSON.stringify({ reason }) },
      )
    ).data;
  },

  async createTargetVersion(id: string, input: VersionKpiTargetInput) {
    return (
      await apiRequest<KpiTarget>(
        `/kpi-targets/${encodeURIComponent(id)}/versions`,
        { method: "POST", body: JSON.stringify(input) },
      )
    ).data;
  },
};
