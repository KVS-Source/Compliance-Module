import { apiRequest } from "./apiClient";
import type {
  Control,
  ControlAuditListResult,
  ControlDetail,
  ControlListQuery,
  ControlListResult,
  ControlTraceability,
  CreateControlInput,
  ReplaceControlFrameworkRulesInput,
  ReplaceControlFrameworksInput,
  ReplaceControlPolicyVersionsInput,
  UpdateControlInput,
} from "../types/api";

const buildListQuery = (query: ControlListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.code?.trim()) params.set("code", query.code.trim());
  if (query.title?.trim()) params.set("title", query.title.trim());
  if (query.implementationStatus) {
    params.set("implementationStatus", query.implementationStatus);
  }
  if (query.lifecycleStatus) {
    params.set("lifecycleStatus", query.lifecycleStatus);
  }
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.controlType) params.set("controlType", query.controlType);
  if (query.frequency) params.set("frequency", query.frequency);
  if (query.policyId) params.set("policyId", query.policyId);
  if (query.policyVersionId) {
    params.set("policyVersionId", query.policyVersionId);
  }
  if (query.frameworkId) params.set("frameworkId", query.frameworkId);
  if (query.frameworkRuleId) {
    params.set("frameworkRuleId", query.frameworkRuleId);
  }
  if (query.requiresEvidence !== undefined) {
    params.set("requiresEvidence", String(query.requiresEvidence));
  }
  if (query.reviewDueFrom) params.set("reviewDueFrom", query.reviewDueFrom);
  if (query.reviewDueTo) params.set("reviewDueTo", query.reviewDueTo);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.order) params.set("order", query.order);
  return params.toString();
};

const withSignal = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;

export const controlApi = {
  async listControls(
    query: ControlListQuery = {},
    signal?: AbortSignal,
  ): Promise<ControlListResult> {
    const response = await apiRequest<Control[]>(
      `/controls?${buildListQuery(query)}`,
      withSignal(signal),
    );
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

  async createControl(input: CreateControlInput, signal?: AbortSignal) {
    return (
      await apiRequest<ControlDetail>("/controls", {
        method: "POST",
        body: JSON.stringify(input),
        ...withSignal(signal),
      })
    ).data;
  },

  async getControl(controlId: string, signal?: AbortSignal) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}`,
        withSignal(signal),
      )
    ).data;
  },

  async updateControl(
    controlId: string,
    input: UpdateControlInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async activateControl(controlId: string, signal?: AbortSignal) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/activate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async deactivateControl(controlId: string, signal?: AbortSignal) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/deactivate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async archiveControl(controlId: string, signal?: AbortSignal) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/archive`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async replaceControlPolicyVersions(
    controlId: string,
    input: ReplaceControlPolicyVersionsInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/policy-versions`,
        {
          method: "PUT",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async replaceControlFrameworks(
    controlId: string,
    input: ReplaceControlFrameworksInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/frameworks`,
        {
          method: "PUT",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async replaceControlFrameworkRules(
    controlId: string,
    input: ReplaceControlFrameworkRulesInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<ControlDetail>(
        `/controls/${encodeURIComponent(controlId)}/framework-rules`,
        {
          method: "PUT",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async getControlTraceability(controlId: string, signal?: AbortSignal) {
    return (
      await apiRequest<ControlTraceability>(
        `/controls/${encodeURIComponent(controlId)}/traceability`,
        withSignal(signal),
      )
    ).data;
  },

  async listControlAuditEvents(
    controlId: string,
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<ControlAuditListResult> {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    const response = await apiRequest<ControlAuditListResult["data"]>(
      `/controls/${encodeURIComponent(controlId)}/audit-events?${params}`,
      withSignal(signal),
    );
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
};
