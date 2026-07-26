from datetime import date, timedelta
import uuid

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.api.v1.routes.dashboard import dashboard_summary
from app.core.database import Base
from app.models.models import (
    CAPA,
    Client,
    EvidenceDocument,
    Framework,
    Gap,
    KPI,
    KPIFrameworkMapping,
    Policy,
    PolicyRegister,
    User,
)


def uid() -> uuid.UUID:
    return uuid.uuid4()


def test_dashboard_counts_are_client_scoped_and_framework_allowlisted() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as db:
        client_a = Client(id=uid(), name="Client A", slug="client-a")
        client_b = Client(id=uid(), name="Client B", slug="client-b")
        db.add_all([client_a, client_b])
        db.flush()
        user_a = User(
            id=uid(),
            client_id=client_a.id,
            email="a@example.com",
            password_hash="not-used",
            full_name="User A",
        )
        db.add(user_a)

        iso = Framework(id=uid(), code="ISO_9001", name="ISO 9001", version="2015")
        gdpr = Framework(id=uid(), code="GDPR", name="GDPR", version="legacy")
        db.add_all([iso, gdpr])
        db.flush()

        kpi_a = KPI(id=uid(), client_id=client_a.id, kpi_code="A-1", name="A KPI")
        kpi_b = KPI(id=uid(), client_id=client_b.id, kpi_code="B-1", name="B KPI")
        db.add_all([kpi_a, kpi_b])
        db.flush()
        db.add_all(
            [
                KPIFrameworkMapping(
                    id=uid(), client_id=client_a.id, kpi_id=kpi_a.id, framework_id=iso.id
                ),
                KPIFrameworkMapping(
                    id=uid(), client_id=client_b.id, kpi_id=kpi_b.id, framework_id=gdpr.id
                ),
                EvidenceDocument(
                    id=uid(),
                    client_id=client_a.id,
                    original_filename="a.txt",
                    stored_filename="a.txt",
                    storage_path="/tmp/a.txt",
                    size_bytes=1,
                    checksum_sha256="a" * 64,
                    approval_status="approved",
                ),
                EvidenceDocument(
                    id=uid(),
                    client_id=client_b.id,
                    original_filename="b.txt",
                    stored_filename="b.txt",
                    storage_path="/tmp/b.txt",
                    size_bytes=1,
                    checksum_sha256="b" * 64,
                    approval_status="pending",
                ),
                Gap(
                    id=uid(),
                    client_id=client_b.id,
                    title="Other tenant gap",
                    description="Must not count for A",
                ),
                CAPA(
                    id=uid(),
                    client_id=client_a.id,
                    title="A overdue CAPA",
                    action_plan="Complete it",
                    due_date=date.today() - timedelta(days=1),
                ),
            ]
        )
        policy_a = Policy(
            id=uid(), client_id=client_a.id, policy_code="A-POL", title="A Policy"
        )
        policy_b = Policy(
            id=uid(), client_id=client_b.id, policy_code="B-POL", title="B Policy"
        )
        db.add_all([policy_a, policy_b])
        db.flush()
        db.add_all(
            [
                PolicyRegister(
                    id=uid(), client_id=client_a.id, policy_id=policy_a.id, version="1.0"
                ),
                PolicyRegister(
                    id=uid(), client_id=client_b.id, policy_id=policy_b.id, version="1.0"
                ),
            ]
        )
        db.commit()

        summary = dashboard_summary(current_user=user_a, db=db)
        assert summary.model_dump() == {
            "total_kpis": 1,
            "active_kpis": 1,
            "pending_evidence": 0,
            "approved_evidence": 1,
            "open_gaps": 0,
            "open_capa": 1,
            "overdue_capa": 1,
            "policies_pending_review": 1,
            "active_frameworks_count": 1,
        }
