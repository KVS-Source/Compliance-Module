from datetime import date, datetime
from decimal import Decimal
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Client(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "clients"
    __table_args__ = (Index("ix_clients_status", "status"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(320))
    settings: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("client_id", "email", name="uq_users_client_email"),
        Index("ix_users_client_id", "client_id"),
        Index("ix_users_status", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    client: Mapped[Client] = relationship()


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("client_id", "name", name="uq_roles_client_name"),
        Index("ix_roles_client_id", "client_id"),
        Index("ix_roles_status", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class Permission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "permissions"
    __table_args__ = (Index("ix_permissions_status", "status"),)

    code: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class UserRole(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("ix_user_roles_client_id", "client_id"),
        Index("ix_user_roles_role_id", "role_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )


class RolePermission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
        Index("ix_role_permissions_client_id", "client_id"),
        Index("ix_role_permissions_permission_id", "permission_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False
    )


class Department(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("client_id", "code", name="uq_departments_client_code"),
        Index("ix_departments_client_id", "client_id"),
        Index("ix_departments_status", "status"),
        Index("ix_departments_parent_id", "parent_department_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    parent_department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )


class Employee(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("client_id", "employee_code", name="uq_employees_client_code"),
        Index("ix_employees_client_id", "client_id"),
        Index("ix_employees_department_id", "department_id"),
        Index("ix_employees_manager_id", "manager_id"),
        Index("ix_employees_status", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )
    employee_code: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    designation: Mapped[str | None] = mapped_column(String(150))
    employment_type: Mapped[str | None] = mapped_column(String(50))
    joining_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    exit_date: Mapped[date | None] = mapped_column(Date)
    # exit_reason is sensitive HR data; API routes mask it from non-HR readers.
    exit_reason: Mapped[str | None] = mapped_column(Text)
    current_work: Mapped[str | None] = mapped_column(Text)


class Framework(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "frameworks"
    __table_args__ = (
        UniqueConstraint("code", "version", name="uq_frameworks_code_version"),
        Index("ix_frameworks_status", "status"),
    )

    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="active", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Control(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "controls"
    __table_args__ = (
        UniqueConstraint("framework_id", "control_code", name="uq_controls_framework_code"),
        UniqueConstraint("framework_id", "id", name="uq_controls_framework_id_id"),
        Index("ix_controls_framework_id", "framework_id"),
        Index("ix_controls_status", "status"),
    )

    framework_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False
    )
    control_code: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class Checkpoint(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "checkpoints"
    __table_args__ = (
        UniqueConstraint("control_id", "checkpoint_code", name="uq_checkpoints_control_code"),
        UniqueConstraint(
            "framework_id", "control_id", "id", name="uq_checkpoints_framework_control_id"
        ),
        ForeignKeyConstraint(
            ["framework_id", "control_id"],
            ["controls.framework_id", "controls.id"],
            name="fk_checkpoints_framework_control",
        ),
        Index("ix_checkpoints_framework_id", "framework_id"),
        Index("ix_checkpoints_status", "status"),
    )

    framework_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False
    )
    control_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("controls.id", ondelete="CASCADE"), nullable=False
    )
    checkpoint_code: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    guidance: Mapped[str | None] = mapped_column(Text)
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class Policy(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "policies"
    __table_args__ = (
        UniqueConstraint("client_id", "policy_code", name="uq_policies_client_code"),
        Index("ix_policies_client_id", "client_id"),
        Index("ix_policies_department_id", "department_id"),
        Index("ix_policies_status", "status"),
        Index("ix_policies_owner_user_id", "owner_user_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    policy_code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    use_in_scope: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)


class PolicyRegister(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "policy_register"
    __table_args__ = (
        UniqueConstraint("client_id", "policy_id", "version", name="uq_policy_register_version"),
        Index("ix_policy_register_client_id", "client_id"),
        Index("ix_policy_register_status", "status"),
        Index("ix_policy_register_client_approval", "client_id", "approval_status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(30), nullable=False)
    effective_date: Mapped[date | None] = mapped_column(Date)
    next_review_date: Mapped[date | None] = mapped_column(Date)
    approval_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    review_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class KPI(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "kpis"
    __table_args__ = (
        UniqueConstraint("client_id", "kpi_code", name="uq_kpis_client_code"),
        Index("ix_kpis_client_id", "client_id"),
        Index("ix_kpis_kpi_code", "kpi_code"),
        Index("ix_kpis_department_id", "department_id"),
        Index("ix_kpis_status", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kpi_code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(50))
    frequency: Mapped[str] = mapped_column(String(30), default="monthly", nullable=False)
    calculation_method: Mapped[str | None] = mapped_column(Text)
    direction: Mapped[str] = mapped_column(String(30), default="higher_is_better", nullable=False)
    use_in_scope: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class KPITarget(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "kpi_targets"
    __table_args__ = (
        UniqueConstraint("client_id", "kpi_id", "period_start", "period_end", name="uq_kpi_targets_period"),
        Index("ix_kpi_targets_client_id", "client_id"),
        Index("ix_kpi_targets_status", "status"),
        Index("ix_kpi_targets_client_kpi", "client_id", "kpi_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    kpi_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    target_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    warning_threshold: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    critical_threshold: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class KPIActual(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "kpi_actuals"
    __table_args__ = (
        UniqueConstraint("client_id", "kpi_id", "period_start", "period_end", name="uq_kpi_actuals_period"),
        Index("ix_kpi_actuals_client_id", "client_id"),
        Index("ix_kpi_actuals_status", "status"),
        Index("ix_kpi_actuals_approval_status", "approval_status"),
        Index("ix_kpi_actuals_client_kpi", "client_id", "kpi_id"),
        Index("ix_kpi_actuals_client_status", "client_id", "status"),
        Index("ix_kpi_actuals_target_id", "kpi_target_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    kpi_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False
    )
    kpi_target_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("kpi_targets.id", ondelete="SET NULL")
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    target_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    actual_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    variance: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    rag_status: Mapped[str] = mapped_column(String(20), default="amber", nullable=False)
    approval_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class KPIFrameworkMapping(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "kpi_framework_mapping"
    __table_args__ = (
        UniqueConstraint("client_id", "kpi_id", "framework_id", "control_id", name="uq_kpi_framework_mapping"),
        Index("ix_kpi_framework_mapping_client_id", "client_id"),
        Index("ix_kpi_framework_mapping_framework_id", "framework_id"),
        Index("ix_kpi_framework_mapping_status", "status"),
        Index("ix_kpi_framework_mapping_client_kpi", "client_id", "kpi_id"),
        Index(
            "uq_kpi_framework_mapping_framework_only",
            "client_id",
            "kpi_id",
            "framework_id",
            unique=True,
            postgresql_where=text("control_id IS NULL"),
            sqlite_where=text("control_id IS NULL"),
        ),
        ForeignKeyConstraint(
            ["framework_id", "control_id"],
            ["controls.framework_id", "controls.id"],
            name="fk_kpi_mapping_framework_control",
        ),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    kpi_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False)
    framework_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False
    )
    control_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("controls.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class EvidenceDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "evidence_documents"
    __table_args__ = (
        Index("ix_evidence_documents_client_id", "client_id"),
        Index("ix_evidence_documents_status", "status"),
        Index("ix_evidence_documents_approval_status", "approval_status"),
        Index("ix_evidence_documents_client_approval", "client_id", "approval_status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_provider: Mapped[str] = mapped_column(String(30), default="local", nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(150))
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    approval_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class EvidenceLink(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "evidence_links"
    __table_args__ = (
        UniqueConstraint("client_id", "evidence_document_id", "entity_type", "entity_id", name="uq_evidence_links_entity"),
        Index("ix_evidence_links_client_id", "client_id"),
        Index("ix_evidence_links_entity", "client_id", "entity_type", "entity_id"),
        Index("ix_evidence_links_status", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    evidence_document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("evidence_documents.id", ondelete="CASCADE"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    link_type: Mapped[str] = mapped_column(String(40), default="supporting", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class Gap(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "gaps"
    __table_args__ = (
        Index("ix_gaps_client_id", "client_id"),
        Index("ix_gaps_framework_id", "framework_id"),
        Index("ix_gaps_department_id", "department_id"),
        Index("ix_gaps_status", "status"),
        Index("ix_gaps_client_status", "client_id", "status"),
        Index("ix_gaps_control_id", "control_id"),
        Index("ix_gaps_checkpoint_id", "checkpoint_id"),
        ForeignKeyConstraint(
            ["framework_id", "control_id"],
            ["controls.framework_id", "controls.id"],
            name="fk_gaps_framework_control",
        ),
        ForeignKeyConstraint(
            ["framework_id", "control_id", "checkpoint_id"],
            ["checkpoints.framework_id", "checkpoints.control_id", "checkpoints.id"],
            name="fk_gaps_framework_control_checkpoint",
        ),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    framework_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("frameworks.id", ondelete="SET NULL"))
    control_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("controls.id", ondelete="SET NULL"))
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("checkpoints.id", ondelete="SET NULL"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(30), default="medium", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Risk(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "risks"
    __table_args__ = (
        UniqueConstraint("client_id", "risk_code", name="uq_risks_client_code"),
        Index("ix_risks_client_id", "client_id"),
        Index("ix_risks_department_id", "department_id"),
        Index("ix_risks_status", "status"),
        Index("ix_risks_client_status", "client_id", "status"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    risk_code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    likelihood: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    inherent_score: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    residual_score: Mapped[int | None] = mapped_column(Integer)
    treatment: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CAPA(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "capa"
    __table_args__ = (
        Index("ix_capa_client_id", "client_id"),
        Index("ix_capa_department_id", "department_id"),
        Index("ix_capa_status", "status"),
        Index("ix_capa_client_status", "client_id", "status"),
        Index("ix_capa_gap_id", "gap_id"),
        Index("ix_capa_risk_id", "risk_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    gap_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("gaps.id", ondelete="SET NULL"))
    risk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("risks.id", ondelete="SET NULL"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    capa_type: Mapped[str] = mapped_column(String(30), default="corrective", nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    root_cause: Mapped[str | None] = mapped_column(Text)
    action_plan: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    effectiveness_review: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditTrail(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "audit_trail"
    __table_args__ = (
        Index("ix_audit_trail_client_id", "client_id"),
        Index("ix_audit_trail_entity", "client_id", "entity_type", "entity_id"),
        Index("ix_audit_trail_status", "status"),
        Index("ix_audit_trail_client_created", "client_id", "created_at"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    changes: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30), default="recorded", nullable=False)


class Lookup(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "lookups"
    __table_args__ = (
        UniqueConstraint("client_id", "category", "code", name="uq_lookups_client_category_code"),
        Index("ix_lookups_client_id", "client_id"),
        Index("ix_lookups_status", "status"),
        Index(
            "uq_lookups_global_category_code",
            "category",
            "code",
            unique=True,
            postgresql_where=text("client_id IS NULL"),
            sqlite_where=text("client_id IS NULL"),
        ),
    )

    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


# Validation constraints that are portable across PostgreSQL and test databases.
KPI.__table__.append_constraint(
    CheckConstraint("NOT enabled OR use_in_scope", name="ck_kpis_enabled_requires_scope")
)
KPITarget.__table__.append_constraint(
    CheckConstraint("period_end >= period_start", name="ck_kpi_targets_valid_period")
)
KPIActual.__table__.append_constraint(
    CheckConstraint("period_end >= period_start", name="ck_kpi_actuals_valid_period")
)
KPIActual.__table__.append_constraint(
    CheckConstraint(
        "approval_status IN ('pending', 'approved', 'rejected', 'more_info_required')",
        name="ck_kpi_actuals_approval_status",
    )
)
KPIActual.__table__.append_constraint(
    CheckConstraint("rag_status IN ('red', 'amber', 'green')", name="ck_kpi_actuals_rag_status")
)
PolicyRegister.__table__.append_constraint(
    CheckConstraint(
        "approval_status IN ('pending', 'approved', 'rejected', 'more_info_required')",
        name="ck_policy_register_approval_status",
    )
)
PolicyRegister.__table__.append_constraint(
    CheckConstraint(
        "review_status IN ('pending', 'approved', 'rejected', 'more_info_required')",
        name="ck_policy_register_review_status",
    )
)
EvidenceDocument.__table__.append_constraint(
    CheckConstraint(
        "approval_status IN ('pending', 'approved', 'rejected', 'more_info_required')",
        name="ck_evidence_documents_approval_status",
    )
)
Risk.__table__.append_constraint(CheckConstraint("likelihood BETWEEN 1 AND 5", name="ck_risks_likelihood"))
Risk.__table__.append_constraint(CheckConstraint("impact BETWEEN 1 AND 5", name="ck_risks_impact"))


# Every tenant-owned parent exposes (client_id, id) as a candidate key so child
# tables can enforce tenant consistency with composite foreign keys. The regular
# id foreign keys remain for their CASCADE/SET NULL behavior.
_TENANT_MODELS = (
    User,
    Role,
    UserRole,
    RolePermission,
    Department,
    Employee,
    Policy,
    PolicyRegister,
    KPI,
    KPITarget,
    KPIActual,
    KPIFrameworkMapping,
    EvidenceDocument,
    EvidenceLink,
    Gap,
    Risk,
    CAPA,
    AuditTrail,
    Lookup,
)
for _model in _TENANT_MODELS:
    _model.__table__.append_constraint(
        UniqueConstraint("client_id", "id", name=f"uq_{_model.__tablename__}_client_id_id")
    )


def _tenant_fk(model, local_column: str, target_table: str, *, name: str) -> None:
    model.__table__.append_constraint(
        ForeignKeyConstraint(
            ["client_id", local_column],
            [f"{target_table}.client_id", f"{target_table}.id"],
            name=name,
        )
    )


for _model, _column, _target, _name in (
    (UserRole, "user_id", "users", "fk_user_roles_client_user"),
    (UserRole, "role_id", "roles", "fk_user_roles_client_role"),
    (RolePermission, "role_id", "roles", "fk_role_permissions_client_role"),
    (Department, "parent_department_id", "departments", "fk_departments_client_parent"),
    (Employee, "department_id", "departments", "fk_employees_client_department"),
    (Employee, "manager_id", "employees", "fk_employees_client_manager"),
    (Employee, "user_id", "users", "fk_employees_client_user"),
    (Policy, "department_id", "departments", "fk_policies_client_department"),
    (Policy, "owner_user_id", "users", "fk_policies_client_owner"),
    (PolicyRegister, "policy_id", "policies", "fk_policy_register_client_policy"),
    (PolicyRegister, "approved_by", "users", "fk_policy_register_client_approver"),
    (PolicyRegister, "reviewed_by", "users", "fk_policy_register_client_reviewer"),
    (KPI, "department_id", "departments", "fk_kpis_client_department"),
    (KPI, "owner_user_id", "users", "fk_kpis_client_owner"),
    (KPITarget, "kpi_id", "kpis", "fk_kpi_targets_client_kpi"),
    (KPIActual, "kpi_id", "kpis", "fk_kpi_actuals_client_kpi"),
    (KPIActual, "submitted_by", "users", "fk_kpi_actuals_client_submitter"),
    (KPIActual, "approved_by", "users", "fk_kpi_actuals_client_approver"),
    (KPIFrameworkMapping, "kpi_id", "kpis", "fk_kpi_mapping_client_kpi"),
    (EvidenceDocument, "uploaded_by", "users", "fk_evidence_documents_client_uploader"),
    (EvidenceDocument, "approved_by", "users", "fk_evidence_documents_client_approver"),
    (EvidenceLink, "evidence_document_id", "evidence_documents", "fk_evidence_links_client_document"),
    (Gap, "department_id", "departments", "fk_gaps_client_department"),
    (Gap, "owner_user_id", "users", "fk_gaps_client_owner"),
    (Risk, "department_id", "departments", "fk_risks_client_department"),
    (Risk, "owner_user_id", "users", "fk_risks_client_owner"),
    (CAPA, "gap_id", "gaps", "fk_capa_client_gap"),
    (CAPA, "risk_id", "risks", "fk_capa_client_risk"),
    (CAPA, "department_id", "departments", "fk_capa_client_department"),
    (CAPA, "owner_user_id", "users", "fk_capa_client_owner"),
    (AuditTrail, "user_id", "users", "fk_audit_trail_client_user"),
):
    _tenant_fk(_model, _column, _target, name=_name)

# A selected KPI target must belong to both the same tenant and the same KPI.
KPITarget.__table__.append_constraint(
    UniqueConstraint("client_id", "kpi_id", "id", name="uq_kpi_targets_client_kpi_id")
)
KPIActual.__table__.append_constraint(
    ForeignKeyConstraint(
        ["client_id", "kpi_id", "kpi_target_id"],
        ["kpi_targets.client_id", "kpi_targets.kpi_id", "kpi_targets.id"],
        name="fk_kpi_actuals_client_kpi_target",
    )
)

EvidenceLink.__table__.append_constraint(
    CheckConstraint(
        "entity_type IN ('kpi_actual', 'policy_register', 'capa', 'audit', 'training', "
        "'incident', 'risk', 'checkpoint', 'gap', 'other')",
        name="ck_evidence_links_entity_type",
    )
)
