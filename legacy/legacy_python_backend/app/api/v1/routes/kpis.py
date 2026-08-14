import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Control, Department, Framework, KPI, KPIFrameworkMapping, User
from app.schemas.domain import (
    KPICreate,
    KPIFrameworkMappingCreate,
    KPIFrameworkMappingRead,
    KPIRead,
    KPIUpdate,
)
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/kpis", tags=["kpis"])


@router.get("", response_model=list[KPIRead])
def list_kpis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    use_in_scope: bool | None = None,
    status_filter: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> list[KPI]:
    query = select(KPI).where(KPI.client_id == current_user.client_id)
    if use_in_scope is not None:
        query = query.where(KPI.use_in_scope == use_in_scope)
    if status_filter:
        query = query.where(KPI.status == status_filter)
    return list(db.scalars(query.order_by(KPI.kpi_code).offset(offset).limit(min(limit, 200))))


@router.get("/{kpi_id}", response_model=KPIRead)
def get_kpi(kpi_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> KPI:
    return tenant_get_or_404(db, KPI, kpi_id, current_user.client_id)


@router.get("/{kpi_id}/framework-mappings", response_model=list[KPIFrameworkMappingRead])
def list_framework_mappings(
    kpi_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[KPIFrameworkMapping]:
    tenant_get_or_404(db, KPI, kpi_id, current_user.client_id)
    return list(
        db.scalars(
            select(KPIFrameworkMapping)
            .join(Framework, Framework.id == KPIFrameworkMapping.framework_id)
            .where(
                KPIFrameworkMapping.client_id == current_user.client_id,
                KPIFrameworkMapping.kpi_id == kpi_id,
                KPIFrameworkMapping.status == "active",
                Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
                Framework.status == "active",
                Framework.is_active.is_(True),
            )
        )
    )


@router.post("/{kpi_id}/framework-mappings", response_model=KPIFrameworkMappingRead, status_code=201)
def create_framework_mapping(
    kpi_id: uuid.UUID,
    payload: KPIFrameworkMappingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KPIFrameworkMapping:
    tenant_get_or_404(db, KPI, kpi_id, current_user.client_id)
    if payload.kpi_id != kpi_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Body kpi_id must match path kpi_id")
    framework = db.get(Framework, payload.framework_id)
    if (
        framework is None
        or framework.code not in ACTIVE_FRAMEWORK_CODES
        or framework.status != "active"
        or not framework.is_active
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Framework is not in the current active scope")
    if payload.control_id:
        control = db.get(Control, payload.control_id)
        if control is None or control.framework_id != framework.id or control.status != "active":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Control is not active in this framework")
    mapping = KPIFrameworkMapping(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(mapping)
    add_audit(db, user=current_user, action="create", entity_type="kpi_framework_mapping", entity_id=mapping.id)
    commit_or_conflict(db, "This KPI framework mapping already exists")
    db.refresh(mapping)
    return mapping


@router.post("", response_model=KPIRead, status_code=201)
def create_kpi(payload: KPICreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> KPI:
    validate_tenant_reference(db, Department, payload.department_id, current_user.client_id)
    validate_tenant_reference(db, User, payload.owner_user_id, current_user.client_id)
    kpi = KPI(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(kpi)
    add_audit(db, user=current_user, action="create", entity_type="kpi", entity_id=kpi.id)
    commit_or_conflict(db, "KPI code already exists for this client")
    db.refresh(kpi)
    return kpi


@router.patch("/{kpi_id}", response_model=KPIRead)
def update_kpi(
    kpi_id: uuid.UUID, payload: KPIUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> KPI:
    kpi = tenant_get_or_404(db, KPI, kpi_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    validate_tenant_reference(db, Department, values.get("department_id"), current_user.client_id)
    validate_tenant_reference(db, User, values.get("owner_user_id"), current_user.client_id)
    if values.get("use_in_scope") is False:
        values["enabled"] = False
    final_scope = values.get("use_in_scope", kpi.use_in_scope)
    final_enabled = values.get("enabled", kpi.enabled)
    if final_enabled and not final_scope:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="enabled KPI must have use_in_scope=true")
    changes = apply_changes(kpi, values)
    add_audit(db, user=current_user, action="update", entity_type="kpi", entity_id=kpi.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(kpi)
    return kpi
