from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Department, Policy, PolicyRegister, User
from app.schemas.domain import (
    PolicyCreate,
    PolicyRead,
    PolicyRegisterCreate,
    PolicyRegisterRead,
    PolicyRegisterUpdate,
)
from app.services.common import (
    add_audit,
    apply_changes,
    commit_or_conflict,
    tenant_get_or_404,
    validate_tenant_reference,
)
from app.services.evidence import require_approved_evidence


router = APIRouter(tags=["policy_register"])


@router.get("/policies", response_model=list[PolicyRead])
def list_policies(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Policy]:
    return list(db.scalars(select(Policy).where(Policy.client_id == current_user.client_id).order_by(Policy.policy_code)))


@router.post("/policies", response_model=PolicyRead, status_code=201)
def create_policy(payload: PolicyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Policy:
    validate_tenant_reference(db, Department, payload.department_id, current_user.client_id)
    validate_tenant_reference(db, User, payload.owner_user_id, current_user.client_id)
    policy = Policy(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(policy)
    add_audit(db, user=current_user, action="create", entity_type="policy", entity_id=policy.id)
    commit_or_conflict(db, "Policy code already exists for this client")
    db.refresh(policy)
    return policy


@router.get("/policy-register", response_model=list[PolicyRegisterRead])
def list_register(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[PolicyRegister]:
    return list(db.scalars(select(PolicyRegister).where(PolicyRegister.client_id == current_user.client_id).order_by(PolicyRegister.created_at.desc())))


@router.post("/policy-register", response_model=PolicyRegisterRead, status_code=201)
def create_register(
    payload: PolicyRegisterCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PolicyRegister:
    tenant_get_or_404(db, Policy, payload.policy_id, current_user.client_id)
    register = PolicyRegister(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(register)
    add_audit(db, user=current_user, action="create", entity_type="policy_register", entity_id=register.id)
    commit_or_conflict(db, "This policy version is already registered")
    db.refresh(register)
    return register


@router.patch("/policy-register/{register_id}", response_model=PolicyRegisterRead)
def update_register(
    register_id: uuid.UUID,
    payload: PolicyRegisterUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PolicyRegister:
    register = tenant_get_or_404(db, PolicyRegister, register_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("status") == "approved":
        values["approval_status"] = "approved"
    elif values.get("status") == "reviewed":
        values["review_status"] = "approved"
    if (
        values.get("approval_status") == "approved"
        or values.get("review_status") == "approved"
        or values.get("status") in {"approved", "reviewed", "closed"}
    ):
        require_approved_evidence(
            db, client_id=current_user.client_id, entity_type="policy_register", entity_id=register.id
        )
    now = datetime.now(UTC)
    if values.get("approval_status") == "approved":
        values.update(approved_by=current_user.id, approved_at=now)
    elif "approval_status" in values:
        values.update(approved_by=None, approved_at=None)
        if register.status == "approved" and "status" not in values:
            values["status"] = "draft"
    if values.get("review_status") == "approved":
        values.update(reviewed_by=current_user.id, reviewed_at=now)
    elif "review_status" in values:
        values.update(reviewed_by=None, reviewed_at=None)
    changes = apply_changes(register, values)
    action = "approval_or_review_decision" if "approval_status" in values or "review_status" in values else "update"
    add_audit(db, user=current_user, action=action, entity_type="policy_register", entity_id=register.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(register)
    return register
