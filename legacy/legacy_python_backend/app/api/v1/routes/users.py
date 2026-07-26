import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_superuser
from app.core.database import get_db
from app.core.security import hash_password
from app.models.models import User
from app.schemas.domain import UserCreate, UserRead, UserUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict, tenant_get_or_404


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("", response_model=list[UserRead])
def list_users(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db), offset: int = 0, limit: int = 50
) -> list[User]:
    return list(db.scalars(select(User).where(User.client_id == current_user.client_id).offset(offset).limit(min(limit, 200))))


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> User:
    values = payload.model_dump(exclude={"password"})
    user = User(id=uuid.uuid4(), client_id=current_user.client_id, password_hash=hash_password(payload.password), **values)
    user.email = user.email.lower()
    db.add(user)
    add_audit(db, user=current_user, action="create", entity_type="user", entity_id=user.id)
    commit_or_conflict(db, "Email already exists for this client")
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> User:
    user = tenant_get_or_404(db, User, user_id, current_user.client_id)
    changes = apply_changes(user, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="user", entity_id=user.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(user)
    return user
