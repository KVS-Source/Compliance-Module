import { apiRequest, pageQuery } from "./apiClient";
import type {
  CompanyUser,
  CreateDepartmentInput,
  CreateLocationInput,
  CreateOrganisationUnitInput,
  CreateUserInput,
  Department,
  KpiDefinition,
  KpiGoal,
  Location,
  OrganisationUnit,
  UpdateDepartmentInput,
  UpdateLocationInput,
  UpdateOrganisationUnitInput,
  UpdateUserInput,
} from "../types/api";

export const masterDataApi = {
  async listUsers(query: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    order?: "asc" | "desc";
  } = {}) {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.orderBy) params.set("orderBy", query.orderBy);
    if (query.order) params.set("order", query.order);
    return (
      await apiRequest<CompanyUser[]>(`/users?${params.toString()}`)
    ).data;
  },
  async getUser(id: string) {
    return (await apiRequest<CompanyUser>(`/users/${encodeURIComponent(id)}`)).data;
  },
  async createUser(input: CreateUserInput) {
    return (
      await apiRequest<CompanyUser>("/users", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async updateUser(id: string, input: UpdateUserInput) {
    return (
      await apiRequest<CompanyUser>(`/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async listDepartments() {
    return (
      await apiRequest<Department[]>(`/organisation/departments${pageQuery()}`)
    ).data;
  },
  async createDepartment(input: CreateDepartmentInput) {
    return (
      await apiRequest<Department>("/organisation/departments", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async updateDepartment(id: string, input: UpdateDepartmentInput) {
    return (
      await apiRequest<Department>(
        `/organisation/departments/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      )
    ).data;
  },
  async listLocations() {
    return (
      await apiRequest<Location[]>(`/organisation/locations${pageQuery()}`)
    ).data;
  },
  async createLocation(input: CreateLocationInput) {
    return (
      await apiRequest<Location>("/organisation/locations", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async updateLocation(id: string, input: UpdateLocationInput) {
    return (
      await apiRequest<Location>(
        `/organisation/locations/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      )
    ).data;
  },
  async listUnits() {
    return (
      await apiRequest<OrganisationUnit[]>(`/organisation/units${pageQuery()}`)
    ).data;
  },
  async createUnit(input: CreateOrganisationUnitInput) {
    return (
      await apiRequest<OrganisationUnit>("/organisation/units", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async updateUnit(id: string, input: UpdateOrganisationUnitInput) {
    return (
      await apiRequest<OrganisationUnit>(
        `/organisation/units/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      )
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
