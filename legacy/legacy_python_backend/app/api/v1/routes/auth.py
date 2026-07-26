from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.models import Client, User
from app.schemas.domain import LoginRequest, Token
from app.services.common import add_audit


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(
        select(User)
        .join(Client, Client.id == User.client_id)
        .where(
            Client.slug == payload.client_slug,
            Client.status == "active",
            User.email == payload.email.lower(),
            User.is_active.is_(True),
        )
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(payload.password, user.password_hash):
        add_audit(db, user=user, action="login_failed", entity_type="user", entity_id=user.id)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.last_login_at = datetime.now(UTC)
    add_audit(db, user=user, action="login", entity_type="user", entity_id=user.id)
    db.commit()
    return Token(access_token=create_access_token(str(user.id), str(user.client_id)))
