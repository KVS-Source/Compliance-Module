from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import (
    CAPA,
    EvidenceDocument,
    Framework,
    Gap,
    KPI,
    KPIFrameworkMapping,
    PolicyRegister,
    User,
)
from app.schemas.domain import DashboardSummary
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    client_id = current_user.client_id

    def count(model, *conditions) -> int:
        return int(db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)

    return DashboardSummary(
        total_kpis=count(KPI, KPI.client_id == client_id),
        active_kpis=count(
            KPI,
            KPI.client_id == client_id,
            KPI.use_in_scope.is_(True),
            KPI.enabled.is_(True),
            KPI.status == "active",
        ),
        pending_evidence=count(
            EvidenceDocument,
            EvidenceDocument.client_id == client_id,
            EvidenceDocument.approval_status.in_(["pending", "more_info_required"]),
            EvidenceDocument.status == "active",
        ),
        approved_evidence=count(
            EvidenceDocument,
            EvidenceDocument.client_id == client_id,
            EvidenceDocument.approval_status == "approved",
            EvidenceDocument.status == "active",
        ),
        open_gaps=count(Gap, Gap.client_id == client_id, Gap.status != "closed"),
        open_capa=count(CAPA, CAPA.client_id == client_id, CAPA.status.not_in(["completed", "closed"])),
        overdue_capa=count(
            CAPA,
            CAPA.client_id == client_id,
            CAPA.status.not_in(["completed", "closed"]),
            CAPA.due_date.is_not(None),
            CAPA.due_date < date.today(),
        ),
        policies_pending_review=count(
            PolicyRegister,
            PolicyRegister.client_id == client_id,
            PolicyRegister.review_status.in_(["pending", "more_info_required"]),
        ),
        active_frameworks_count=int(
            db.scalar(
                select(func.count(func.distinct(Framework.id)))
                .select_from(KPIFrameworkMapping)
                .join(KPI, KPI.id == KPIFrameworkMapping.kpi_id)
                .join(Framework, Framework.id == KPIFrameworkMapping.framework_id)
                .where(
                    KPIFrameworkMapping.client_id == client_id,
                    KPIFrameworkMapping.status == "active",
                    KPI.client_id == client_id,
                    KPI.use_in_scope.is_(True),
                    KPI.enabled.is_(True),
                    KPI.status == "active",
                    Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
                    Framework.is_active.is_(True),
                    Framework.status == "active",
                )
            )
            or 0
        ),
    )
