import { apiRequest, pageQuery } from "./apiClient";
import type { Framework, FrameworkRule } from "../types/api";

export const frameworkApi = {
  async list() {
    return (await apiRequest<Framework[]>(`/frameworks${pageQuery()}`)).data;
  },
  async get(id: string) {
    return (await apiRequest<Framework>(`/frameworks/${encodeURIComponent(id)}`)).data;
  },
  async listRules(id: string) {
    return (
      await apiRequest<FrameworkRule[]>(
        `/frameworks/${encodeURIComponent(id)}/rules${pageQuery()}`,
      )
    ).data;
  },
};
