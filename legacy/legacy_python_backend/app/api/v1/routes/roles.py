import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.models import Role, User
from app.schemas.domain import RoleCreate, RoleRead, RoleUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict, tenant_get_or_404


router = APIRouter(prefix="/roles", tags=["roles"])


# Roles are always tenant-scoped (roles.client_id is NOT NULL), so a tenant user
# can only ever list or modify roles that belong to their own client. There is no
# platform-level role in this model that could leak into tenant modification.
@router.get("", response_model=list[RoleRead])
def list_roles(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Role]:
    return list(
        db.scalars(
            select(Role).where(Role.client_id == current_user.client_id).order_by(Role.name)
        )
    )


@router.post("", response_model=RoleRead, status_code=201)
def create_role(
    payload: RoleCreate,
    current_user: User = Depends(require_permission("admin.manage")),
    db: Session = Depends(get_db),
) -> Role:
    role = Role(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(role)
    add_audit(db, user=current_user, action="create", entity_type="role", entity_id=role.id)
    commit_or_conflict(db, "Role name already exists for this client")
    db.refresh(role)
    return role


@router.get("/{role_id}", response_model=RoleRead)
def get_role(
    role_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Role:
    return tenant_get_or_404(db, Role, role_id, current_user.client_id)


@router.patch("/{role_id}", response_model=RoleRead)
def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    current_user: User = Depends(require_permission("admin.manage")),
    db: Session = Depends(get_db),
) -> Role:
    role = tenant_get_or_404(db, Role, role_id, current_user.client_id)
    changes = apply_changes(role, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="role", entity_id=role.id, changes=changes)
    commit_or_conflict(db, "Role name already exists for this client")
    db.refresh(role)
    return role
