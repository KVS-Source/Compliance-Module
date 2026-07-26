import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, has_hr_access, require_hr_access
from app.core.database import get_db
from app.models.models import Department, Employee, User
from app.schemas.domain import EmployeeCreate, EmployeeRead, EmployeeUpdate
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)


router = APIRouter(prefix="/employees", tags=["employees"])


def _serialize(employee: Employee, *, include_sensitive: bool) -> EmployeeRead:
    """Return an EmployeeRead, masking sensitive HR fields when not permitted."""
    data = EmployeeRead.model_validate(employee)
    if not include_sensitive:
        data.exit_reason = None
    return data


def _validate_references(db: Session, values: dict, client_id: uuid.UUID) -> None:
    validate_tenant_reference(db, Department, values.get("department_id"), client_id)
    validate_tenant_reference(db, Employee, values.get("manager_id"), client_id)
    validate_tenant_reference(db, User, values.get("user_id"), client_id)


@router.get("", response_model=list[EmployeeRead])
def list_employees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    department_id: uuid.UUID | None = None,
    status_filter: str | None = None,
) -> list[EmployeeRead]:
    query = select(Employee).where(Employee.client_id == current_user.client_id)
    if department_id:
        query = query.where(Employee.department_id == department_id)
    if status_filter:
        query = query.where(Employee.status == status_filter)
    include_sensitive = has_hr_access(current_user)
    return [
        _serialize(employee, include_sensitive=include_sensitive)
        for employee in db.scalars(query.order_by(Employee.employee_code))
    ]


@router.post("", response_model=EmployeeRead, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    # HR-sensitive record: restricted to tenant superuser / platform admin for now.
    current_user: User = Depends(require_hr_access),
    db: Session = Depends(get_db),
) -> EmployeeRead:
    values = payload.model_dump()
    _validate_references(db, values, current_user.client_id)
    employee = Employee(id=uuid.uuid4(), client_id=current_user.client_id, **values)
    db.add(employee)
    add_audit(db, user=current_user, action="create", entity_type="employee", entity_id=employee.id)
    commit_or_conflict(db, "Employee code already exists for this client")
    db.refresh(employee)
    return _serialize(employee, include_sensitive=True)


@router.get("/{employee_id}", response_model=EmployeeRead)
def get_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeRead:
    employee = tenant_get_or_404(db, Employee, employee_id, current_user.client_id)
    return _serialize(employee, include_sensitive=has_hr_access(current_user))


@router.patch("/{employee_id}", response_model=EmployeeRead)
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    # Editing employees (including sensitive exit_reason) is HR-only for now.
    current_user: User = Depends(require_hr_access),
    db: Session = Depends(get_db),
) -> EmployeeRead:
    employee = tenant_get_or_404(db, Employee, employee_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    _validate_references(db, values, current_user.client_id)
    changes = apply_changes(employee, values)
    add_audit(db, user=current_user, action="update", entity_type="employee", entity_id=employee.id, changes=changes)
    commit_or_conflict(db, "Employee code already exists for this client")
    db.refresh(employee)
    return _serialize(employee, include_sensitive=True)
