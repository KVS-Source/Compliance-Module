from datetime import date, datetime
from decimal import Decimal
from typing import Literal
import uuid

from pydantic import BaseModel, Field, computed_field, model_validator

from app.schemas.common import TimestampedModel


Status = Literal["active", "inactive", "draft", "archived"]
ApprovalStatus = Literal["pending", "approved", "rejected", "more_info_required"]


def risk_level_from_score(score: int | None) -> str:
    """Derive a human risk level from ``likelihood * impact`` (1-25)."""
    if not score or score <= 4:
        return "low"
    if score <= 9:
        return "medium"
    if score <= 14:
        return "high"
    return "critical"


class ClientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$", max_length=100)
    contact_email: str | None = Field(None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ClientRead(TimestampedModel):
    name: str
    slug: str
    status: str
    contact_email: str | None
    settings: dict


class LoginRequest(BaseModel):
    client_slug: str
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    is_superuser: bool = False


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    status: str | None = None
    is_active: bool | None = None


class UserRead(TimestampedModel):
    client_id: uuid.UUID
    email: str
    full_name: str
    status: str
    is_active: bool
    is_superuser: bool
    is_platform_admin: bool
    last_login_at: datetime | None


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = None
    status: str | None = None


class RoleRead(TimestampedModel):
    client_id: uuid.UUID
    name: str
    description: str | None
    status: str


class PermissionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None


class PermissionRead(TimestampedModel):
    code: str
    name: str
    description: str | None
    status: str


class RolePermissionCreate(BaseModel):
    permission_id: uuid.UUID


class RolePermissionRead(TimestampedModel):
    client_id: uuid.UUID
    role_id: uuid.UUID
    permission_id: uuid.UUID


class UserRoleCreate(BaseModel):
    user_id: uuid.UUID
    role_id: uuid.UUID


class UserRoleRead(TimestampedModel):
    client_id: uuid.UUID
    user_id: uuid.UUID
    role_id: uuid.UUID


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=150)
    parent_department_id: uuid.UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=150)
    status: str | None = None
    parent_department_id: uuid.UUID | None = None


class DepartmentRead(TimestampedModel):
    client_id: uuid.UUID
    code: str
    name: str
    status: str
    parent_department_id: uuid.UUID | None


class EmployeeCreate(BaseModel):
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    employee_code: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=2, max_length=200)
    email: str | None = None
    designation: str | None = None
    employment_type: str | None = None
    joining_date: date | None = None
    current_work: str | None = None


class EmployeeUpdate(BaseModel):
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    full_name: str | None = Field(None, min_length=2, max_length=200)
    email: str | None = None
    designation: str | None = None
    employment_type: str | None = None
    joining_date: date | None = None
    current_work: str | None = None
    status: str | None = None
    # exit_date/exit_reason are sensitive HR data; only HR-authorized users may set them.
    exit_date: date | None = None
    exit_reason: str | None = None


class EmployeeRead(TimestampedModel):
    client_id: uuid.UUID
    department_id: uuid.UUID | None
    manager_id: uuid.UUID | None
    user_id: uuid.UUID | None
    employee_code: str
    full_name: str
    email: str | None
    designation: str | None
    employment_type: str | None
    joining_date: date | None
    status: str
    exit_date: date | None
    # Masked to None for readers without HR access (see employees route).
    exit_reason: str | None
    current_work: str | None


class FrameworkRead(TimestampedModel):
    code: str
    name: str
    version: str
    description: str | None
    status: str
    is_active: bool


class ControlCreate(BaseModel):
    framework_id: uuid.UUID
    control_code: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=2, max_length=300)
    description: str | None = None


class ControlUpdate(BaseModel):
    control_code: str | None = Field(None, min_length=1, max_length=100)
    title: str | None = Field(None, min_length=2, max_length=300)
    description: str | None = None
    status: str | None = None


class ControlRead(TimestampedModel):
    framework_id: uuid.UUID
    control_code: str
    title: str
    description: str | None
    status: str


class CheckpointCreate(BaseModel):
    framework_id: uuid.UUID
    control_id: uuid.UUID
    checkpoint_code: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=2, max_length=300)
    guidance: str | None = None
    evidence_required: bool = True


class CheckpointUpdate(BaseModel):
    checkpoint_code: str | None = Field(None, min_length=1, max_length=100)
    title: str | None = Field(None, min_length=2, max_length=300)
    guidance: str | None = None
    evidence_required: bool | None = None
    status: str | None = None


class CheckpointRead(TimestampedModel):
    framework_id: uuid.UUID
    control_id: uuid.UUID
    checkpoint_code: str
    title: str
    guidance: str | None
    evidence_required: bool
    status: str


class KPICreate(BaseModel):
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    kpi_code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=250)
    description: str | None = None
    unit: str | None = None
    frequency: str = "monthly"
    calculation_method: str | None = None
    direction: str = "higher_is_better"
    use_in_scope: bool = True
    enabled: bool = True

    @model_validator(mode="after")
    def enabled_requires_scope(self):
        if not self.use_in_scope:
            self.enabled = False
        return self


class KPIUpdate(BaseModel):
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    name: str | None = None
    description: str | None = None
    unit: str | None = None
    frequency: str | None = None
    calculation_method: str | None = None
    direction: str | None = None
    use_in_scope: bool | None = None
    enabled: bool | None = None
    status: str | None = None


class KPIRead(TimestampedModel):
    client_id: uuid.UUID
    department_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    kpi_code: str
    name: str
    description: str | None
    unit: str | None
    frequency: str
    calculation_method: str | None
    direction: str
    use_in_scope: bool
    enabled: bool
    status: str


class KPIFrameworkMappingCreate(BaseModel):
    kpi_id: uuid.UUID
    framework_id: uuid.UUID
    control_id: uuid.UUID | None = None


class KPIFrameworkMappingRead(TimestampedModel):
    client_id: uuid.UUID
    kpi_id: uuid.UUID
    framework_id: uuid.UUID
    control_id: uuid.UUID | None
    status: str


class KPITargetCreate(BaseModel):
    kpi_id: uuid.UUID
    period_start: date
    period_end: date
    target_value: Decimal
    warning_threshold: Decimal | None = None
    critical_threshold: Decimal | None = None

    @model_validator(mode="after")
    def valid_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class KPITargetUpdate(BaseModel):
    target_value: Decimal | None = None
    warning_threshold: Decimal | None = None
    critical_threshold: Decimal | None = None
    status: str | None = None


class KPITargetRead(TimestampedModel):
    client_id: uuid.UUID
    kpi_id: uuid.UUID
    period_start: date
    period_end: date
    target_value: Decimal
    warning_threshold: Decimal | None
    critical_threshold: Decimal | None
    status: str


class KPIActualCreate(BaseModel):
    kpi_id: uuid.UUID
    kpi_target_id: uuid.UUID | None = None
    period_start: date
    period_end: date
    target_value: Decimal
    actual_value: Decimal
    rag_status: Literal["red", "amber", "green"] = "amber"
    evidence_required: bool = True
    notes: str | None = None

    @model_validator(mode="after")
    def valid_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class KPIActualUpdate(BaseModel):
    target_value: Decimal | None = None
    actual_value: Decimal | None = None
    rag_status: Literal["red", "amber", "green"] | None = None
    approval_status: ApprovalStatus | None = None
    evidence_required: bool | None = None
    status: str | None = None
    notes: str | None = None


class KPIActualRead(TimestampedModel):
    client_id: uuid.UUID
    kpi_id: uuid.UUID
    kpi_target_id: uuid.UUID | None
    period_start: date
    period_end: date
    target_value: Decimal
    actual_value: Decimal
    variance: Decimal
    rag_status: str
    approval_status: str
    evidence_required: bool
    submitted_by: uuid.UUID | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    status: str
    notes: str | None


class PolicyCreate(BaseModel):
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    policy_code: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=2, max_length=300)
    description: str | None = None
    use_in_scope: bool = True


class PolicyRead(TimestampedModel):
    client_id: uuid.UUID
    department_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    policy_code: str
    title: str
    description: str | None
    use_in_scope: bool
    status: str


class PolicyRegisterCreate(BaseModel):
    policy_id: uuid.UUID
    version: str
    effective_date: date | None = None
    next_review_date: date | None = None
    notes: str | None = None


class PolicyRegisterUpdate(BaseModel):
    effective_date: date | None = None
    next_review_date: date | None = None
    approval_status: ApprovalStatus | None = None
    review_status: ApprovalStatus | None = None
    status: str | None = None
    notes: str | None = None


class PolicyRegisterRead(TimestampedModel):
    client_id: uuid.UUID
    policy_id: uuid.UUID
    version: str
    effective_date: date | None
    next_review_date: date | None
    approval_status: str
    review_status: str
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    status: str
    notes: str | None


class EvidenceMetadataCreate(BaseModel):
    original_filename: str
    stored_filename: str
    storage_path: str
    content_type: str | None = None
    size_bytes: int = Field(ge=0)
    checksum_sha256: str = Field(min_length=64, max_length=64)
    description: str | None = None


class EvidenceUpdate(BaseModel):
    approval_status: ApprovalStatus | None = None
    description: str | None = None
    status: str | None = None


class EvidenceRead(TimestampedModel):
    client_id: uuid.UUID
    original_filename: str
    stored_filename: str
    storage_provider: str
    storage_path: str
    content_type: str | None
    size_bytes: int
    checksum_sha256: str
    description: str | None
    approval_status: str
    uploaded_by: uuid.UUID | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    status: str


class EvidenceLinkCreate(BaseModel):
    evidence_document_id: uuid.UUID
    entity_type: Literal[
        "kpi_actual", "policy_register", "capa", "audit", "training",
        "incident", "risk", "checkpoint", "gap", "other"
    ]
    entity_id: uuid.UUID
    link_type: str = "supporting"


class EvidenceLinkRead(TimestampedModel):
    client_id: uuid.UUID
    evidence_document_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    link_type: str
    status: str


class GapCreate(BaseModel):
    framework_id: uuid.UUID | None = None
    control_id: uuid.UUID | None = None
    checkpoint_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    title: str
    description: str
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    due_date: date | None = None

    @model_validator(mode="after")
    def references_are_hierarchical(self):
        if self.checkpoint_id and not self.control_id:
            raise ValueError("control_id is required when checkpoint_id is provided")
        if self.control_id and not self.framework_id:
            raise ValueError("framework_id is required when control_id is provided")
        return self


class GapUpdate(BaseModel):
    owner_user_id: uuid.UUID | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    due_date: date | None = None
    status: str | None = None


class GapRead(TimestampedModel):
    client_id: uuid.UUID
    framework_id: uuid.UUID | None
    control_id: uuid.UUID | None
    checkpoint_id: uuid.UUID | None
    department_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    title: str
    description: str
    severity: str
    due_date: date | None
    status: str
    closed_at: datetime | None


class CAPACreate(BaseModel):
    gap_id: uuid.UUID | None = None
    risk_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    capa_type: Literal["corrective", "preventive"] = "corrective"
    title: str
    root_cause: str | None = None
    action_plan: str
    due_date: date | None = None


class CAPAUpdate(BaseModel):
    owner_user_id: uuid.UUID | None = None
    root_cause: str | None = None
    action_plan: str | None = None
    due_date: date | None = None
    effectiveness_review: str | None = None
    status: str | None = None


class CAPARead(TimestampedModel):
    client_id: uuid.UUID
    gap_id: uuid.UUID | None
    risk_id: uuid.UUID | None
    department_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    capa_type: str
    title: str
    root_cause: str | None
    action_plan: str
    due_date: date | None
    effectiveness_review: str | None
    status: str
    completed_at: datetime | None


class RiskCreate(BaseModel):
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    risk_code: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=2, max_length=300)
    description: str
    category: str | None = None
    # likelihood is the probability rating; inherent_score = likelihood * impact.
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    residual_score: int | None = None
    treatment: str | None = None
    due_date: date | None = None


class RiskUpdate(BaseModel):
    department_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    title: str | None = Field(None, min_length=2, max_length=300)
    description: str | None = None
    category: str | None = None
    likelihood: int | None = Field(None, ge=1, le=5)
    impact: int | None = Field(None, ge=1, le=5)
    residual_score: int | None = None
    treatment: str | None = None
    due_date: date | None = None
    status: str | None = None


class RiskRead(TimestampedModel):
    client_id: uuid.UUID
    department_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    risk_code: str
    title: str
    description: str
    category: str | None
    likelihood: int
    impact: int
    inherent_score: int
    residual_score: int | None
    treatment: str | None
    due_date: date | None
    status: str
    closed_at: datetime | None

    @computed_field
    @property
    def risk_level(self) -> str:
        return risk_level_from_score(self.inherent_score)


class AuditTrailRead(TimestampedModel):
    client_id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    changes: dict
    ip_address: str | None
    user_agent: str | None
    status: str


class LookupCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    sort_order: int = 0
    metadata_json: dict = Field(default_factory=dict)


class LookupUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=200)
    sort_order: int | None = None
    metadata_json: dict | None = None
    status: str | None = None


class LookupRead(TimestampedModel):
    client_id: uuid.UUID | None
    category: str
    code: str
    label: str
    sort_order: int
    metadata_json: dict
    status: str


class DashboardSummary(BaseModel):
    total_kpis: int
    active_kpis: int
    pending_evidence: int
    approved_evidence: int
    open_gaps: int
    open_capa: int
    overdue_capa: int
    policies_pending_review: int
    active_frameworks_count: int
