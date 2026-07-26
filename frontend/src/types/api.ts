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

export type KpiDirection =
  | "HIGHER_IS_BETTER"
  | "LOWER_IS_BETTER"
  | "TARGET_EXACT"
  | "INFORMATIONAL";

export type KpiFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "ANNUAL"
  | "CONTINUOUS"
  | "PER_EVENT"
  | "ONE_TIME";

export type RagStatus = "GREEN" | "AMBER" | "RED";
export type KpiRiskClass = "MAJOR" | "MINOR";
export type SubmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export interface KpiPerson {
  id: string;
  code: string;
  name: string;
}

export interface KpiNamedRef {
  id: string;
  code: string;
  name: string;
}

export interface KpiConfiguration {
  id: string;
  kpi: {
    id: string;
    code: string;
    name: string;
    unit: string;
    direction: KpiDirection;
    frequency: KpiFrequency;
  };
  orgUnit: KpiNamedRef | null;
  orgLocation: KpiNamedRef | null;
  productService: string | null;
  department: KpiNamedRef | null;
  owner: KpiPerson | null;
  approver: KpiPerson | null;
  enabled: boolean;
  currency: string | null;
  reviewFrequency: KpiFrequency;
  amberThresholdPct: string | null;
  redThresholdPct: string | null;
  requiresEvidence: boolean;
  requiresApproval: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KpiTarget {
  id: string;
  code: string;
  configuration: KpiConfiguration;
  period: string;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  minValue: string | null;
  maxValue: string | null;
  approvalStatus: SubmissionStatus;
  submittedBy: KpiPerson | null;
  submittedAt: string | null;
  approvedBy: KpiPerson | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  version: number;
  supersededById: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KpiActualRiskSummary {
  id: string;
  code: string;
  title: string;
  kpiRiskClass: KpiRiskClass | null;
  generalLevel: string | null;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  status: string;
}

export interface KpiActual {
  id: string;
  code: string;
  configuration: KpiConfiguration;
  target: { id: string; code: string; version: number };
  period: string;
  periodStart: string;
  periodEnd: string;
  targetValueSnapshot: string;
  actualValue: string;
  variance: string;
  variancePercentage: string | null;
  ragStatus: RagStatus | null;
  targetMet: boolean;
  approvalStatus: SubmissionStatus;
  submittedBy: KpiPerson | null;
  submittedAt: string;
  approvedBy: KpiPerson | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  evidenceStatus: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
  riskRequired: boolean;
  recommendedRiskClass: KpiRiskClass | null;
  risk: KpiActualRiskSummary | null;
}

export interface CreateKpiActualInput {
  kpiConfigurationId: string;
  period: string;
  actualValue: string;
  evidenceStatus?: string | null;
  comments?: string | null;
}
