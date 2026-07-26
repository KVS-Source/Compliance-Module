from datetime import UTC, datetime
from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import KPI, KPIActual, KPITarget, User
from app.schemas.domain import KPIActualCreate, KPIActualRead, KPIActualUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict, tenant_get_or_404
from app.services.evidence import require_approved_evidence


router = APIRouter(prefix="/kpi-actuals", tags=["kpi_actuals"])


@router.get("", response_model=list[KPIActualRead])
def list_actuals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    kpi_id: uuid.UUID | None = None,
    approval_status: str | None = None,
) -> list[KPIActual]:
    query = select(KPIActual).where(KPIActual.client_id == current_user.client_id)
    if kpi_id:
        query = query.where(KPIActual.kpi_id == kpi_id)
    if approval_status:
        query = query.where(KPIActual.approval_status == approval_status)
    return list(db.scalars(query.order_by(KPIActual.period_start.desc())))


@router.post("", response_model=KPIActualRead, status_code=201)
def create_actual(
    payload: KPIActualCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> KPIActual:
    kpi = tenant_get_or_404(db, KPI, payload.kpi_id, current_user.client_id)
    if not kpi.use_in_scope or not kpi.enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Actuals require an enabled, in-scope KPI")
    values = payload.model_dump()
    if payload.kpi_target_id:
        target = tenant_get_or_404(db, KPITarget, payload.kpi_target_id, current_user.client_id)
        if target.kpi_id != payload.kpi_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Target belongs to a different KPI")
        values["target_value"] = target.target_value
    values["variance"] = Decimal(values["actual_value"]) - Decimal(values["target_value"])
    actual = KPIActual(
        id=uuid.uuid4(), client_id=current_user.client_id, submitted_by=current_user.id, **values
    )
    db.add(actual)
    add_audit(db, user=current_user, action="submit", entity_type="kpi_actual", entity_id=actual.id)
    commit_or_conflict(db, "An actual already exists for this KPI period")
    db.refresh(actual)
    return actual


@router.patch("/{actual_id}", response_model=KPIActualRead)
def update_actual(
    actual_id: uuid.UUID,
    payload: KPIActualUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KPIActual:
    actual = tenant_get_or_404(db, KPIActual, actual_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("approval_status") == "approved" or values.get("status") in {"completed", "closed"}:
        require_approved_evidence(
            db, client_id=current_user.client_id, entity_type="kpi_actual", entity_id=actual.id
        )
    if values.get("approval_status") == "approved":
        values.update(approved_by=current_user.id, approved_at=datetime.now(UTC))
    elif "approval_status" in values:
        values.update(approved_by=None, approved_at=None)
    final_target = Decimal(values.get("target_value", actual.target_value))
    final_actual = Decimal(values.get("actual_value", actual.actual_value))
    values["variance"] = final_actual - final_target
    changes = apply_changes(actual, values)
    if values.get("approval_status") == "approved":
        action = "approve"
    elif values.get("approval_status") in {"rejected", "more_info_required"}:
        action = "approval_decision"
    elif values.get("status") in {"completed", "closed"}:
        action = "close"
    else:
        action = "update"
    add_audit(db, user=current_user, action=action, entity_type="kpi_actual", entity_id=actual.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(actual)
    return actual
