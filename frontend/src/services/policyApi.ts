import { apiRequest } from "./apiClient";
import type {
  ApprovePolicyVersionInput,
  CreatePolicyInput,
  CreatePolicyVersionInput,
  Policy,
  PolicyAuditListResult,
  PolicyDetail,
  PolicyListQuery,
  PolicyListResult,
  PolicyTraceability,
  PolicyVersion,
  RejectPolicyVersionInput,
  ReplacePolicyFrameworksInput,
  UpdatePolicyInput,
  UpdatePolicyVersionInput,
} from "../types/api";

const buildListQuery = (query: PolicyListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.code?.trim()) params.set("code", query.code.trim());
  if (query.title?.trim()) params.set("title", query.title.trim());
  if (query.lifecycleStatus) {
    params.set("lifecycleStatus", query.lifecycleStatus);
  }
  if (query.versionStatus) params.set("versionStatus", query.versionStatus);
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.frameworkId) params.set("frameworkId", query.frameworkId);
  if (query.reviewDueFrom) params.set("reviewDueFrom", query.reviewDueFrom);
  if (query.reviewDueTo) params.set("reviewDueTo", query.reviewDueTo);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.order) params.set("order", query.order);
  return params.toString();
};

const withSignal = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;

export const policyApi = {
  async listPolicies(
    query: PolicyListQuery = {},
    signal?: AbortSignal,
  ): Promise<PolicyListResult> {
    const response = await apiRequest<Policy[]>(
      `/policies?${buildListQuery(query)}`,
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

  async createPolicy(input: CreatePolicyInput, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyDetail>("/policies", {
        method: "POST",
        body: JSON.stringify(input),
        ...withSignal(signal),
      })
    ).data;
  },

  async getPolicy(policyId: string, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyDetail>(
        `/policies/${encodeURIComponent(policyId)}`,
        withSignal(signal),
      )
    ).data;
  },

  async updatePolicy(
    policyId: string,
    input: UpdatePolicyInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyDetail>(
        `/policies/${encodeURIComponent(policyId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async archivePolicy(policyId: string, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyDetail>(
        `/policies/${encodeURIComponent(policyId)}/archive`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async listPolicyVersions(policyId: string, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyVersion[]>(
        `/policies/${encodeURIComponent(policyId)}/versions`,
        withSignal(signal),
      )
    ).data;
  },

  async createPolicyVersion(
    policyId: string,
    input: CreatePolicyVersionInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policies/${encodeURIComponent(policyId)}/versions`,
        {
          method: "POST",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async getPolicyVersion(
    policyId: string,
    versionId: string,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}`,
        withSignal(signal),
      )
    ).data;
  },

  async updatePolicyVersion(
    versionId: string,
    input: UpdatePolicyVersionInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policy-versions/${encodeURIComponent(versionId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async replacePolicyVersionFrameworks(
    versionId: string,
    input: ReplacePolicyFrameworksInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policy-versions/${encodeURIComponent(versionId)}/frameworks`,
        {
          method: "PUT",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async submitPolicyVersion(versionId: string, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyVersion>(
        `/policy-versions/${encodeURIComponent(versionId)}/submit`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async approvePolicyVersion(
    versionId: string,
    input: ApprovePolicyVersionInput = {},
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policy-versions/${encodeURIComponent(versionId)}/approve`,
        {
          method: "POST",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async rejectPolicyVersion(
    versionId: string,
    input: RejectPolicyVersionInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<PolicyVersion>(
        `/policy-versions/${encodeURIComponent(versionId)}/reject`,
        {
          method: "POST",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async getPolicyTraceability(policyId: string, signal?: AbortSignal) {
    return (
      await apiRequest<PolicyTraceability>(
        `/policies/${encodeURIComponent(policyId)}/traceability`,
        withSignal(signal),
      )
    ).data;
  },

  async listPolicyAuditEvents(
    policyId: string,
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<PolicyAuditListResult> {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    const response = await apiRequest<PolicyAuditListResult["data"]>(
      `/policies/${encodeURIComponent(policyId)}/audit-events?${params}`,
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
