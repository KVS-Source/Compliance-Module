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
  generatedAt?: string;
  compliance?: {
    overallPercentage: number;
    measuredKpis: number;
    kpisMeetingTarget: number;
  } | null;
  kpis: {
    activeConfigurations: number;
    meetingTarget: number;
    amberActuals: number;
    redActuals: number;
    pendingApprovals: number;
    definitions?: number;
    configured?: number;
    enabled?: number;
    measured?: number;
    green?: number;
    amber?: number;
    red?: number;
    pendingApproval?: number;
  } | null;
  risks: {
    openRisks: number;
    minorRisks: number;
    majorRisks: number;
    risksUnderTreatment: number;
    closedRisks: number;
    openMajor?: number;
    openMinor?: number;
    openEnterprise?: number;
    openTotal?: number;
    treated?: number;
    closed?: number;
  } | null;
  organisation: {
    departments: number;
    locations: number;
    organisationUnits: number;
  } | null;
  frameworks: {
    activeFrameworks: number;
    total?: number;
    active?: number;
    breakdown?: Array<{
      id: string;
      code: string;
      name: string;
      version: string;
      status: string;
      scopeStatus: string;
      ruleCount: number;
    }>;
  } | null;
  gaps?: {
    open: number;
    overdue: number;
    closed: number;
    critical: number;
    major: number;
    needsReview: number;
  } | null;
  capas?: {
    open: number;
    overdue: number;
    closed: number;
    pendingVerification: number;
    needsReview: number;
  } | null;
  evidence?: {
    total: number;
    pendingReview: number;
    approved: number;
    expiringSoon: number;
    expired: number;
    withoutFile: number;
  } | null;
  registers?: Array<{ code: string; name: string; recordCount: number }> | null;
  recentActivity?: DashboardActivityEvent[] | null;
  latestImport?: {
    id: string;
    originalFilename: string;
    status: string;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  analytics?: DashboardAnalytics | null;
}

export interface DashboardActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  at: string;
  actor: { id: string; code: string; name: string } | null;
}

/**
 * Live dashboard analytics. Every member is nullable because the API returns
 * `null` for a section whose source module the signed-in user may not read —
 * which the UI must show as restricted, never as zero.
 */
export interface DashboardAnalytics {
  cards: {
    kpiDefinitions: number | null;
    activeKpiConfigurations: number | null;
    measuredKpis: number | null;
    kpisMeetingTarget: number | null;
    kpisMissingTarget: number | null;
    pendingEvidence: number | null;
    openRisks: number | null;
    openGaps: number | null;
    openCapas: number | null;
    policiesDueForReview: number | null;
    evidenceExpiringSoon: number | null;
    evidenceExpired: number | null;
  };
  kpiTrend: Array<{
    period: string;
    periodStart: string | null;
    measured: number;
    meetingTarget: number;
    targetTotal: number | null;
    actualTotal: number | null;
  }> | null;
  evidenceStatus: Array<{ status: string; count: number }> | null;
  frameworkCompliance: Array<{
    id: string;
    code: string;
    name: string;
    version: string;
    scopeStatus: string | null;
    ruleCount: number;
    mappedControls: number;
    implementedControls: number;
    openGaps: number;
    compliancePercentage: number | null;
  }> | null;
  riskHeatMap: {
    cells: Array<{ likelihood: number; impact: number; count: number }>;
    maxLikelihood: number;
    maxImpact: number;
    total: number;
  } | null;
  capaAging: Array<{ key: string; label: string; count: number }> | null;
  recentKpiRisks: Array<{
    id: string;
    code: string;
    title: string;
    kpiRiskClass: string | null;
    status: string;
    inherentScore: number;
    raisedAt: string;
    kpi: {
      actualCode: string;
      period: string;
      ragStatus: string | null;
      definitionCode: string;
      definitionName: string;
    } | null;
  }> | null;
  capasDueSoon: Array<{
    id: string;
    code: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    completionPercentage: number;
    ownerName: string | null;
  }> | null;
  policiesDueForReview: {
    total: number;
    overdue: number;
    horizonDays: number;
    items: Array<{
      policyId: string;
      code: string;
      title: string;
      lifecycleStatus: string;
      version: string;
      reviewDate: string | null;
      ownerName: string | null;
    }>;
  } | null;
  actionQueue: Array<{
    key: string;
    label: string;
    description: string;
    count: number;
    to: string;
    tone: "red" | "amber" | "blue";
  }>;
  genrac: {
    configured: boolean;
    status: string;
    systemCode: string | null;
    displayName: string | null;
    connectorType: string | null;
    lastTestedAt: string | null;
    lastAttemptedSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    mappingCount: number;
    lastSyncRun: {
      id: string;
      status: string;
      mode: string;
      createCount: number;
      updateCount: number;
      conflictCount: number;
      invalidCount: number;
      startedAt: string;
      completedAt: string | null;
    } | null;
    liveAccess: boolean;
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

/** One live refresh-token family for a Company user. Token hashes are never included. */
export interface UserSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

/** The four registers that carry a remediation conversation. */
export type CommentEntityType = "GAP" | "CAPA" | "RISK" | "EVIDENCE";

export interface RecordComment {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  body: string;
  createdAt: string;
  /** Null once the author's account has been withdrawn or erased. */
  author: { id: string; code: string; name: string } | null;
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

export interface UserImportTemplate {
  headers: string[];
  maxRows: number;
  statuses: UserStatus[];
  roles: Array<{ code: string; name: string }>;
}

/** A row the API validated and is willing to create. */
export interface UserImportCandidate {
  line: number;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roleCode: string | null;
  status: UserStatus;
}

export interface UserImportPreviewRow {
  line: number;
  valid: boolean;
  errors: string[];
  /** The raw cells as they were read, so an invalid row is still legible. */
  source: {
    line: number;
    code: string;
    name: string;
    email: string;
    phone: string;
    department: string;
    role: string;
    status: string;
  } | null;
  candidate: UserImportCandidate | null;
}

export interface UserImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canAssignRoles: boolean;
  rows: UserImportPreviewRow[];
}

export interface UserImportResult {
  line: number;
  code: string;
  email: string;
  outcome: "CREATED" | "FAILED";
  userId?: string;
  roleCode?: string;
  roleAssigned?: boolean;
  errors?: string[];
}

export interface UserImportReport {
  totalRows: number;
  created: number;
  failed: number;
  rolesAssigned: number;
  results: UserImportResult[];
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
  scopeStatus: string | null;
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

export interface CreateManualRiskInput {
  title: string;
  description: string;
  category: string;
  inherentLikelihood: number;
  inherentImpact: number;
  ownerId?: string | null;
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
  ownerId?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface RiskListResult {
  data: Risk[];
  meta: PageMeta;
}

export type PolicyLifecycleStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type PolicyVersionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED"
  | "OBSOLETE";

export type PolicyVersionBump = "MAJOR" | "MINOR";

/** Person reference returned on Policy / Policy Version DTOs. */
export interface PolicyPerson {
  id: string;
  code: string;
  name: string;
}

export interface PolicyDepartmentRef {
  id: string;
  code: string;
  name: string;
}

export interface PolicyFrameworkRef {
  id: string;
  code: string;
  name: string;
  version: string;
}

/** Active Framework mapping attached to a Policy Version. */
export interface PolicyFrameworkMapping {
  id: string;
  frameworkId: string;
  isActive: boolean;
  framework: PolicyFrameworkRef | null;
}

/**
 * Version fields returned on Policy list rows. Body text (content, purpose,
 * scope, changeSummary) is omitted to keep the register payload small.
 */
export interface PolicyVersionSummary {
  id: string;
  policyId: string;
  sequence: number;
  version: string;
  versionMajor: number;
  versionMinor: number;
  status: PolicyVersionStatus;
  effectiveDate: string | null;
  reviewDate: string | null;
  requiresEvidence: boolean;
  requestedApprover: PolicyPerson | null;
  submittedBy: PolicyPerson | null;
  submittedAt: string | null;
  approvedBy: PolicyPerson | null;
  approvedAt: string | null;
  supersededById: string | null;
  frameworks: PolicyFrameworkMapping[];
  createdAt: string;
  updatedAt: string;
}

/** Full Version DTO from detail, Version list and decision endpoints. */
export interface PolicyVersion extends PolicyVersionSummary {
  content: string;
  purpose: string | null;
  scope: string | null;
  changeSummary: string | null;
}

/**
 * Policy register row. `latestVersion` is the highest-sequence Version and is
 * not necessarily approved. `currentApprovedVersion` is the Version currently
 * pointed at by the Policy when one exists.
 */
export interface Policy {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lifecycleStatus: PolicyLifecycleStatus;
  owner: PolicyPerson | null;
  department: PolicyDepartmentRef | null;
  currentApprovedVersion: PolicyVersionSummary | null;
  latestVersion: PolicyVersionSummary | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Policy detail with full nested Version bodies. */
export interface PolicyDetail
  extends Omit<Policy, "currentApprovedVersion" | "latestVersion"> {
  currentApprovedVersion: PolicyVersion | null;
  latestVersion: PolicyVersion | null;
}

export interface PolicyListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  code?: string;
  title?: string;
  lifecycleStatus?: PolicyLifecycleStatus | "";
  versionStatus?: PolicyVersionStatus | "";
  ownerId?: string;
  departmentId?: string;
  frameworkId?: string;
  reviewDueFrom?: string;
  reviewDueTo?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface PolicyListResult {
  data: Policy[];
  meta: PageMeta;
}

export interface CreatePolicyInput {
  title: string;
  description?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  content: string;
  purpose?: string | null;
  scope?: string | null;
  changeSummary?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  requiresEvidence?: boolean;
  requestedApproverId?: string | null;
  frameworkIds?: string[];
}

export interface UpdatePolicyInput {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
}

export interface CreatePolicyVersionInput {
  bump: PolicyVersionBump;
  content: string;
  purpose?: string | null;
  scope?: string | null;
  changeSummary?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  requiresEvidence?: boolean;
  requestedApproverId?: string | null;
  frameworkIds?: string[];
}

export interface UpdatePolicyVersionInput {
  content?: string;
  purpose?: string | null;
  scope?: string | null;
  changeSummary?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  requiresEvidence?: boolean;
  requestedApproverId?: string | null;
}

export interface ReplacePolicyFrameworksInput {
  frameworkIds: string[];
}

export interface ApprovePolicyVersionInput {
  comments?: string;
}

export interface RejectPolicyVersionInput {
  comments: string;
}

export interface PolicyControlRef {
  id: string;
  code: string;
  title: string;
  lifecycleStatus: string;
}

export interface PolicyControlMapping {
  id: string;
  isActive: boolean;
  control: PolicyControlRef;
}

export interface PolicyTraceability {
  policy: PolicyDetail;
  focusVersion: PolicyVersion | null;
  controlMappings: PolicyControlMapping[];
}

export interface PolicyAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

export interface PolicyAuditListResult {
  data: PolicyAuditEvent[];
  meta: PageMeta;
}

/** Control lifecycle uses the same governance statuses as Policy. */
export type ControlLifecycleStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type ControlImplementationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PARTIALLY_IMPLEMENTED"
  | "IMPLEMENTED"
  | "NOT_APPLICABLE";

export type ControlType =
  | "PREVENTIVE"
  | "DETECTIVE"
  | "CORRECTIVE"
  | "DIRECTIVE";

export type ControlFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "ANNUAL"
  | "CONTINUOUS"
  | "PER_EVENT"
  | "ONE_TIME";

export type ControlPerson = PolicyPerson;
export type ControlDepartmentRef = PolicyDepartmentRef;

/** Control register list row from GET /controls. */
export interface Control {
  id: string;
  code: string;
  title: string;
  owner: ControlPerson | null;
  department: ControlDepartmentRef | null;
  implementationStatus: ControlImplementationStatus;
  controlType: ControlType;
  frequency: ControlFrequency;
  requiresEvidence: boolean;
  lifecycleStatus: ControlLifecycleStatus;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  activePolicyVersionMappingCount: number;
  activeFrameworkMappingCount: number;
  activeFrameworkRuleMappingCount: number;
  activeCheckpointCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Control detail from GET /controls/:id (and create/update/lifecycle responses). */
export interface ControlDetail extends Control {
  description: string | null;
  objective: string;
  implementationNotes: string | null;
  verificationMethod: string;
  inactiveCheckpointCount: number;
  archivedCheckpointCount: number;
}

export interface ControlListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  code?: string;
  title?: string;
  implementationStatus?: ControlImplementationStatus | "";
  lifecycleStatus?: ControlLifecycleStatus | "";
  ownerId?: string;
  departmentId?: string;
  controlType?: ControlType | "";
  frequency?: ControlFrequency | "";
  policyId?: string;
  policyVersionId?: string;
  frameworkId?: string;
  frameworkRuleId?: string;
  requiresEvidence?: boolean;
  reviewDueFrom?: string;
  reviewDueTo?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface ControlListResult {
  data: Control[];
  meta: PageMeta;
}

export interface CreateControlInput {
  title: string;
  description?: string | null;
  objective: string;
  ownerId?: string | null;
  departmentId?: string | null;
  implementationStatus: ControlImplementationStatus;
  implementationNotes?: string | null;
  controlType: ControlType;
  frequency: ControlFrequency;
  verificationMethod: string;
  requiresEvidence?: boolean;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  policyVersionIds?: string[];
  frameworkIds?: string[];
  frameworkRuleIds?: string[];
}

export interface UpdateControlInput {
  title?: string;
  description?: string | null;
  objective?: string;
  ownerId?: string | null;
  departmentId?: string | null;
  implementationStatus?: ControlImplementationStatus;
  implementationNotes?: string | null;
  controlType?: ControlType;
  frequency?: ControlFrequency;
  verificationMethod?: string;
  requiresEvidence?: boolean;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
}

export interface ReplaceControlPolicyVersionsInput {
  policyVersionIds: string[];
}

export interface ReplaceControlFrameworksInput {
  frameworkIds: string[];
}

export interface ReplaceControlFrameworkRulesInput {
  frameworkRuleIds: string[];
}

export interface ControlPolicyVersionMapping {
  id: string;
  isActive: boolean;
  policyId: string;
  policyVersionId: string;
  policy: {
    id: string;
    code: string;
    title: string;
  };
  policyVersion: {
    id: string;
    version: string;
    versionMajor: number;
    versionMinor: number;
    status: PolicyVersionStatus;
  };
}

export interface ControlFrameworkMapping {
  id: string;
  isActive: boolean;
  frameworkId: string;
  framework: PolicyFrameworkRef | null;
}

export interface ControlFrameworkRuleMapping {
  id: string;
  isActive: boolean;
  frameworkId: string;
  frameworkRuleId: string;
  frameworkRule: {
    id: string;
    frameworkId: string;
    code: string;
    title: string;
  };
}

export interface ControlTraceability {
  control: ControlDetail;
  policyVersionMappings: ControlPolicyVersionMapping[];
  frameworkMappings: ControlFrameworkMapping[];
  frameworkRuleMappings: ControlFrameworkRuleMapping[];
  checkpointCounts: {
    active: number;
    inactive: number;
    archived: number;
  };
}

export interface ControlAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

export interface ControlAuditListResult {
  data: ControlAuditEvent[];
  meta: PageMeta;
}

/** Checkpoint lifecycle uses the same governance statuses as Control. */
export type CheckpointLifecycleStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type CheckpointVerificationFrequency = ControlFrequency;

export type CheckpointOutcome =
  | "PASS"
  | "PARTIAL"
  | "FAIL"
  | "NOT_APPLICABLE";

export type CheckpointPerson = PolicyPerson;
export type CheckpointDepartmentRef = PolicyDepartmentRef;

export interface CheckpointControlRef {
  id: string;
  code: string;
  title: string;
  lifecycleStatus: ControlLifecycleStatus;
}

/** Checkpoint register list row from GET /checkpoints. */
export interface Checkpoint {
  id: string;
  code: string;
  title: string;
  verificationFrequency: CheckpointVerificationFrequency;
  owner: CheckpointPerson | null;
  department: CheckpointDepartmentRef | null;
  evidenceRequired: boolean;
  lifecycleStatus: CheckpointLifecycleStatus;
  initialReviewDate: string | null;
  nextReviewDate: string | null;
  lastReviewedAt: string | null;
  control: CheckpointControlRef | null;
  latestOutcome: CheckpointOutcome | null;
  totalReviewCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Latest-review summary embedded on Checkpoint detail (no observation text). */
export interface CheckpointLatestReviewSummary {
  id: string;
  reviewPeriod: string;
  reviewDate: string;
  outcome: CheckpointOutcome;
  nextReviewDate: string | null;
  submittedAt: string;
  reviewer: CheckpointPerson | null;
}

/** Checkpoint detail from GET /checkpoints/:id. */
export interface CheckpointDetail extends Checkpoint {
  description: string | null;
  expectedResult: string;
  latestReview: CheckpointLatestReviewSummary | null;
  activePolicyVersionMappingCount: number;
  activeFrameworkMappingCount: number;
  activeFrameworkRuleMappingCount: number;
}

/** Full Review DTO from review history / latest-review / create review. */
export interface CheckpointReview {
  id: string;
  checkpointId: string;
  reviewPeriod: string;
  reviewDate: string;
  outcome: CheckpointOutcome;
  observation: string | null;
  recommendation: string | null;
  nextReviewDate: string | null;
  submittedAt: string;
  reviewer: CheckpointPerson | null;
}

export interface CheckpointListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  code?: string;
  title?: string;
  lifecycleStatus?: CheckpointLifecycleStatus | "";
  controlId?: string;
  controlLifecycleStatus?: ControlLifecycleStatus | "";
  ownerId?: string;
  departmentId?: string;
  verificationFrequency?: CheckpointVerificationFrequency | "";
  latestOutcome?: CheckpointOutcome | "";
  hasReviews?: boolean;
  evidenceRequired?: boolean;
  dueFrom?: string;
  dueTo?: string;
  reviewPeriod?: string;
  frameworkId?: string;
  policyId?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface CheckpointListResult {
  data: Checkpoint[];
  meta: PageMeta;
}

export interface CreateCheckpointInput {
  controlId: string;
  title: string;
  description?: string | null;
  verificationFrequency: CheckpointVerificationFrequency;
  ownerId?: string | null;
  departmentId?: string | null;
  expectedResult: string;
  evidenceRequired?: boolean;
  initialReviewDate?: string | null;
}

export interface UpdateCheckpointInput {
  title?: string;
  description?: string | null;
  verificationFrequency?: CheckpointVerificationFrequency;
  ownerId?: string | null;
  departmentId?: string | null;
  expectedResult?: string;
  evidenceRequired?: boolean;
  initialReviewDate?: string | null;
  nextReviewDate?: string | null;
}

export interface CreateCheckpointReviewInput {
  reviewPeriod: string;
  reviewDate: string;
  outcome: CheckpointOutcome;
  observation?: string | null;
  recommendation?: string | null;
  nextReviewDate?: string | null;
}

export interface CheckpointReviewListResult {
  data: CheckpointReview[];
  meta: PageMeta;
}

export interface CheckpointTraceabilityMappingGroup<T> {
  active: T[];
  historical: T[];
}

export interface CheckpointTraceabilityPolicyMapping {
  id: string;
  isActive: boolean;
  policyId: string;
  policyVersionId: string;
  policy: {
    id: string;
    code: string;
    title: string;
  };
  policyVersion: {
    id: string;
    version: string;
    versionMajor: number;
    versionMinor: number;
    status: PolicyVersionStatus;
  };
}

export interface CheckpointTraceabilityFrameworkMapping {
  id: string;
  isActive: boolean;
  frameworkId: string;
  framework: PolicyFrameworkRef | null;
}

export interface CheckpointTraceabilityFrameworkRuleMapping {
  id: string;
  isActive: boolean;
  frameworkId: string;
  frameworkRuleId: string;
  frameworkRule: {
    id: string;
    frameworkId: string;
    code: string;
    title: string;
  };
}

export interface CheckpointTraceability {
  checkpoint: {
    id: string;
    code: string;
    title: string;
    lifecycleStatus: CheckpointLifecycleStatus;
    verificationFrequency: CheckpointVerificationFrequency;
  };
  control: CheckpointControlRef | null;
  latestReview: CheckpointLatestReviewSummary | null;
  totalReviewCount: number;
  policyVersionMappings: CheckpointTraceabilityMappingGroup<CheckpointTraceabilityPolicyMapping>;
  frameworkMappings: CheckpointTraceabilityMappingGroup<CheckpointTraceabilityFrameworkMapping>;
  frameworkRuleMappings: CheckpointTraceabilityMappingGroup<CheckpointTraceabilityFrameworkRuleMapping>;
}

export interface CheckpointAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

export interface CheckpointAuditListResult {
  data: CheckpointAuditEvent[];
  meta: PageMeta;
}

export type EvidenceLifecycleStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED";

export type EvidenceDecisionOutcome = "APPROVED" | "REJECTED";

export type EvidencePerson = PolicyPerson;
export type EvidenceDepartmentRef = PolicyDepartmentRef;

/** Prior Evidence replaced by this record (REJECTED or ARCHIVED only). */
export interface EvidenceSupersedesRef {
  id: string;
  code: string;
  lifecycleStatus: EvidenceLifecycleStatus;
}

/**
 * Safe subset of the stored-file summary. `storageKey` and `contentSha256` are
 * returned by the API but are deliberately not modelled so no view can render a
 * storage location or a private content hash.
 */
export interface EvidenceFileSummary {
  originalFileName: string | null;
  mimeType: string | null;
  detectedMimeType: string | null;
  byteSize: number | null;
  uploadedAt: string | null;
  uploadedBy: EvidencePerson | null;
}

/** Evidence Library list row from GET /evidence. */
export interface Evidence {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lifecycleStatus: EvidenceLifecycleStatus;
  owner: EvidencePerson | null;
  department: EvidenceDepartmentRef | null;
  issueDate: string | null;
  expiresAt: string | null;
  supersedesEvidenceId: string | null;
  supersedes: EvidenceSupersedesRef | null;
  hasFile: boolean;
  file: EvidenceFileSummary | null;
  submittedById: string | null;
  submittedAt: string | null;
  submittedBy: EvidencePerson | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewedBy: EvidencePerson | null;
  archivedAt: string | null;
  createdById: string;
  createdBy: EvidencePerson | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  activeControlLinkCount?: number;
  activeCheckpointLinkCount?: number;
}

/** Active Evidence→Control link from GET /evidence/:id/controls. */
export interface EvidenceControlLink {
  id: string;
  isActive: boolean;
  control: {
    id: string;
    code: string;
    title: string;
    lifecycleStatus: ControlLifecycleStatus;
  };
  linkedAt: string;
  linkedBy: EvidencePerson | null;
  updatedAt: string;
  updatedBy: EvidencePerson | null;
}

/** Active Evidence→Checkpoint link from GET /evidence/:id/checkpoints. */
export interface EvidenceCheckpointLink {
  id: string;
  isActive: boolean;
  checkpoint: {
    id: string;
    code: string;
    title: string;
    lifecycleStatus: CheckpointLifecycleStatus;
    controlId: string;
  };
  linkedAt: string;
  linkedBy: EvidencePerson | null;
  updatedAt: string;
  updatedBy: EvidencePerson | null;
}

/** Evidence↔KPI Actual link (direction depends on endpoint). */
export interface EvidenceKpiActualLink {
  id: string;
  isActive: boolean;
  evidence: {
    id: string;
    code: string;
    title: string;
    lifecycleStatus: EvidenceLifecycleStatus;
  };
  kpiActual: {
    id: string;
    code: string;
    period: string;
    approvalStatus: SubmissionStatus;
  };
  linkedAt: string;
  linkedBy: EvidencePerson | null;
  updatedAt: string;
  updatedBy: EvidencePerson | null;
}

export interface EvidenceLinkListResult<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * Evidence detail from GET /evidence/:id and every lifecycle mutation.
 */
export interface EvidenceDetail extends Evidence {
  latestReviewDecision: EvidenceReviewDecision | null;
}

/** Review queue row from GET /evidence/review-queue (SUBMITTED only). */
export interface EvidenceReviewQueueItem {
  id: string;
  code: string;
  title: string;
  lifecycleStatus: EvidenceLifecycleStatus;
  issueDate: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  submittedBy: EvidencePerson | null;
  createdBy: EvidencePerson | null;
  hasFile: boolean;
}

/** Append-only review decision from GET /evidence/:id/review-decisions. */
export interface EvidenceReviewDecision {
  id: string;
  decision: EvidenceDecisionOutcome;
  reason: string | null;
  decidedAt: string;
  actedBy: EvidencePerson | null;
}

export interface EvidenceAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

export interface EvidenceListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  lifecycleStatus?: EvidenceLifecycleStatus | "";
  ownerId?: string;
  departmentId?: string;
  expiresBefore?: string;
  expiresAfter?: string;
  expiringSoon?: boolean;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface EvidenceListResult {
  data: Evidence[];
  meta: PageMeta;
}

/** The queue is inherently SUBMITTED-only, so it carries no lifecycle filter. */
export interface EvidenceReviewQueueQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  expiresBefore?: string;
  expiresAfter?: string;
}

export interface EvidenceReviewQueueResult {
  data: EvidenceReviewQueueItem[];
  meta: PageMeta;
}

export interface EvidenceReviewDecisionListResult {
  data: EvidenceReviewDecision[];
  meta: PageMeta;
}

export interface EvidenceAuditListResult {
  data: EvidenceAuditEvent[];
  meta: PageMeta;
}

export interface CreateEvidenceInput {
  title: string;
  description?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  issueDate?: string | null;
  expiresAt?: string | null;
  supersedesEvidenceId?: string | null;
}

/** PATCH accepts no `supersedesEvidenceId`; the link is fixed at creation. */
export interface UpdateEvidenceInput {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  issueDate?: string | null;
  expiresAt?: string | null;
}

export interface ApproveEvidenceInput {
  comment?: string;
}

export interface RejectEvidenceInput {
  reason: string;
}

/** `percent` stays null while the transport reports no computable total. */
export interface EvidenceUploadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

export interface EvidenceUploadOptions {
  onProgress?: (progress: EvidenceUploadProgress) => void;
  signal?: AbortSignal;
}

export interface EvidenceDownloadResult {
  fileName: string;
  byteSize: number;
}

export type GapSeverity =
  | "CRITICAL"
  | "MAJOR"
  | "MINOR"
  | "OBSERVATION"
  | "OFI";

export type GapStatus = "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED";

export interface CompliancePersonRef {
  id: string;
  code: string;
  name: string;
}

export interface ComplianceNamedRef {
  id: string;
  code: string;
  name?: string;
  title?: string;
}

export interface ComplianceEvidenceLink {
  linkId: string;
  id: string;
  code: string;
  title: string;
  lifecycleStatus: EvidenceLifecycleStatus;
  file: {
    available: boolean;
    sourceReference: string | null;
  };
  linkReason: string | null;
  linkedAt: string;
}

export interface GapLinkedCapa {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completionPercentage: number;
}

export interface Gap {
  id: string;
  code: string;
  title: string;
  description: string | null;
  severity: GapSeverity;
  status: GapStatus;
  source: string | null;
  clauseRef: string | null;
  recommendedAction: string | null;
  owner: CompliancePersonRef | null;
  sourceOwnerRef: string | null;
  department: ComplianceNamedRef | null;
  framework: ComplianceNamedRef | null;
  frameworkRule: ComplianceNamedRef | null;
  control: ComplianceNamedRef | null;
  checkpoint: ComplianceNamedRef | null;
  identifiedOn: string | null;
  dueDate: string | null;
  overdue: boolean;
  closedAt: string | null;
  closureNote: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  capas: GapLinkedCapa[];
  evidence: ComplianceEvidenceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface GapListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  severity?: GapSeverity;
  status?: GapStatus;
  overdue?: boolean;
  ownerId?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface GapListResult {
  data: Gap[];
  meta: PageMeta;
}

export interface CreateGapInput {
  title: string;
  description?: string | null;
  severity: GapSeverity;
  source?: string | null;
  clauseRef?: string | null;
  recommendedAction?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  identifiedOn?: string | null;
  dueDate?: string | null;
}

export interface UpdateGapInput {
  title?: string;
  description?: string | null;
  severity?: GapSeverity;
  status?: Exclude<GapStatus, "CLOSED">;
  source?: string | null;
  clauseRef?: string | null;
  recommendedAction?: string | null;
  departmentId?: string | null;
  identifiedOn?: string | null;
  dueDate?: string | null;
}

export type CapaPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CapaStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "CLOSED"
  | "CANCELLED";

export interface CapaLinkedGap {
  id: string;
  code: string;
  title: string;
  severity: GapSeverity;
  status: GapStatus;
}

export interface Capa {
  id: string;
  code: string;
  title: string;
  description: string | null;
  priority: CapaPriority;
  status: CapaStatus;
  gap: CapaLinkedGap | null;
  source: string | null;
  sourceRef: string | null;
  framework: ComplianceNamedRef | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  owner: CompliancePersonRef | null;
  sourceOwnerRef: string | null;
  department: ComplianceNamedRef | null;
  raisedOn: string | null;
  dueDate: string | null;
  overdue: boolean;
  completionPercentage: number;
  closedAt: string | null;
  closureNote: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  evidence: ComplianceEvidenceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CapaListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: CapaStatus;
  priority?: CapaPriority;
  gapId?: string;
  overdue?: boolean;
  ownerId?: string;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface CapaListResult {
  data: Capa[];
  meta: PageMeta;
}

export interface CreateCapaInput {
  title: string;
  description?: string | null;
  gapId?: string | null;
  priority: CapaPriority;
  source?: string | null;
  sourceRef?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  raisedOn?: string | null;
  dueDate?: string | null;
  completionPercentage?: number;
}

export interface UpdateCapaInput {
  title?: string;
  description?: string | null;
  gapId?: string | null;
  priority?: CapaPriority;
  status?: Exclude<CapaStatus, "CLOSED">;
  source?: string | null;
  sourceRef?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  departmentId?: string | null;
  raisedOn?: string | null;
  dueDate?: string | null;
  completionPercentage?: number;
}

export type ImportBatchStatus = "PREVIEWED" | "COMMITTING" | "COMPLETED" | "PARTIAL" | "FAILED";
export interface ImportActor { id: string; code: string; fullName: string; }
export interface ImportSheetSummary { key: string; sheetName: string; target: "normalised" | "register" | "derived"; present: boolean; totalRows: number; validRows: number; errorRows: number; flaggedRows: number; missingHeaders: string[]; reason?: string; }
export interface ImportSheetOutcome { sheet: string; created: number; updated: number; unchanged: number; skipped: number; }
export interface ImportReport {
  workbook?: { filename: string; checksum: string; byteSize: number; sheetCount: number };
  sheets?: ImportSheetSummary[];
  unmappedSheets?: string[];
  totals?: { totalRows: number; validRows: number; errorRows: number; flaggedRows: number };
  counts?: { created: number; updated: number; unchanged: number; skipped: number; errors: number };
  perSheetOutcomes?: ImportSheetOutcome[];
  alreadyImported?: boolean;
}
export interface ImportBatch { id: string; originalFilename: string; fileChecksum: string; idempotencyKey?: string; status: ImportBatchStatus; createdCount: number; updatedCount: number; skippedCount: number; errorCount: number; startedAt: string; completedAt: string | null; uploadedBy: ImportActor; report?: ImportReport | null; }
export interface ImportBatchListResult { data: ImportBatch[]; meta: PageMeta; }
export interface ImportBatchError { id: string; sheet: string; rowNumber: number; businessKey: string | null; validationErrors: unknown; importResult: "FAILED"; }
export interface ImportBatchErrorListResult { data: ImportBatchError[]; meta: PageMeta; }

/** Read-only Role & Access matrix. The API states `mutable: false` itself. */
export interface PrivilegeAccessHolder {
  id: string;
  code: string;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
}

export interface PrivilegeAccessPermission {
  code: string;
  description: string;
  holderCount: number;
  holders: PrivilegeAccessHolder[];
}

export interface PrivilegeAccessReview {
  generatedAt: string;
  permissions: PrivilegeAccessPermission[];
}

export interface AccessProfileResponse {
  profiles: Array<{
    code: string;
    name: string;
    description: string;
    provisioned: boolean;
    enabled: boolean;
    userCount: number;
    permissions: string[];
    permissionCount: number;
  }>;
  additionalRoles: Array<{
    code: string;
    name: string;
    description: string;
    provisioned: boolean;
    enabled: boolean;
    userCount: number;
    permissions: string[];
    permissionCount: number;
    holdsWildcard: boolean;
  }>;
  permissions: Array<{ code: string; description: string; module: string }>;
  mutable: boolean;
}

export interface KpiCatalogueEntry {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  frequency: string;
  status: string;
  /** Null where the schema carries no such field — printed as "—". */
  perspective: string | null;
  framework: string | null;
  configurationCount: number;
  activeConfigurationCount: number;
  configurationStatus: "ACTIVE" | "CONFIGURED_INACTIVE" | "NOT_CONFIGURED";
  owners: string[];
  departments: string[];
}

export interface KpiTraceabilityRef {
  id: string;
  code: string;
  title?: string;
  name?: string;
  status?: string | null;
}

export interface KpiTraceabilityRow {
  id: string;
  kpi: {
    id: string;
    code: string;
    name: string;
    unit: string;
    direction: string;
    /**
     * Clause list declared for this KPI in `14_KPI_Master`, verbatim from the
     * client workbook. This is a stated intent, not a governed mapping, so it
     * is displayed apart from the derived chain and never counts toward
     * `completeness`.
     */
    frameworkMapping: string | null;
  };
  configuration: {
    id: string;
    owner: { id: string; name: string } | null;
    department: { id: string; code: string; name: string } | null;
  };
  targetActual: {
    targetId: string;
    targetCode: string;
    targetVersion: number;
    actualId: string;
    actualCode: string;
    period: string;
    targetValue: string;
    actualValue: string;
    variance: string;
    variancePercentage: string | null;
    ragStatus: RagStatus | null;
    targetMet: boolean;
    approvalStatus: SubmissionStatus;
  };
  policies: Array<
    KpiTraceabilityRef & {
      versionId: string;
      version: string;
      status: string;
    }
  >;
  frameworks: Array<
    KpiTraceabilityRef & { version: string; scopeStatus: string | null }
  >;
  rules: Array<KpiTraceabilityRef & { clauseRef: string | null }>;
  evidence: KpiTraceabilityRef[];
  controls: KpiTraceabilityRef[];
  risks: Array<
    KpiTraceabilityRef & { classification: string | null; status: string }
  >;
  completeness: { mappedNodes: number; totalNodes: number; complete: boolean };
}

export interface KpiTraceability {
  generatedAt: string;
  summary: {
    actuals: number;
    completeChains: number;
    missingEvidence: number;
    riskLinked: number;
    /** Actuals whose KPI declares a workbook clause no control chain supports. */
    declaredWithoutChain: number;
  };
  rows: KpiTraceabilityRow[];
}

export interface KpiFrequencyEntry {
  code: string;
  definitionCount: number;
  configurationCount: number;
  activeConfigurationCount: number;
}

export interface KpiAnalytics {
  generatedAt: string;
  filters: {
    frequency: string | null;
    ownerId: string | null;
    departmentId: string | null;
    period: string | null;
  };
  summary: {
    measured: number;
    meetingTarget: number;
    missingTarget: number;
    achievementRate: number | null;
  };
  ragDistribution: Array<{ status: string; count: number }>;
  trend: Array<{
    period: string;
    periodStart: string | null;
    measured: number;
    meetingTarget: number;
    achievementRate: number | null;
  }>;
  departmentDistribution: Array<{
    id: string | null;
    code: string | null;
    name: string;
    measured: number;
  }>;
  missedKpis: Array<{
    id: string;
    code: string;
    period: string;
    ragStatus: string | null;
    approvalStatus: string;
    definitionCode: string;
    definitionName: string;
    unit: string;
    direction: string;
    frequency: string;
    ownerName: string | null;
    departmentName: string | null;
    targetValue: number | null;
    actualValue: number | null;
    variance: number | null;
    variancePercentage: number | null;
  }>;
}

export interface ReportCatalogueEntry {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  filters: string[];
  available: boolean;
}

export interface ReportResult {
  key: string;
  name: string;
  generatedAt: string;
  filters: Record<string, string | null>;
  columns: Array<{ key: string; header: string; numeric?: boolean }>;
  rows: Array<Record<string, unknown>>;
  chart?: {
    kind: "bars" | "donut" | "grouped-bars";
    series: Array<{ label: string; value: number | null; caption?: string }>;
    valueSuffix?: string;
  };
  rowLimit: number;
  truncated: boolean;
  summary: Array<{ label: string; value: string }>;
}

export type SavedViewRegisterKey =
  | "GAPS"
  | "CAPAS"
  | "RISKS"
  | "POLICIES"
  | "CONTROLS"
  | "CHECKPOINTS"
  | "EVIDENCE"
  | "KPI_ACTUALS"
  | "KPI_TARGETS"
  | "OPERATIONAL_REGISTERS"
  | "TASKS";

export interface SavedView {
  id: string;
  registerKey: SavedViewRegisterKey;
  name: string;
  query: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind =
  | "APPROVAL_REQUEST"
  | "OVERDUE_GAP"
  | "OVERDUE_CAPA"
  | "OWNERSHIP_ASSIGNMENT";

export interface InAppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  targetPath: string;
  sourceType: string;
  sourceId: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: InAppNotification[];
  unreadCount: number;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskLinkType = "GAP" | "CAPA" | "RISK" | "AUDIT";

export interface ComplianceTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  overdue: boolean;
  owner: { id: string; code: string; name: string } | null;
  linked: { type: TaskLinkType; id: string; code: string; title: string };
  createdBy: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
  ownerId?: string | null;
  linkedEntityType: TaskLinkType;
  linkedEntityId: string;
}

export type UpdateTaskInput = Partial<TaskInput>;

export interface TaskListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: TaskStatus;
  ownerId?: string;
  linkedEntityType?: TaskLinkType;
  overdue?: boolean;
  orderBy?: "title" | "status" | "dueDate" | "createdAt";
  order?: "asc" | "desc";
}

export interface TaskListResult {
  data: ComplianceTask[];
  meta: PageMeta;
}
