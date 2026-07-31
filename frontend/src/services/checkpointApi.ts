import { apiRequest } from "./apiClient";
import type {
  Checkpoint,
  CheckpointAuditListResult,
  CheckpointDetail,
  CheckpointListQuery,
  CheckpointListResult,
  CheckpointReview,
  CheckpointReviewListResult,
  CheckpointTraceability,
  CreateCheckpointInput,
  CreateCheckpointReviewInput,
  UpdateCheckpointInput,
} from "../types/api";

const buildListQuery = (query: CheckpointListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.code?.trim()) params.set("code", query.code.trim());
  if (query.title?.trim()) params.set("title", query.title.trim());
  if (query.lifecycleStatus) {
    params.set("lifecycleStatus", query.lifecycleStatus);
  }
  if (query.controlId) params.set("controlId", query.controlId);
  if (query.controlLifecycleStatus) {
    params.set("controlLifecycleStatus", query.controlLifecycleStatus);
  }
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.verificationFrequency) {
    params.set("verificationFrequency", query.verificationFrequency);
  }
  if (query.latestOutcome) params.set("latestOutcome", query.latestOutcome);
  if (query.hasReviews !== undefined) {
    params.set("hasReviews", String(query.hasReviews));
  }
  if (query.evidenceRequired !== undefined) {
    params.set("evidenceRequired", String(query.evidenceRequired));
  }
  if (query.dueFrom) params.set("dueFrom", query.dueFrom);
  if (query.dueTo) params.set("dueTo", query.dueTo);
  if (query.reviewPeriod?.trim()) {
    params.set("reviewPeriod", query.reviewPeriod.trim());
  }
  if (query.frameworkId) params.set("frameworkId", query.frameworkId);
  if (query.policyId) params.set("policyId", query.policyId);
  return params.toString();
};

const withSignal = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;

export const checkpointApi = {
  async listCheckpoints(
    query: CheckpointListQuery = {},
    signal?: AbortSignal,
  ): Promise<CheckpointListResult> {
    const response = await apiRequest<Checkpoint[]>(
      `/checkpoints?${buildListQuery(query)}`,
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

  async createCheckpoint(input: CreateCheckpointInput, signal?: AbortSignal) {
    return (
      await apiRequest<CheckpointDetail>("/checkpoints", {
        method: "POST",
        body: JSON.stringify(input),
        ...withSignal(signal),
      })
    ).data;
  },

  async getCheckpoint(checkpointId: string, signal?: AbortSignal) {
    return (
      await apiRequest<CheckpointDetail>(
        `/checkpoints/${encodeURIComponent(checkpointId)}`,
        withSignal(signal),
      )
    ).data;
  },

  async updateCheckpoint(
    checkpointId: string,
    input: UpdateCheckpointInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<CheckpointDetail>(
        `/checkpoints/${encodeURIComponent(checkpointId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async activateCheckpoint(checkpointId: string, signal?: AbortSignal) {
    return (
      await apiRequest<CheckpointDetail>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/activate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async deactivateCheckpoint(checkpointId: string, signal?: AbortSignal) {
    return (
      await apiRequest<CheckpointDetail>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/deactivate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async archiveCheckpoint(checkpointId: string, signal?: AbortSignal) {
    return (
      await apiRequest<CheckpointDetail>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/archive`,
        {
          method: "POST",
          body: JSON.stringify({}),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async listCheckpointReviews(
    checkpointId: string,
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<CheckpointReviewListResult> {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    const response = await apiRequest<CheckpointReview[]>(
      `/checkpoints/${encodeURIComponent(checkpointId)}/reviews?${params}`,
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

  async createCheckpointReview(
    checkpointId: string,
    input: CreateCheckpointReviewInput,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<CheckpointReview>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/reviews`,
        {
          method: "POST",
          body: JSON.stringify(input),
          ...withSignal(signal),
        },
      )
    ).data;
  },

  async getLatestCheckpointReview(
    checkpointId: string,
    signal?: AbortSignal,
  ): Promise<CheckpointReview | null> {
    return (
      await apiRequest<CheckpointReview | null>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/latest-review`,
        withSignal(signal),
      )
    ).data;
  },

  async getCheckpointTraceability(
    checkpointId: string,
    signal?: AbortSignal,
  ) {
    return (
      await apiRequest<CheckpointTraceability>(
        `/checkpoints/${encodeURIComponent(checkpointId)}/traceability`,
        withSignal(signal),
      )
    ).data;
  },

  async listCheckpointAuditEvents(
    checkpointId: string,
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<CheckpointAuditListResult> {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    const response = await apiRequest<CheckpointAuditListResult["data"]>(
      `/checkpoints/${encodeURIComponent(checkpointId)}/audit-events?${params}`,
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
