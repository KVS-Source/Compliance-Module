import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_superuser
from app.core.database import get_db
from app.models.models import Lookup, User
from app.schemas.domain import LookupCreate, LookupRead, LookupUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict


router = APIRouter(prefix="/lookups", tags=["lookups"])


@router.get("", response_model=list[LookupRead])
def list_lookups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    category: str | None = None,
) -> list[Lookup]:
    # Return global lookups (client_id IS NULL) plus this client's own lookups.
    query = select(Lookup).where(
        or_(Lookup.client_id.is_(None), Lookup.client_id == current_user.client_id)
    )
    if category:
        query = query.where(Lookup.category == category)
    return list(db.scalars(query.order_by(Lookup.category, Lookup.sort_order, Lookup.code)))


@router.post("", response_model=LookupRead, status_code=201)
def create_lookup(
    payload: LookupCreate,
    current_user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> Lookup:
    # Tenant users create tenant-scoped lookups; global lookups are seeded/managed
    # separately. client_id always comes from the JWT, never the request body.
    lookup = Lookup(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(lookup)
    add_audit(db, user=current_user, action="create", entity_type="lookup", entity_id=lookup.id)
    commit_or_conflict(db, "This lookup category/code already exists for this client")
    db.refresh(lookup)
    return lookup


@router.get("/{lookup_id}", response_model=LookupRead)
def get_lookup(
    lookup_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Lookup:
    lookup = db.scalar(
        select(Lookup).where(
            Lookup.id == lookup_id,
            or_(Lookup.client_id.is_(None), Lookup.client_id == current_user.client_id),
        )
    )
    if lookup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lookup not found")
    return lookup


@router.patch("/{lookup_id}", response_model=LookupRead)
def update_lookup(
    lookup_id: uuid.UUID,
    payload: LookupUpdate,
    current_user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> Lookup:
    # Only this client's own lookups are editable; global lookups stay read-only here.
    lookup = db.scalar(
        select(Lookup).where(Lookup.id == lookup_id, Lookup.client_id == current_user.client_id)
    )
    if lookup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lookup not found")
    changes = apply_changes(lookup, payload.model_dump(exclude_unset=True))
    add_audit(db, user=current_user, action="update", entity_type="lookup", entity_id=lookup.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(lookup)
    return lookup
