import hashlib
from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import EvidenceDocument, EvidenceLink


def has_approved_evidence(
    db: Session, *, client_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    EvidenceLink.client_id == client_id,
                    EvidenceLink.entity_type == entity_type,
                    EvidenceLink.entity_id == entity_id,
                    EvidenceLink.status == "active",
                    EvidenceDocument.id == EvidenceLink.evidence_document_id,
                    EvidenceDocument.client_id == client_id,
                    EvidenceDocument.status == "active",
                    EvidenceDocument.approval_status == "approved",
                )
            )
        )
    )


def require_approved_evidence(
    db: Session, *, client_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
) -> None:
    if not has_approved_evidence(
        db, client_id=client_id, entity_type=entity_type, entity_id=entity_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved evidence must be linked before this workflow transition",
        )


async def save_local_upload(file: UploadFile, client_id: uuid.UUID) -> dict:
    target_dir = Path(settings.local_storage_path).resolve() / str(client_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "upload").suffix.lower()
    stored_filename = f"{uuid.uuid4()}{suffix}"
    destination = target_dir / stored_filename
    digest = hashlib.sha256()
    size = 0
    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Maximum upload size is {settings.max_upload_size_mb} MB",
                    )
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "original_filename": file.filename or "upload",
        "stored_filename": stored_filename,
        "storage_provider": "local",
        "storage_path": str(destination),
        "content_type": file.content_type,
        "size_bytes": size,
        "checksum_sha256": digest.hexdigest(),
    }
