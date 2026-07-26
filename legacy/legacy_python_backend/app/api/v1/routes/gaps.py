from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Checkpoint, Control, Department, Framework, Gap, User
from app.schemas.domain import GapCreate, GapRead, GapUpdate
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)
from app.services.evidence import require_approved_evidence
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/gaps", tags=["gaps"])


@router.get("", response_model=list[GapRead])
def list_gaps(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db), status_filter: str | None = None
) -> list[Gap]:
    query = select(Gap).where(Gap.client_id == current_user.client_id)
    if status_filter:
        query = query.where(Gap.status == status_filter)
    return list(db.scalars(query.order_by(Gap.created_at.desc())))


@router.post("", response_model=GapRead, status_code=201)
def create_gap(payload: GapCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Gap:
    validate_tenant_reference(db, Department, payload.department_id, current_user.client_id)
    validate_tenant_reference(db, User, payload.owner_user_id, current_user.client_id)
    if payload.framework_id:
        framework = db.get(Framework, payload.framework_id)
        if (
            framework is None
            or framework.code not in ACTIVE_FRAMEWORK_CODES
            or framework.status != "active"
            or not framework.is_active
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Framework is not in current scope")
    if payload.control_id:
        control = db.get(Control, payload.control_id)
        if control is None or control.framework_id != payload.framework_id or control.status != "active":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Control does not belong to the active framework")
    if payload.checkpoint_id:
        checkpoint = db.get(Checkpoint, payload.checkpoint_id)
        if (
            checkpoint is None
            or checkpoint.framework_id != payload.framework_id
            or checkpoint.control_id != payload.control_id
            or checkpoint.status != "active"
        ):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Checkpoint does not belong to the active control")
    gap = Gap(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(gap)
    add_audit(db, user=current_user, action="create", entity_type="gap", entity_id=gap.id)
    commit_or_conflict(db)
    db.refresh(gap)
    return gap


@router.patch("/{gap_id}", response_model=GapRead)
def update_gap(
    gap_id: uuid.UUID, payload: GapUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Gap:
    gap = tenant_get_or_404(db, Gap, gap_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    validate_tenant_reference(db, User, values.get("owner_user_id"), current_user.client_id)
    if values.get("status") == "closed":
        require_approved_evidence(db, client_id=current_user.client_id, entity_type="gap", entity_id=gap.id)
        values["closed_at"] = datetime.now(UTC)
    elif "status" in values:
        values["closed_at"] = None
    changes = apply_changes(gap, values)
    action = "close" if values.get("status") == "closed" else "update"
    add_audit(db, user=current_user, action=action, entity_type="gap", entity_id=gap.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(gap)
    return gap
