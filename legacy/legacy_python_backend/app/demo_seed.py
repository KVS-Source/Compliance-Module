"""Idempotent GenBioCa demonstration data for local development and UI work."""

from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
import hashlib
import os
from pathlib import Path
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.models import (
    AuditTrail,
    CAPA,
    Checkpoint,
    Client,
    Control,
    Department,
    Employee,
    EvidenceDocument,
    EvidenceLink,
    Framework,
    Gap,
    KPI,
    KPIActual,
    KPIFrameworkMapping,
    KPITarget,
    Lookup,
    Permission,
    Policy,
    PolicyRegister,
    Risk,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.seed import seed_reference_data
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


def _new_id() -> uuid.UUID:
    return uuid.uuid4()


def _one_or_create(db: Session, model, filters: dict, values: dict):
    record = db.scalar(select(model).filter_by(**filters))
    if record is None:
        record = model(id=_new_id(), **filters, **values)
        db.add(record)
        db.flush()
    return record


def _link_evidence(
    db: Session,
    *,
    client_id: uuid.UUID,
    document_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
) -> EvidenceLink:
    return _one_or_create(
        db,
        EvidenceLink,
        {
            "client_id": client_id,
            "evidence_document_id": document_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
        {"link_type": "supporting", "status": "active"},
    )


def seed_demo_data() -> None:
    seed_reference_data()
    today = date.today()
    period_start = today.replace(day=1)
    period_end = today.replace(day=monthrange(today.year, today.month)[1])

    with SessionLocal() as db:
        client = _one_or_create(
            db,
            Client,
            {"slug": "genbioca"},
            {
                "name": "GenBioCa",
                "contact_email": "compliance@genbioca.local",
                "status": "active",
                "settings": {"demo": True, "timezone": "Asia/Kolkata"},
            },
        )

        department_specs = {
            "CMP": "Compliance",
            "OPS": "Operations",
            "HR": "Human Resources",
            "QMS": "Quality Management",
        }
        departments = {
            code: _one_or_create(
                db,
                Department,
                {"client_id": client.id, "code": code},
                {"name": name, "status": "active"},
            )
            for code, name in department_specs.items()
        }

        permission_specs = {
            "dashboard.read": "View dashboard",
            "users.manage": "Manage tenant users",
            "kpis.manage": "Manage KPIs",
            "policies.manage": "Manage policies",
            "evidence.manage": "Upload and review evidence",
            "gaps.manage": "Manage gaps",
            "capa.manage": "Manage corrective and preventive actions",
        }
        permissions = {
            code: _one_or_create(
                db,
                Permission,
                {"code": code},
                {"name": name, "description": f"Demo permission: {name}", "status": "active"},
            )
            for code, name in permission_specs.items()
        }

        role_permission_codes = {
            "Administrator": set(permission_specs),
            "Compliance Manager": {
                "dashboard.read",
                "kpis.manage",
                "policies.manage",
                "evidence.manage",
                "gaps.manage",
                "capa.manage",
            },
            "KPI Owner": {"dashboard.read", "kpis.manage", "evidence.manage"},
            "HR User": {"dashboard.read", "policies.manage", "evidence.manage"},
        }
        roles: dict[str, Role] = {}
        for role_name, permission_codes in role_permission_codes.items():
            role = _one_or_create(
                db,
                Role,
                {"client_id": client.id, "name": role_name},
                {"description": f"GenBioCa demo role: {role_name}", "status": "active"},
            )
            roles[role_name] = role
            for permission_code in permission_codes:
                _one_or_create(
                    db,
                    RolePermission,
                    {"role_id": role.id, "permission_id": permissions[permission_code].id},
                    {"client_id": client.id},
                )

        user_specs = [
            (
                "admin@genbioca.local",
                "GenBioCa Administrator",
                "Administrator",
                "CMP",
                "DEMO_ADMIN_PASSWORD",
                "ChangeMe-Admin-2026!",
                True,
            ),
            (
                "compliance.manager@genbioca.local",
                "Compliance Manager",
                "Compliance Manager",
                "CMP",
                "DEMO_COMPLIANCE_PASSWORD",
                "ChangeMe-Compliance-2026!",
                False,
            ),
            (
                "kpi.owner@genbioca.local",
                "KPI Owner",
                "KPI Owner",
                "OPS",
                "DEMO_KPI_OWNER_PASSWORD",
                "ChangeMe-KPI-2026!",
                False,
            ),
            (
                "hr@genbioca.local",
                "HR User",
                "HR User",
                "HR",
                "DEMO_HR_PASSWORD",
                "ChangeMe-HR-2026!",
                False,
            ),
        ]
        users: dict[str, User] = {}
        for index, (email, full_name, role_name, department_code, env_name, default_password, is_admin) in enumerate(
            user_specs, start=1
        ):
            user = db.scalar(select(User).where(User.client_id == client.id, User.email == email))
            if user is None:
                user = User(
                    id=_new_id(),
                    client_id=client.id,
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password(os.getenv(env_name, default_password)),
                    is_superuser=is_admin,
                    is_platform_admin=False,
                    is_active=True,
                    status="active",
                )
                db.add(user)
                db.flush()
            users[role_name] = user
            _one_or_create(
                db,
                UserRole,
                {"user_id": user.id, "role_id": roles[role_name].id},
                {"client_id": client.id},
            )
            _one_or_create(
                db,
                Employee,
                {"client_id": client.id, "employee_code": f"GB-{index:03d}"},
                {
                    "department_id": departments[department_code].id,
                    "user_id": user.id,
                    "full_name": full_name,
                    "email": email,
                    "designation": role_name,
                    "status": "active",
                },
            )

        admin = users["Administrator"]
        compliance_manager = users["Compliance Manager"]
        kpi_owner = users["KPI Owner"]

        frameworks = list(
            db.scalars(
                select(Framework)
                .where(
                    Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
                    Framework.status == "active",
                    Framework.is_active.is_(True),
                )
                .order_by(Framework.code)
            )
        )
        if len(frameworks) != 9:
            raise RuntimeError("Expected exactly nine active frameworks after reference seeding")

        controls: dict[uuid.UUID, Control] = {}
        checkpoints: dict[uuid.UUID, Checkpoint] = {}
        for framework in frameworks:
            control = _one_or_create(
                db,
                Control,
                {"framework_id": framework.id, "control_code": "DEMO-001"},
                {
                    "title": f"Demonstration control for {framework.name}",
                    "description": "Non-normative sample control for UI and API testing.",
                    "status": "active",
                },
            )
            checkpoint = _one_or_create(
                db,
                Checkpoint,
                {"control_id": control.id, "checkpoint_code": "DEMO-CP-001"},
                {
                    "framework_id": framework.id,
                    "title": f"Collect sample evidence for {framework.name}",
                    "guidance": "Attach an approved demonstration document.",
                    "evidence_required": True,
                    "status": "active",
                },
            )
            controls[framework.id] = control
            checkpoints[framework.id] = checkpoint

        policy_specs = [
            ("POL-ISMS-001", "Information Security Policy", "CMP"),
            ("POL-HR-001", "Human Resources and Workplace Policy", "HR"),
        ]
        policies: list[Policy] = []
        registers: list[PolicyRegister] = []
        for policy_code, title, department_code in policy_specs:
            policy = _one_or_create(
                db,
                Policy,
                {"client_id": client.id, "policy_code": policy_code},
                {
                    "department_id": departments[department_code].id,
                    "owner_user_id": compliance_manager.id,
                    "title": title,
                    "description": "Demonstration policy record for UI integration.",
                    "use_in_scope": True,
                    "status": "draft",
                },
            )
            register = _one_or_create(
                db,
                PolicyRegister,
                {"client_id": client.id, "policy_id": policy.id, "version": "1.0"},
                {
                    "effective_date": today,
                    "next_review_date": today + timedelta(days=90),
                    "approval_status": "pending",
                    "review_status": "pending",
                    "status": "draft",
                    "notes": "Demo policy awaiting review.",
                },
            )
            policies.append(policy)
            registers.append(register)

        kpi_specs = [
            ("KPI-CMP-001", "Compliance action closure rate", "%", Decimal("95"), departments["CMP"]),
            ("KPI-OPS-001", "Operational review completion", "%", Decimal("90"), departments["OPS"]),
            ("KPI-HR-001", "Mandatory training completion", "%", Decimal("98"), departments["HR"]),
        ]
        kpis: list[KPI] = []
        targets: list[KPITarget] = []
        for kpi_code, name, unit, target_value, department in kpi_specs:
            kpi = _one_or_create(
                db,
                KPI,
                {"client_id": client.id, "kpi_code": kpi_code},
                {
                    "department_id": department.id,
                    "owner_user_id": kpi_owner.id,
                    "name": name,
                    "description": "Demonstration KPI for dashboard and workflow testing.",
                    "unit": unit,
                    "frequency": "monthly",
                    "direction": "higher_is_better",
                    "use_in_scope": True,
                    "enabled": True,
                    "status": "active",
                },
            )
            target = _one_or_create(
                db,
                KPITarget,
                {
                    "client_id": client.id,
                    "kpi_id": kpi.id,
                    "period_start": period_start,
                    "period_end": period_end,
                },
                {
                    "target_value": target_value,
                    "warning_threshold": target_value - Decimal("5"),
                    "critical_threshold": target_value - Decimal("10"),
                    "status": "active",
                },
            )
            kpis.append(kpi)
            targets.append(target)

        for framework_index, framework in enumerate(frameworks):
            kpi = kpis[framework_index % len(kpis)]
            _one_or_create(
                db,
                KPIFrameworkMapping,
                {
                    "client_id": client.id,
                    "kpi_id": kpi.id,
                    "framework_id": framework.id,
                    "control_id": controls[framework.id].id,
                },
                {"status": "active"},
            )

        actual = _one_or_create(
            db,
            KPIActual,
            {
                "client_id": client.id,
                "kpi_id": kpis[0].id,
                "period_start": period_start,
                "period_end": period_end,
            },
            {
                "kpi_target_id": targets[0].id,
                "target_value": targets[0].target_value,
                "actual_value": Decimal("96"),
                "variance": Decimal("1"),
                "rag_status": "green",
                "approval_status": "approved",
                "evidence_required": True,
                "submitted_by": kpi_owner.id,
                "approved_by": compliance_manager.id,
                "approved_at": datetime.now(UTC),
                "status": "open",
                "notes": "Approved demo KPI actual.",
            },
        )

        evidence_bytes = b"GenBioCa demonstration evidence. Not for production compliance use.\n"
        evidence_dir = Path(settings.local_storage_path).resolve() / str(client.id)
        evidence_dir.mkdir(parents=True, exist_ok=True)
        evidence_path = evidence_dir / "genbioca-demo-evidence.txt"
        if not evidence_path.exists():
            evidence_path.write_bytes(evidence_bytes)
        evidence = _one_or_create(
            db,
            EvidenceDocument,
            {"client_id": client.id, "stored_filename": evidence_path.name},
            {
                "original_filename": "genbioca-demo-evidence.txt",
                "storage_provider": "local",
                "storage_path": str(evidence_path),
                "content_type": "text/plain",
                "size_bytes": len(evidence_bytes),
                "checksum_sha256": hashlib.sha256(evidence_bytes).hexdigest(),
                "description": "Approved sample evidence for development testing.",
                "approval_status": "approved",
                "uploaded_by": compliance_manager.id,
                "approved_by": admin.id,
                "approved_at": datetime.now(UTC),
                "status": "active",
            },
        )
        _link_evidence(
            db,
            client_id=client.id,
            document_id=evidence.id,
            entity_type="kpi_actual",
            entity_id=actual.id,
        )
        _link_evidence(
            db,
            client_id=client.id,
            document_id=evidence.id,
            entity_type="policy_register",
            entity_id=registers[0].id,
        )

        iso_27001 = next(framework for framework in frameworks if framework.code == "ISO_27001")
        gap = _one_or_create(
            db,
            Gap,
            {"client_id": client.id, "title": "Evidence retention period not documented"},
            {
                "framework_id": iso_27001.id,
                "control_id": controls[iso_27001.id].id,
                "checkpoint_id": checkpoints[iso_27001.id].id,
                "department_id": departments["CMP"].id,
                "owner_user_id": compliance_manager.id,
                "description": "Demonstration gap for UI workflow testing.",
                "severity": "medium",
                "due_date": today + timedelta(days=14),
                "status": "open",
            },
        )
        capa = _one_or_create(
            db,
            CAPA,
            {"client_id": client.id, "title": "Define and approve evidence retention schedule"},
            {
                "gap_id": gap.id,
                "department_id": departments["CMP"].id,
                "owner_user_id": compliance_manager.id,
                "capa_type": "corrective",
                "root_cause": "Retention ownership was not explicitly assigned.",
                "action_plan": "Draft, review, approve, and communicate a retention schedule.",
                "due_date": today - timedelta(days=5),
                "status": "open",
            },
        )
        _link_evidence(
            db,
            client_id=client.id,
            document_id=evidence.id,
            entity_type="gap",
            entity_id=gap.id,
        )
        _link_evidence(
            db,
            client_id=client.id,
            document_id=evidence.id,
            entity_type="capa",
            entity_id=capa.id,
        )

        _one_or_create(
            db,
            Risk,
            {"client_id": client.id, "risk_code": "RSK-001"},
            {
                "department_id": departments["CMP"].id,
                "owner_user_id": compliance_manager.id,
                "title": "Incomplete compliance evidence",
                "description": "Required evidence may not be available during review.",
                "category": "Compliance",
                "likelihood": 3,
                "impact": 4,
                "inherent_score": 12,
                "residual_score": 6,
                "treatment": "Monthly evidence completeness review.",
                "status": "open",
            },
        )
        _one_or_create(
            db,
            Lookup,
            {"client_id": client.id, "category": "severity", "code": "medium"},
            {"label": "Medium", "sort_order": 20, "metadata_json": {}, "status": "active"},
        )

        existing_seed_audit = db.scalar(
            select(AuditTrail).where(
                AuditTrail.client_id == client.id,
                AuditTrail.action == "demo_seed",
                AuditTrail.entity_type == "client",
                AuditTrail.entity_id == client.id,
            )
        )
        if existing_seed_audit is None:
            db.add(
                AuditTrail(
                    id=_new_id(),
                    client_id=client.id,
                    user_id=admin.id,
                    action="demo_seed",
                    entity_type="client",
                    entity_id=client.id,
                    changes={"dataset": "GenBioCa development demo"},
                )
            )
        db.commit()

    print("GenBioCa demo data is ready.")
    print("Client slug: genbioca")
    print("Admin email: admin@genbioca.local")
    print("Passwords come from DEMO_*_PASSWORD variables or documented development defaults.")


if __name__ == "__main__":
    seed_demo_data()
