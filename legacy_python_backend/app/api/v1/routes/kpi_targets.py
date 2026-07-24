import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import KPI, KPITarget, User
from app.schemas.domain import KPITargetCreate, KPITargetRead, KPITargetUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict, tenant_get_or_404


router = APIRouter(prefix="/kpi-targets", tags=["kpi_targets"])


@router.get("", response_model=list[KPITargetRead])
def list_targets(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db), kpi_id: uuid.UUID | None = None
) -> list[KPITarget]:
    query = select(KPITarget).where(KPITarget.client_id == current_user.client_id)
    if kpi_id:
        query = query.where(KPITarget.kpi_id == kpi_id)
    return list(db.scalars(query.order_by(KPITarget.period_start.desc())))


@router.post("", response_model=KPITargetRead, status_code=201)
def create_target(
    payload: KPITargetCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> KPITarget:
    kpi = tenant_get_or_404(db, KPI, payload.kpi_id, current_user.client_id)
    if not kpi.use_in_scope or not kpi.enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Targets require an enabled, in-scope KPI")
    target = KPITarget(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(target)
    add_audit(db, user=current_user, action="create", entity_type="kpi_target", entity_id=target.id)
    commit_or_conflict(db, "A target already exists for this KPI period")
    db.refresh(target)
    return target


@router.patch("/{target_id}", response_model=KPITargetRead)
def update_target(
    target_id: uuid.UUID, payload: KPITargetUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> KPITarget:
    target = tenant_get_or_404(db, KPITarget, target_id, current_user.client_id)
    changes = apply_changes(target, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="kpi_target", entity_id=target.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(target)
    return target
