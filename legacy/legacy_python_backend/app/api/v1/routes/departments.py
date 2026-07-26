import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Department, User
from app.schemas.domain import DepartmentCreate, DepartmentRead, DepartmentUpdate
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)


router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentRead])
def list_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str | None = None,
) -> list[Department]:
    query = select(Department).where(Department.client_id == current_user.client_id)
    if status_filter:
        query = query.where(Department.status == status_filter)
    return list(db.scalars(query.order_by(Department.code)))


@router.post("", response_model=DepartmentRead, status_code=201)
def create_department(
    payload: DepartmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Department:
    # A parent department must belong to the same client (returns 404 otherwise).
    validate_tenant_reference(db, Department, payload.parent_department_id, current_user.client_id)
    department = Department(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(department)
    add_audit(db, user=current_user, action="create", entity_type="department", entity_id=department.id)
    commit_or_conflict(db, "Department code already exists for this client")
    db.refresh(department)
    return department


@router.get("/{department_id}", response_model=DepartmentRead)
def get_department(
    department_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Department:
    return tenant_get_or_404(db, Department, department_id, current_user.client_id)


@router.patch("/{department_id}", response_model=DepartmentRead)
def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Department:
    department = tenant_get_or_404(db, Department, department_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    validate_tenant_reference(db, Department, values.get("parent_department_id"), current_user.client_id)
    changes = apply_changes(department, values)
    add_audit(db, user=current_user, action="update", entity_type="department", entity_id=department.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(department)
    return department
