import { apiBlobRequest, apiRequest } from "./apiClient";
import type {
  AccessProfileResponse,
  KpiAnalytics,
  KpiCatalogueEntry,
  KpiFrequencyEntry,
  ReportCatalogueEntry,
  ReportResult,
} from "../types/api";

/**
 * Read-only submission modules: Role & Access, Frequency Master, the KPI
 * Catalogue, KPI Analytics and the Report Hub.
 *
 * None of these carry a Company identifier: the API derives scope from the
 * signed token, so the client cannot ask for another Company's rows.
 */
const query = (filters: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
};

export const accessApi = {
  async profiles() {
    return (await apiRequest<AccessProfileResponse>("/access/profiles")).data;
  },
};

export const kpiCatalogueApi = {
  async catalogue() {
    return (await apiRequest<KpiCatalogueEntry[]>("/kpis/catalogue")).data;
  },
  async frequencies() {
    return (await apiRequest<KpiFrequencyEntry[]>("/kpis/frequencies")).data;
  },
  async analytics(filters: {
    frequency?: string;
    ownerId?: string;
    departmentId?: string;
    period?: string;
  }) {
    return (
      await apiRequest<KpiAnalytics>(`/kpis/analytics${query(filters)}`)
    ).data;
  },
};

export const reportApi = {
  async catalogue() {
    return (await apiRequest<ReportCatalogueEntry[]>("/reports")).data;
  },
  async run(key: string, filters: Record<string, string | undefined>) {
    return (
      await apiRequest<ReportResult>(
        `/reports/${encodeURIComponent(key)}${query(filters)}`,
      )
    ).data;
  },
  downloadCsv(key: string, filters: Record<string, string | undefined>) {
    return apiBlobRequest(
      `/reports/${encodeURIComponent(key)}/export.csv${query(filters)}`,
      `report-${key}.csv`,
    );
  },
};
