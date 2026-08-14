import type {
  ComplianceTask,
  TaskInput,
  TaskListQuery,
  TaskListResult,
  UpdateTaskInput,
} from "../types/api";
import { apiRequest } from "./apiClient";

const queryString = (query: TaskListQuery) => {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.ownerId) params.set("ownerId", query.ownerId);
  if (query.linkedEntityType) {
    params.set("linkedEntityType", query.linkedEntityType);
  }
  if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.order) params.set("order", query.order);
  return params.toString();
};

export const taskApi = {
  async list(query: TaskListQuery = {}): Promise<TaskListResult> {
    const response = await apiRequest<ComplianceTask[]>(
      `/tasks?${queryString(query)}`,
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
  async create(input: TaskInput) {
    return (
      await apiRequest<ComplianceTask>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async update(id: string, input: UpdateTaskInput) {
    return (
      await apiRequest<ComplianceTask>(`/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async delete(id: string) {
    return (
      await apiRequest<{ deleted: true; id: string }>(
        `/tasks/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
    ).data;
  },
};
