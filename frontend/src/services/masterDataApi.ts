import { apiRequest, pageQuery } from "./apiClient";
import type {
  CompanyUser,
  Department,
  KpiDefinition,
  KpiGoal,
  Location,
  OrganisationUnit,
} from "../types/api";

export const masterDataApi = {
  async listUsers() {
    return (await apiRequest<CompanyUser[]>(`/users${pageQuery()}`)).data;
  },
  async getUser(id: string) {
    return (await apiRequest<CompanyUser>(`/users/${encodeURIComponent(id)}`)).data;
  },
  async listDepartments() {
    return (
      await apiRequest<Department[]>(`/organisation/departments${pageQuery()}`)
    ).data;
  },
  async listLocations() {
    return (
      await apiRequest<Location[]>(`/organisation/locations${pageQuery()}`)
    ).data;
  },
  async listUnits() {
    return (
      await apiRequest<OrganisationUnit[]>(`/organisation/units${pageQuery()}`)
    ).data;
  },
  async listKpiDefinitions() {
    return (
      await apiRequest<KpiDefinition[]>(`/kpi-definitions${pageQuery()}`)
    ).data;
  },
  async listKpiGoals() {
    return (await apiRequest<KpiGoal[]>(`/kpi-goals${pageQuery()}`)).data;
  },
};
