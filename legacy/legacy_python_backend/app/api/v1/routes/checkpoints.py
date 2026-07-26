import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_platform_admin
from app.core.database import get_db
from app.models.models import Checkpoint, Control, Framework, User
from app.schemas.domain import CheckpointCreate, CheckpointRead, CheckpointUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])


def _require_active_framework(db: Session, framework_id: uuid.UUID) -> Framework:
    # Removed frameworks can never carry active checkpoints.
    framework = db.get(Framework, framework_id)
    if (
        framework is None
        or framework.code not in ACTIVE_FRAMEWORK_CODES
        or framework.status != "active"
        or not framework.is_active
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Framework is not in the current active scope")
    return framework


@router.get("", response_model=list[CheckpointRead])
def list_checkpoints(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    framework_id: uuid.UUID | None = None,
    control_id: uuid.UUID | None = None,
    include_out_of_scope: bool = False,
) -> list[Checkpoint]:
    query = select(Checkpoint).join(Framework, Framework.id == Checkpoint.framework_id)
    if framework_id:
        query = query.where(Checkpoint.framework_id == framework_id)
    if control_id:
        query = query.where(Checkpoint.control_id == control_id)
    if not include_out_of_scope:
        query = query.where(
            Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
            Framework.status == "active",
            Framework.is_active.is_(True),
        )
    return list(db.scalars(query.order_by(Checkpoint.checkpoint_code)))


@router.get("/{checkpoint_id}", response_model=CheckpointRead)
def get_checkpoint(
    checkpoint_id: uuid.UUID, _: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Checkpoint:
    checkpoint = db.get(Checkpoint, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")
    return checkpoint


@router.post("", response_model=CheckpointRead, status_code=201)
def create_checkpoint(
    payload: CheckpointCreate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> Checkpoint:
    _require_active_framework(db, payload.framework_id)
    control = db.get(Control, payload.control_id)
    if control is None or control.framework_id != payload.framework_id or control.status != "active":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Control does not belong to the active framework",
        )
    checkpoint = Checkpoint(id=uuid.uuid4(), **payload.model_dump())
    db.add(checkpoint)
    add_audit(db, user=current_user, action="create", entity_type="checkpoint", entity_id=checkpoint.id)
    commit_or_conflict(db, "Checkpoint code already exists for this control")
    db.refresh(checkpoint)
    return checkpoint


@router.patch("/{checkpoint_id}", response_model=CheckpointRead)
def update_checkpoint(
    checkpoint_id: uuid.UUID,
    payload: CheckpointUpdate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> Checkpoint:
    checkpoint = db.get(Checkpoint, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")
    _require_active_framework(db, checkpoint.framework_id)
    changes = apply_changes(checkpoint, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="checkpoint", entity_id=checkpoint.id, changes=changes)
    commit_or_conflict(db, "Checkpoint code already exists for this control")
    db.refresh(checkpoint)
    return checkpoint
