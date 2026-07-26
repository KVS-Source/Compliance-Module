from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import CAPA, Department, Gap, Risk, User
from app.schemas.domain import CAPACreate, CAPARead, CAPAUpdate
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)
from app.services.evidence import require_approved_evidence


router = APIRouter(prefix="/capa", tags=["capa"])


@router.get("", response_model=list[CAPARead])
def list_capa(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db), status_filter: str | None = None
) -> list[CAPA]:
    query = select(CAPA).where(CAPA.client_id == current_user.client_id)
    if status_filter:
        query = query.where(CAPA.status == status_filter)
    return list(db.scalars(query.order_by(CAPA.created_at.desc())))


@router.post("", response_model=CAPARead, status_code=201)
def create_capa(payload: CAPACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CAPA:
    validate_tenant_reference(db, Gap, payload.gap_id, current_user.client_id)
    validate_tenant_reference(db, Risk, payload.risk_id, current_user.client_id)
    validate_tenant_reference(db, Department, payload.department_id, current_user.client_id)
    validate_tenant_reference(db, User, payload.owner_user_id, current_user.client_id)
    capa = CAPA(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(capa)
    add_audit(db, user=current_user, action="create", entity_type="capa", entity_id=capa.id)
    commit_or_conflict(db)
    db.refresh(capa)
    return capa


@router.patch("/{capa_id}", response_model=CAPARead)
def update_capa(
    capa_id: uuid.UUID, payload: CAPAUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> CAPA:
    capa = tenant_get_or_404(db, CAPA, capa_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    validate_tenant_reference(db, User, values.get("owner_user_id"), current_user.client_id)
    if values.get("status") in {"completed", "closed"}:
        require_approved_evidence(db, client_id=current_user.client_id, entity_type="capa", entity_id=capa.id)
        values["completed_at"] = datetime.now(UTC)
    elif "status" in values:
        values["completed_at"] = None
    changes = apply_changes(capa, values)
    action = "complete" if values.get("status") in {"completed", "closed"} else "update"
    add_audit(db, user=current_user, action=action, entity_type="capa", entity_id=capa.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(capa)
    return capa
