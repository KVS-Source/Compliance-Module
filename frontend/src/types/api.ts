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

export interface DashboardSummary {
  kpis: {
    activeConfigurations: number;
    meetingTarget: number;
    amberActuals: number;
    redActuals: number;
    pendingApprovals: number;
  } | null;
  risks: {
    openRisks: number;
    minorRisks: number;
    majorRisks: number;
    risksUnderTreatment: number;
    closedRisks: number;
  } | null;
  organisation: {
    departments: number;
    locations: number;
    organisationUnits: number;
  } | null;
  frameworks: {
    activeFrameworks: number;
  } | null;
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

export type ApprovalDecision = "APPROVED" | "REJECTED" | "RESUBMITTED";

/**
 * One entry in the append-only `kpi_approvals` ledger. Rows are immutable:
 * the `kpi_approvals_append_only` database trigger rejects UPDATE and DELETE.
 */
export interface KpiApprovalEntry {
  id: string;
  decision: ApprovalDecision;
  reviewer: KpiPerson | null;
  comments: string | null;
  decidedAt: string;
}

/** A KPI actual as returned by the read routes, with its decision history. */
export interface KpiActualRecord extends KpiActual {
  approvals: KpiApprovalEntry[];
}

export interface KpiActualListQuery {
  page?: number;
  pageSize?: number;
  approvalStatus?: SubmissionStatus | "";
  kpiConfigurationId?: string;
  kpiDefinitionId?: string;
  ragStatus?: RagStatus | "";
  awaitingMyDecision?: boolean;
}

export interface KpiActualListResult {
  data: KpiActualRecord[];
  meta: PageMeta;
}

export type RecordStatus = "ACTIVE" | "DISABLED" | "INVITED" | "LOCKED";

/**
 * Company-level threshold defaults applied when a configuration leaves its
 * overrides null. Server-owned: never substitute a local constant.
 */
export interface KpiThresholdDefaults {
  defaultAmberThresholdPct: string;
  defaultRedThresholdPct: string;
}

export interface CreateKpiConfigurationInput {
  kpiDefinitionId: string;
  orgUnitId?: string | null;
  orgLocationId?: string | null;
  productService?: string | null;
  departmentId?: string | null;
  ownerId: string;
  approverId?: string | null;
  enabled: boolean;
  currency?: string | null;
  reviewFrequency: KpiFrequency;
  amberThresholdPct?: string | null;
  redThresholdPct?: string | null;
  requiresEvidence: boolean;
  requiresApproval: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status?: RecordStatus;
}

export type UpdateKpiConfigurationInput = Partial<CreateKpiConfigurationInput>;

export interface KpiConfigurationListQuery {
  page?: number;
  pageSize?: number;
  kpiDefinitionId?: string;
  status?: RecordStatus | "";
  enabled?: boolean;
}

export interface KpiConfigurationListResult {
  data: KpiConfiguration[];
  meta: PageMeta;
}

export interface CreateKpiTargetInput {
  kpiConfigurationId: string;
  code: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  minValue?: string | null;
  maxValue?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status?: RecordStatus;
}

export type UpdateKpiTargetInput = Partial<
  Omit<CreateKpiTargetInput, "kpiConfigurationId">
>;

/** Versioning requires a fresh code; every other field inherits when omitted. */
export type VersionKpiTargetInput = UpdateKpiTargetInput & { code: string };

export interface KpiTargetListQuery {
  page?: number;
  pageSize?: number;
  kpiConfigurationId?: string;
  approvalStatus?: SubmissionStatus | "";
  status?: RecordStatus | "";
}

export interface KpiTargetListResult {
  data: KpiTarget[];
  meta: PageMeta;
}

export type RiskStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "TREATED"
  | "CLOSED"
  | "ARCHIVED";

export type GeneralRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskLifecycle = "active" | "closed" | "all";

export type RiskTreatmentStrategy =
  | "AVOID"
  | "MITIGATE"
  | "TRANSFER"
  | "ACCEPT";

export interface RiskActualSource {
  id: string;
  code: string;
  period: string;
  ragStatus: RagStatus | null;
  targetMet: boolean;
  actualValue: string;
  variance: string;
  targetValueSnapshot: string;
}

export interface Risk {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  kpiRiskClass: KpiRiskClass | null;
  generalLevel: GeneralRiskLevel | null;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  status: RiskStatus;
  source: {
    actual: RiskActualSource | null;
    configuration: KpiConfiguration | null;
    target: { id: string; code: string; version: number } | null;
  };
  residualLikelihood: number | null;
  residualImpact: number | null;
  residualScore: number | null;
  owner: KpiPerson | null;
  treatmentStrategy: RiskTreatmentStrategy | null;
  reviewDate: string | null;
  closedAt: string | null;
  closureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RiskTreatmentStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

/**
 * One entry in the append-only `risk_reviews` ledger. The
 * `risk_reviews_append_only` database trigger rejects UPDATE and DELETE.
 */
export interface RiskReviewEntry {
  id: string;
  reviewer: KpiPerson | null;
  comments: string;
  likelihoodAtReview: number | null;
  impactAtReview: number | null;
  reviewedAt: string;
}

/**
 * One entry in the append-only `risk_treatments` ledger. Completing a
 * treatment appends a new COMPLETED entry whose `supersedesId` points at the
 * original; entries are never edited.
 */
export interface RiskTreatmentEntry {
  id: string;
  strategy: RiskTreatmentStrategy;
  plan: string;
  owner: KpiPerson | null;
  dueDate: string | null;
  completedAt: string | null;
  status: RiskTreatmentStatus;
  effectivenessNotes: string | null;
  supersedesId: string | null;
  recordedBy: KpiPerson | null;
  recordedAt: string;
}

/** Risk detail, adding the two append-only ledgers. */
export interface RiskDetail extends Risk {
  reviews: RiskReviewEntry[];
  treatments: RiskTreatmentEntry[];
}

export interface CreateRiskReviewInput {
  comments: string;
  likelihoodAtReview?: number | null;
  impactAtReview?: number | null;
}

export interface CreateRiskTreatmentInput {
  strategy: RiskTreatmentStrategy;
  plan: string;
  ownerId?: string | null;
  dueDate?: string | null;
  status?: Exclude<RiskTreatmentStatus, "COMPLETED">;
}

export interface RiskListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: RiskStatus | "";
  lifecycle?: RiskLifecycle;
  kpiRiskClass?: KpiRiskClass | "";
  generalLevel?: GeneralRiskLevel | "";
}

export interface RiskListResult {
  data: Risk[];
  meta: PageMeta;
}
