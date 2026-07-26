export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Company {
  id: string;
  code: string;
  name: string;
  industry: string | null;
  country: string | null;
  status: string;
  created: string;
}

export interface CompanySummary {
  id: string;
  code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  lastLogin: string | null;
  permissions: string[];
  activeCompany: CompanySummary;
  companies: CompanySummary[];
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface CompanyUser {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  roles: Array<string | { id: string; code: string; name: string; status: string }>;
  status: string;
  lastLogin: string | null;
}

export type UserStatus = "ACTIVE" | "DISABLED" | "INVITED" | "LOCKED";

export interface CreateUserInput {
  code: string;
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  status?: UserStatus;
  departmentId?: string | null;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  status?: UserStatus;
  departmentId?: string | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  headName: string | null;
  status: string;
  createdAt: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  type: string | null;
  status: string;
  createdAt: string;
}

export interface OrganisationUnit {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
  headName?: string | null;
  status?: UserStatus;
}

export interface UpdateDepartmentInput {
  name?: string;
  headName?: string | null;
  status?: UserStatus;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  type?: string | null;
  status?: UserStatus;
}

export interface UpdateLocationInput {
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  type?: string | null;
  status?: UserStatus;
}

export interface CreateOrganisationUnitInput {
  code: string;
  name: string;
  status?: UserStatus;
}

export interface UpdateOrganisationUnitInput {
  name?: string;
  status?: UserStatus;
}

export interface Framework {
  id: string;
  code: string;
  name: string;
  version: string;
  description: string | null;
  status: string;
}

export interface FrameworkRule {
  id: string;
  frameworkId: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
}

export interface KpiDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  frequency: string;
  status: string;
}

export interface KpiGoal {
  id: string;
  code: string;
  kpiDefinitionId: string;
  targetValue: string;
  warningValue: string | null;
  criticalValue: string | null;
  period: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
}
