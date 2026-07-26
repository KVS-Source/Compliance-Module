from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Framework, User
from app.schemas.domain import FrameworkRead
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES


router = APIRouter(prefix="/frameworks", tags=["frameworks"])


@router.get("", response_model=list[FrameworkRead])
def list_frameworks(
    _: User = Depends(get_current_user), db: Session = Depends(get_db), include_out_of_scope: bool = False
) -> list[Framework]:
    query = select(Framework)
    if not include_out_of_scope:
        query = query.where(
            Framework.code.in_(ACTIVE_FRAMEWORK_CODES),
            Framework.is_active.is_(True),
            Framework.status == "active",
        )
    return list(db.scalars(query.order_by(Framework.code)))
