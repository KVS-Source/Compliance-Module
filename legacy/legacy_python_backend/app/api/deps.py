from collections.abc import Callable
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import Permission, RolePermission, User, UserRole


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        client_id = uuid.UUID(payload["client_id"])
    except (ValueError, KeyError):
        raise unauthorized

    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.client_id == client_id,
            User.is_active.is_(True),
        )
    )
    if user is None:
        raise unauthorized
    return user


def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superuser access required")
    return current_user


def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator access required")
    return current_user


def user_has_permission(db: Session, user: User, code: str) -> bool:
    """Return True if the user holds a permission code through any of its roles.

    Tenant superusers and platform administrators implicitly hold every
    permission. This is the basic foundation for fine-grained RBAC; see the
    README note about the planned authorization layer.
    """
    if user.is_superuser or user.is_platform_admin:
        return True
    return bool(
        db.scalar(
            select(
                exists().where(
                    UserRole.user_id == user.id,
                    UserRole.role_id == RolePermission.role_id,
                    RolePermission.permission_id == Permission.id,
                    Permission.code == code,
                    Permission.status == "active",
                )
            )
        )
    )


def require_permission(code: str) -> Callable[..., User]:
    """Build a dependency that requires a specific permission code.

    Example: ``current_user: User = Depends(require_permission("admin.manage"))``.
    """

    def dependency(
        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> User:
        if not user_has_permission(db, current_user, code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{code}' is required",
            )
        return current_user

    return dependency


def has_hr_access(user: User) -> bool:
    """Whether a user may see or edit sensitive HR fields (e.g. exit_reason).

    TODO: When a dedicated HR role/permission exists, also grant access to users
    holding it. For the current MVP, HR access is limited to tenant superusers
    and platform administrators.
    """
    return user.is_superuser or user.is_platform_admin


def require_hr_access(current_user: User = Depends(get_current_user)) -> User:
    if not has_hr_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access (tenant superuser or platform administrator) is required",
        )
    return current_user
