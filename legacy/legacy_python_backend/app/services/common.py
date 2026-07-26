from typing import Any, TypeVar
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models.models import AuditTrail, User


ModelT = TypeVar("ModelT", bound=Base)


def tenant_get_or_404(
    db: Session, model: type[ModelT], entity_id: uuid.UUID, client_id: uuid.UUID
) -> ModelT:
    entity = db.scalar(
        select(model).where(model.id == entity_id, model.client_id == client_id)  # type: ignore[attr-defined]
    )
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{model.__name__} not found")
    return entity


def validate_tenant_reference(
    db: Session,
    model: type[ModelT],
    entity_id: uuid.UUID | None,
    client_id: uuid.UUID,
) -> None:
    if entity_id is not None:
        tenant_get_or_404(db, model, entity_id, client_id)


def apply_changes(entity: Any, changes: dict[str, Any]) -> dict[str, Any]:
    audit_changes: dict[str, Any] = {}
    for key, value in changes.items():
        previous = getattr(entity, key)
        if previous != value:
            audit_changes[key] = {"from": str(previous), "to": str(value)}
            setattr(entity, key, value)
    return audit_changes


def add_audit(
    db: Session,
    *,
    user: User,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    changes: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditTrail(
            client_id=user.client_id,
            user_id=user.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes or {},
        )
    )


def commit_or_conflict(db: Session, detail: str = "A record with these values already exists") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
