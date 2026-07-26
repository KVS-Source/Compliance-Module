import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_platform_admin
from app.core.database import get_db
from app.core.security import hash_password
from app.models.models import Client, User
from app.schemas.domain import ClientCreate, ClientRead, UserCreate, UserRead
from app.services.common import add_audit, commit_or_conflict


router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/me", response_model=ClientRead)
def get_my_client(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Client:
    return db.get(Client, current_user.client_id)  # type: ignore[return-value]


@router.get("", response_model=list[ClientRead])
def list_clients(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)) -> list[Client]:
    return list(db.scalars(select(Client).order_by(Client.name)))


@router.post("", response_model=ClientRead, status_code=201)
def create_client(
    payload: ClientCreate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> Client:
    client = Client(id=uuid.uuid4(), **payload.model_dump())
    db.add(client)
    add_audit(db, user=current_user, action="create", entity_type="client", entity_id=client.id)
    commit_or_conflict(db, "Client slug already exists")
    db.refresh(client)
    return client


@router.post("/{client_id}/admin", response_model=UserRead, status_code=201)
def create_client_admin(
    client_id: uuid.UUID,
    payload: UserCreate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> User:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    values = payload.model_dump(exclude={"password", "is_superuser"})
    user = User(
        id=uuid.uuid4(),
        client_id=client.id,
        password_hash=hash_password(payload.password),
        is_superuser=True,
        **values,
    )
    user.email = user.email.lower()
    db.add(user)
    add_audit(db, user=current_user, action="create_client_admin", entity_type="user", entity_id=user.id)
    commit_or_conflict(db, "Email already exists for this client")
    db.refresh(user)
    return user
