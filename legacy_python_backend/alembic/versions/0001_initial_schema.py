"""Initial normalized GenBioCa GRC schema.

Revision ID: 0001_initial_schema
Revises: None
"""

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The baseline is generated from the versioned SQLAlchemy metadata. Future
    # schema changes should be added as normal explicit Alembic revisions.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=False)


def downgrade() -> None:
    for table_name in [
        "audit_trail",
        "evidence_links",
        "kpi_framework_mapping",
        "kpi_actuals",
        "kpi_targets",
        "capa",
        "gaps",
        "risks",
        "policy_register",
        "policies",
        "evidence_documents",
        "checkpoints",
        "controls",
        "kpis",
        "employees",
        "departments",
        "role_permissions",
        "user_roles",
        "roles",
        "permissions",
        "users",
        "lookups",
        "frameworks",
        "clients",
    ]:
        op.drop_table(table_name)
