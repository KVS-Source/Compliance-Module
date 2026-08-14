import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.models import Permission, Role, RolePermission, User
from app.schemas.domain import (
    PermissionCreate,
    PermissionRead,
    RolePermissionCreate,
    RolePermissionRead,
)
from app.services.common import add_audit, commit_or_conflict, tenant_get_or_404


# Permissions are a global catalog, so this router carries no single prefix; it
# serves both /permissions and the tenant-scoped /roles/{role_id}/permissions.
router = APIRouter(tags=["permissions"])


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(
    _: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.code)))


@router.post("/permissions", response_model=PermissionRead, status_code=201)
def create_permission(
    payload: PermissionCreate,
    current_user: User = Depends(require_permission("admin.manage")),
    db: Session = Depends(get_db),
) -> Permission:
    permission = Permission(id=uuid.uuid4(), **payload.model_dump())
    db.add(permission)
    add_audit(db, user=current_user, action="create", entity_type="permission", entity_id=permission.id)
    commit_or_conflict(db, "Permission code already exists")
    db.refresh(permission)
    return permission


@router.get("/roles/{role_id}/permissions", response_model=list[PermissionRead])
def list_role_permissions(
    role_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Permission]:
    tenant_get_or_404(db, Role, role_id, current_user.client_id)
    return list(
        db.scalars(
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(
                RolePermission.client_id == current_user.client_id,
                RolePermission.role_id == role_id,
            )
            .order_by(Permission.code)
        )
    )


@router.post("/roles/{role_id}/permissions", response_model=RolePermissionRead, status_code=201)
def assign_permission_to_role(
    role_id: uuid.UUID,
    payload: RolePermissionCreate,
    current_user: User = Depends(require_permission("admin.manage")),
    db: Session = Depends(get_db),
) -> RolePermission:
    tenant_get_or_404(db, Role, role_id, current_user.client_id)
    if db.get(Permission, payload.permission_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    assignment = RolePermission(
        id=uuid.uuid4(),
        client_id=current_user.client_id,
        role_id=role_id,
        permission_id=payload.permission_id,
    )
    db.add(assignment)
    add_audit(
        db, user=current_user, action="assign_permission", entity_type="role_permission", entity_id=assignment.id,
        changes={"role_id": str(role_id), "permission_id": str(payload.permission_id)},
    )
    commit_or_conflict(db, "This permission is already assigned to the role")
    db.refresh(assignment)
    return assignment


@router.delete("/roles/{role_id}/permissions/{permission_id}", status_code=204)
def remove_permission_from_role(
    role_id: uuid.UUID,
    permission_id: uuid.UUID,
    current_user: User = Depends(require_permission("admin.manage")),
    db: Session = Depends(get_db),
) -> Response:
    tenant_get_or_404(db, Role, role_id, current_user.client_id)
    assignment = db.scalar(
        select(RolePermission).where(
            RolePermission.client_id == current_user.client_id,
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
    )
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role permission not found")
    db.delete(assignment)
    add_audit(
        db, user=current_user, action="remove_permission", entity_type="role_permission", entity_id=assignment.id,
        changes={"role_id": str(role_id), "permission_id": str(permission_id)},
    )
    commit_or_conflict(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
