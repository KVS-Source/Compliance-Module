from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import (
    CAPA,
    Checkpoint,
    EvidenceDocument,
    EvidenceLink,
    Framework,
    Gap,
    KPIActual,
    PolicyRegister,
    Risk,
    User,
)
from app.schemas.domain import EvidenceLinkCreate, EvidenceLinkRead, EvidenceRead, EvidenceUpdate
from app.services.common import add_audit, apply_changes, commit_or_conflict, tenant_get_or_404
from app.services.evidence import save_local_upload
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/evidence", tags=["evidence"])

TENANT_ENTITY_MODELS = {
    "kpi_actual": KPIActual,
    "policy_register": PolicyRegister,
    "capa": CAPA,
    "risk": Risk,
    "gap": Gap,
}


@router.get("", response_model=list[EvidenceRead])
def list_evidence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    approval_status: str | None = None,
) -> list[EvidenceDocument]:
    query = select(EvidenceDocument).where(EvidenceDocument.client_id == current_user.client_id)
    if approval_status:
        query = query.where(EvidenceDocument.approval_status == approval_status)
    return list(db.scalars(query.order_by(EvidenceDocument.created_at.desc())))


@router.post("/upload", response_model=EvidenceRead, status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    description: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceDocument:
    metadata = await save_local_upload(file, current_user.client_id)
    document = EvidenceDocument(
        id=uuid.uuid4(),
        client_id=current_user.client_id,
        uploaded_by=current_user.id,
        description=description,
        **metadata,
    )
    db.add(document)
    add_audit(db, user=current_user, action="upload", entity_type="evidence_document", entity_id=document.id)
    commit_or_conflict(db)
    db.refresh(document)
    return document


@router.post("/links", response_model=EvidenceLinkRead, status_code=201)
def create_evidence_link(
    payload: EvidenceLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceLink:
    tenant_get_or_404(db, EvidenceDocument, payload.evidence_document_id, current_user.client_id)
    model = TENANT_ENTITY_MODELS.get(payload.entity_type)
    if model:
        tenant_get_or_404(db, model, payload.entity_id, current_user.client_id)
    elif payload.entity_type == "checkpoint":
        checkpoint = db.get(Checkpoint, payload.entity_id)
        if checkpoint is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")
        framework = db.get(Framework, checkpoint.framework_id)
        if (
            checkpoint.status != "active"
            or framework is None
            or framework.code not in ACTIVE_FRAMEWORK_CODES
            or framework.status != "active"
            or not framework.is_active
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Checkpoint is not in current scope")
    # audit, training, incident, and other are reserved for later business modules;
    # audit intentionally does not mean the immutable audit_trail table.
    link = EvidenceLink(id=uuid.uuid4(), client_id=current_user.client_id, **payload.model_dump())
    db.add(link)
    add_audit(db, user=current_user, action="link", entity_type="evidence_link", entity_id=link.id)
    commit_or_conflict(db, "This evidence is already linked to that record")
    db.refresh(link)
    return link


@router.get("/links", response_model=list[EvidenceLinkRead])
def list_evidence_links(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> list[EvidenceLink]:
    query = select(EvidenceLink).where(EvidenceLink.client_id == current_user.client_id)
    if entity_type:
        query = query.where(EvidenceLink.entity_type == entity_type)
    if entity_id:
        query = query.where(EvidenceLink.entity_id == entity_id)
    return list(db.scalars(query.order_by(EvidenceLink.created_at.desc())))


@router.patch("/{evidence_id}", response_model=EvidenceRead)
def update_evidence(
    evidence_id: uuid.UUID,
    payload: EvidenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceDocument:
    document = tenant_get_or_404(db, EvidenceDocument, evidence_id, current_user.client_id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("approval_status") == "approved":
        values.update(approved_by=current_user.id, approved_at=datetime.now(UTC))
    elif "approval_status" in values:
        values.update(approved_by=None, approved_at=None)
    changes = apply_changes(document, values)
    if values.get("approval_status") == "approved":
        action = "approve"
    elif "approval_status" in values:
        action = "approval_decision"
    else:
        action = "update"
    add_audit(db, user=current_user, action=action, entity_type="evidence_document", entity_id=document.id, changes=changes)
    commit_or_conflict(db)
    db.refresh(document)
    return document
