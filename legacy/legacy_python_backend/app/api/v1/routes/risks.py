from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Department, Risk, User
from app.schemas.domain import RiskCreate, RiskRead, RiskUpdate
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)


router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("", response_model=list[RiskRead])
def list_risks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str | None = None,
) -> list[Risk]:
    query = select(Risk).where(Risk.client_id == current_user.client_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)
    return list(db.scalars(query.order_by(Risk.risk_code)))


@router.post("", response_model=RiskRead, status_code=201)
def create_risk(
    payload: RiskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Risk:
    validate_tenant_reference(db, Department, payload.department_id, current_user.client_id)
    validate_tenant_reference(db, User, payload.owner_user_id, current_user.client_id)
    values = payload.model_dump()
    # Risk score is probability (likelihood) multiplied by impact.
    values["inherent_score"] = values["likelihood"] * values["impact"]
    risk = Risk(id=uuid.uuid4(), client_id=current_user.client_id, **values)
    db.add(risk)
    add_audit(db, user=current_user, action="create", entity_type="risk", entity_id=risk.id)
    commit_or_conflict(db, "Risk code already exists for this client")
    db.refresh(risk)
    return risk


@router.get("/{risk_id}", response_model=RiskRead)
def get_risk(
    risk_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Risk:
    return tenant_get_or_404(db, Risk, risk_id, current_user.client_id)


@router.patch("/{risk_id}", response_model=RiskRead)
def update_risk(
    risk_id: uuid.UUID,
    payload: RiskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Risk:
    risk = tenant_get_or_404(db, Risk, risk_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    validate_tenant_reference(db, Department, values.get("department_id"), current_user.client_id)
    validate_tenant_reference(db, User, values.get("owner_user_id"), current_user.client_id)
    # Recalculate the score whenever probability or impact changes.
    if "likelihood" in values or "impact" in values:
        likelihood = values.get("likelihood", risk.likelihood)
        impact = values.get("impact", risk.impact)
        values["inherent_score"] = likelihood * impact
    if values.get("status") == "closed":
        values["closed_at"] = datetime.now(UTC)
    elif "status" in values:
        values["closed_at"] = None
    changes = apply_changes(risk, values)
    action = "close" if values.get("status") == "closed" else "update"
    add_audit(db, user=current_user, action=action, entity_type="risk", entity_id=risk.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(risk)
    return risk
