import { apiBlobRequest } from "./apiClient";

export type CsvExportModule = "gaps" | "capas" | "risks" | "evidence" | "kpi-actuals";

export const exportApi = {
  download(module: CsvExportModule) {
    return apiBlobRequest(`/exports/${module}.csv`, `${module}.csv`);
  },
  downloadRegister(registerCode: string) {
    return apiBlobRequest(`/exports/operational-registers/${encodeURIComponent(registerCode)}.csv`, `register-${registerCode.toLowerCase()}.csv`);
  },
};
