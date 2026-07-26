import { apiRequest, pageQuery } from "./apiClient";
import type {
  CreateKpiActualInput,
  KpiActual,
  KpiConfiguration,
  KpiTarget,
} from "../types/api";

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
};
