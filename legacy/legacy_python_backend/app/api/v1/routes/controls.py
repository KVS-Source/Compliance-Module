import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_platform_admin
from app.core.database import get_db
from app.models.models import Control, Framework, User
from app.schemas.domain import ControlCreate, ControlRead, ControlUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/controls", tags=["controls"])


def _require_active_framework(db: Session, framework_id: uuid.UUID) -> Framework:
    """Ensure a framework exists and is one of the current active frameworks.

    Removed frameworks (GDPR, SOC, ADA, WCAG, ...) are rejected so controls can
    never be created or updated under an out-of-scope framework.
    """
    framework = db.get(Framework, framework_id)
    if (
        framework is None
        or framework.code not in ACTIVE_FRAMEWORK_CODES
        or framework.status != "active"
        or not framework.is_active
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Framework is not in the current active scope")
    return framework


@router.get("", response_model=list[ControlRead])
def list_controls(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    framework_id: uuid.UUID | None = None,
    include_out_of_scope: bool = False,
) -> list[Control]:
    query = select(Control).join(Framework, Framework.id == Control.framework_id)
    if framework_id:
        query = query.where(Control.framework_id == framework_id)
    if not include_out_of_scope:
        query = query.where(
            Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
            Framework.status == "active",
            Framework.is_active.is_(True),
        )
    return list(db.scalars(query.order_by(Control.control_code)))


@router.get("/{control_id}", response_model=ControlRead)
def get_control(
    control_id: uuid.UUID, _: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Control:
    control = db.get(Control, control_id)
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")
    return control


@router.post("", response_model=ControlRead, status_code=201)
def create_control(
    payload: ControlCreate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> Control:
    _require_active_framework(db, payload.framework_id)
    control = Control(id=uuid.uuid4(), **payload.model_dump())
    db.add(control)
    add_audit(db, user=current_user, action="create", entity_type="control", entity_id=control.id)
    commit_or_conflict(db, "Control code already exists for this framework")
    db.refresh(control)
    return control


@router.patch("/{control_id}", response_model=ControlRead)
def update_control(
    control_id: uuid.UUID,
    payload: ControlUpdate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> Control:
    control = db.get(Control, control_id)
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")
    _require_active_framework(db, control.framework_id)
    changes = apply_changes(control, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="control", entity_id=control.id, changes=changes)
    commit_or_conflict(db, "Control code already exists for this framework")
    db.refresh(control)
    return control
