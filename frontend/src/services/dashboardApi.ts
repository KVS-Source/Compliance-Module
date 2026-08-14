import { apiRequest } from "./apiClient";
import type { DashboardSummary } from "../types/api";

export const dashboardApi = {
  async summary() {
    return (await apiRequest<DashboardSummary>("/dashboard/summary")).data;
  },
};
