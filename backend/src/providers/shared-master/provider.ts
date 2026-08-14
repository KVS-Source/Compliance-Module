import type {
  Framework,
  FrameworkRule,
  KpiDefinition,
  KpiGoal,
  OrgDepartment,
  OrgLocation,
  OrgUnit,
  Tenant,
  User,
} from "@prisma/client";

export interface PageInput {
  page: number;
  pageSize: number;
  /** Allowlisted column only; never a free-form client string. */
  orderBy?: "code" | "fullName" | "email" | "status" | "createdAt";
  order?: "asc" | "desc";
}

export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface CompanyUser extends User {
  departmentName: string | null;
  roleNames: string[];
}

export interface SharedMasterProvider {
  listTenants(userId: string, page: PageInput): Promise<PageResult<Tenant>>;
  getTenant(id: string): Promise<Tenant | null>;
  listUsers(
    tenantId: string,
    page: PageInput,
  ): Promise<PageResult<CompanyUser>>;
  listDepartments(
    tenantId: string,
    page: PageInput,
  ): Promise<PageResult<OrgDepartment>>;
  listLocations(
    tenantId: string,
    page: PageInput,
  ): Promise<PageResult<OrgLocation>>;
  listOrganisationUnits(
    tenantId: string,
    page: PageInput,
  ): Promise<PageResult<OrgUnit>>;
  listFrameworks(page: PageInput): Promise<PageResult<Framework>>;
  getFrameworkRules(
    frameworkId: string,
    page: PageInput,
  ): Promise<PageResult<FrameworkRule>>;
  listKpiDefinitions(page: PageInput): Promise<PageResult<KpiDefinition>>;
  listKpiGoals(tenantId: string, page: PageInput): Promise<PageResult<KpiGoal>>;
}
