"""Tests for the roles, permissions, departments, employees, controls,
checkpoints, risks, and lookups modules.

These follow the existing project style: route functions are called directly
against an in-memory SQLite session instead of going through the HTTP layer.
"""

from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from app.api.deps import has_hr_access, require_hr_access, require_permission, user_has_permission
from app.api.v1.routes.checkpoints import list_checkpoints
from app.api.v1.routes.controls import create_control, list_controls
from app.api.v1.routes.departments import (
    create_department,
    get_department,
    list_departments,
    update_department,
)
from app.api.v1.routes.employees import (
    create_employee,
    get_employee,
    list_employees,
    update_employee,
)
from app.api.v1.routes.lookups import create_lookup, list_lookups
from app.api.v1.routes.permissions import (
    assign_permission_to_role,
    create_permission,
    list_permissions,
    list_role_permissions,
)
from app.api.v1.routes.risks import create_risk, get_risk, update_risk
from app.api.v1.routes.roles import create_role, list_roles
from app.core.database import Base
from app.models.models import (
    AuditTrail,
    Checkpoint,
    Client,
    Control,
    Framework,
    Lookup,
    User,
    UserRole,
)
from app.schemas.domain import (
    ControlCreate,
    DepartmentCreate,
    DepartmentUpdate,
    EmployeeCreate,
    EmployeeUpdate,
    LookupCreate,
    PermissionCreate,
    RiskCreate,
    RiskRead,
    RiskUpdate,
    RoleCreate,
    RolePermissionCreate,
)


def uid() -> uuid.UUID:
    return uuid.uuid4()


def build_session() -> tuple[Session, SimpleNamespace]:
    """Create an isolated in-memory database with two clients and users."""
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    db = Session(engine)

    client_a = Client(id=uid(), name="Client A", slug="client-a")
    client_b = Client(id=uid(), name="Client B", slug="client-b")
    db.add_all([client_a, client_b])
    db.flush()

    def make_user(client, email, **flags) -> User:
        user = User(
            id=uid(),
            client_id=client.id,
            email=email,
            password_hash="not-used",
            full_name=email,
            **flags,
        )
        db.add(user)
        return user

    admin_a = make_user(client_a, "admin-a@example.com", is_superuser=True)
    plain_a = make_user(client_a, "plain-a@example.com")
    platform_a = make_user(client_a, "platform-a@example.com", is_platform_admin=True)
    admin_b = make_user(client_b, "admin-b@example.com", is_superuser=True)

    iso = Framework(id=uid(), code="ISO_9001", name="ISO 9001", version="2015", status="active", is_active=True)
    gdpr = Framework(
        id=uid(), code="GDPR", name="GDPR", version="legacy", status="not_in_current_scope", is_active=False
    )
    db.add_all([iso, gdpr])
    db.flush()

    control = Control(id=uid(), framework_id=iso.id, control_code="C-1", title="Control One", status="active")
    db.add(control)
    db.flush()
    checkpoint = Checkpoint(
        id=uid(),
        framework_id=iso.id,
        control_id=control.id,
        checkpoint_code="CP-1",
        title="Checkpoint One",
        status="active",
    )
    db.add(checkpoint)
    db.commit()

    ctx = SimpleNamespace(
        client_a=client_a,
        client_b=client_b,
        admin_a=admin_a,
        plain_a=plain_a,
        platform_a=platform_a,
        admin_b=admin_b,
        iso=iso,
        gdpr=gdpr,
        control=control,
        checkpoint=checkpoint,
    )
    return db, ctx


def audit_count(db: Session, entity_type: str, action: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(AuditTrail)
            .where(AuditTrail.entity_type == entity_type, AuditTrail.action == action)
        )
        or 0
    )


# --------------------------------------------------------------------------- roles


def test_roles_list_and_create() -> None:
    db, ctx = build_session()
    role = create_role(RoleCreate(name="Auditor"), current_user=ctx.admin_a, db=db)
    assert role.client_id == ctx.client_a.id
    assert role.name == "Auditor"

    names_a = [r.name for r in list_roles(current_user=ctx.plain_a, db=db)]
    assert names_a == ["Auditor"]
    # Client B cannot see Client A's role.
    assert list_roles(current_user=ctx.admin_b, db=db) == []
    assert audit_count(db, "role", "create") == 1


# --------------------------------------------------------------- permissions / RBAC


def test_permissions_list_and_assignment_to_role() -> None:
    db, ctx = build_session()
    permission = create_permission(
        PermissionCreate(code="kpi.view", name="View KPIs"), current_user=ctx.admin_a, db=db
    )
    assert permission.code == "kpi.view"
    assert [p.code for p in list_permissions(_=ctx.plain_a, db=db)] == ["kpi.view"]

    role = create_role(RoleCreate(name="Analyst"), current_user=ctx.admin_a, db=db)
    assignment = assign_permission_to_role(
        role.id, RolePermissionCreate(permission_id=permission.id), current_user=ctx.admin_a, db=db
    )
    assert assignment.role_id == role.id
    assert [p.code for p in list_role_permissions(role.id, current_user=ctx.plain_a, db=db)] == ["kpi.view"]
    assert audit_count(db, "role_permission", "assign_permission") == 1

    # Grant the role to plain_a and confirm the permission helper now resolves it.
    db.add(UserRole(id=uid(), client_id=ctx.client_a.id, user_id=ctx.plain_a.id, role_id=role.id))
    db.commit()
    assert user_has_permission(db, ctx.plain_a, "kpi.view") is True
    assert user_has_permission(db, ctx.plain_a, "admin.manage") is False


def test_require_permission_dependency_blocks_unauthorized() -> None:
    db, ctx = build_session()
    dependency = require_permission("admin.manage")
    # Superuser bypasses the check.
    assert dependency(current_user=ctx.admin_a, db=db) is ctx.admin_a
    # A plain user without the permission is rejected.
    with pytest.raises(HTTPException) as exc:
        dependency(current_user=ctx.plain_a, db=db)
    assert exc.value.status_code == 403


# --------------------------------------------------------------------- departments


def test_departments_create_and_list_scoped_by_client() -> None:
    db, ctx = build_session()
    dept = create_department(
        DepartmentCreate(code="OPS", name="Operations"), current_user=ctx.plain_a, db=db
    )
    assert dept.client_id == ctx.client_a.id

    codes_a = [d.code for d in list_departments(current_user=ctx.plain_a, db=db)]
    assert codes_a == ["OPS"]
    assert list_departments(current_user=ctx.admin_b, db=db) == []
    assert audit_count(db, "department", "create") == 1

    # Update writes an audit entry too.
    update_department(dept.id, DepartmentUpdate(name="Ops Team"), current_user=ctx.plain_a, db=db)
    assert audit_count(db, "department", "update") == 1


def test_department_cross_client_access_rejected() -> None:
    db, ctx = build_session()
    dept = create_department(
        DepartmentCreate(code="OPS", name="Operations"), current_user=ctx.plain_a, db=db
    )
    with pytest.raises(HTTPException) as exc:
        get_department(dept.id, current_user=ctx.admin_b, db=db)
    assert exc.value.status_code == 404


# ----------------------------------------------------------------------- employees


def test_employees_create_and_list_scoped_by_client() -> None:
    db, ctx = build_session()
    employee = create_employee(
        EmployeeCreate(employee_code="E-1", full_name="Alice Analyst"),
        current_user=ctx.admin_a,
        db=db,
    )
    assert employee.client_id == ctx.client_a.id
    codes = [e.employee_code for e in list_employees(current_user=ctx.plain_a, db=db)]
    assert codes == ["E-1"]
    assert list_employees(current_user=ctx.admin_b, db=db) == []
    assert audit_count(db, "employee", "create") == 1


def test_employee_create_requires_hr_access() -> None:
    db, ctx = build_session()
    # A plain (non-superuser) tenant user cannot pass the HR-access gate.
    with pytest.raises(HTTPException) as exc:
        require_hr_access(current_user=ctx.plain_a)
    assert exc.value.status_code == 403
    assert has_hr_access(ctx.admin_a) is True
    assert has_hr_access(ctx.plain_a) is False


def test_employee_exit_reason_masked_for_non_hr_reader() -> None:
    db, ctx = build_session()
    employee = create_employee(
        EmployeeCreate(employee_code="E-1", full_name="Alice Analyst"),
        current_user=ctx.admin_a,
        db=db,
    )
    update_employee(
        employee.id,
        EmployeeUpdate(status="exited", exit_reason="Resigned for a new role"),
        current_user=ctx.admin_a,
        db=db,
    )
    # HR user (superuser) sees the sensitive reason.
    hr_view = get_employee(employee.id, current_user=ctx.admin_a, db=db)
    assert hr_view.exit_reason == "Resigned for a new role"
    # A regular authenticated user gets it masked.
    plain_view = get_employee(employee.id, current_user=ctx.plain_a, db=db)
    assert plain_view.exit_reason is None
    assert plain_view.status == "exited"


# ------------------------------------------------------------ controls / checkpoints


def test_controls_list_and_removed_framework_rejected() -> None:
    db, ctx = build_session()
    controls = list_controls(_=ctx.plain_a, db=db)
    assert [c.control_code for c in controls] == ["C-1"]

    # Platform admin may create under an active framework.
    created = create_control(
        ControlCreate(framework_id=ctx.iso.id, control_code="C-2", title="Control Two"),
        current_user=ctx.platform_a,
        db=db,
    )
    assert created.control_code == "C-2"
    assert audit_count(db, "control", "create") == 1

    # A removed framework (GDPR) cannot receive a new control.
    with pytest.raises(HTTPException) as exc:
        create_control(
            ControlCreate(framework_id=ctx.gdpr.id, control_code="C-X", title="Bad Control"),
            current_user=ctx.platform_a,
            db=db,
        )
    assert exc.value.status_code == 409


def test_checkpoints_list() -> None:
    db, ctx = build_session()
    checkpoints = list_checkpoints(_=ctx.plain_a, db=db)
    assert [c.checkpoint_code for c in checkpoints] == ["CP-1"]


# --------------------------------------------------------------------------- risks


def test_risks_create_and_update_score_and_level() -> None:
    db, ctx = build_session()
    risk = create_risk(
        RiskCreate(risk_code="R-1", title="Data loss", description="Risk of data loss", likelihood=3, impact=4),
        current_user=ctx.plain_a,
        db=db,
    )
    assert risk.inherent_score == 12
    assert RiskRead.model_validate(risk).risk_level == "high"
    assert audit_count(db, "risk", "create") == 1

    updated = update_risk(
        risk.id, RiskUpdate(impact=5), current_user=ctx.plain_a, db=db
    )
    assert updated.inherent_score == 15
    assert RiskRead.model_validate(updated).risk_level == "critical"
    assert audit_count(db, "risk", "update") == 1


def test_risk_cross_client_access_rejected() -> None:
    db, ctx = build_session()
    risk = create_risk(
        RiskCreate(risk_code="R-1", title="Data loss", description="Risk of data loss", likelihood=2, impact=2),
        current_user=ctx.plain_a,
        db=db,
    )
    with pytest.raises(HTTPException) as exc:
        get_risk(risk.id, current_user=ctx.admin_b, db=db)
    assert exc.value.status_code == 404


# ------------------------------------------------------------------------- lookups


def test_lookups_create_and_list_with_global_and_tenant() -> None:
    db, ctx = build_session()
    # A global lookup (client_id is NULL) is visible to every tenant.
    db.add(Lookup(id=uid(), client_id=None, category="severity", code="low", label="Low"))
    db.commit()

    tenant_lookup = create_lookup(
        LookupCreate(category="severity", code="high", label="High"), current_user=ctx.admin_a, db=db
    )
    assert tenant_lookup.client_id == ctx.client_a.id

    codes_a = sorted(l.code for l in list_lookups(current_user=ctx.plain_a, db=db))
    assert codes_a == ["high", "low"]
    # Client B sees only the global lookup, never Client A's tenant lookup.
    codes_b = [l.code for l in list_lookups(current_user=ctx.admin_b, db=db)]
    assert codes_b == ["low"]
    assert audit_count(db, "lookup", "create") == 1
