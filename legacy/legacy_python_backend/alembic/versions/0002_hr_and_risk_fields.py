"""Add HR employee fields and risk due date.

Revision ID: 0002_hr_and_risk_fields
Revises: 0001_initial_schema

Additive change only. New columns are nullable so existing rows are unaffected.
`employees.manager_id` uses a tenant-safe composite foreign key so a manager must
belong to the same client, matching the pattern used for other tenant references.
"""

import sqlalchemy as sa
from alembic import op


revision = "0002_hr_and_risk_fields"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("manager_id", sa.Uuid(), nullable=True))
    op.add_column("employees", sa.Column("employment_type", sa.String(length=50), nullable=True))
    op.add_column("employees", sa.Column("joining_date", sa.Date(), nullable=True))
    op.add_column("employees", sa.Column("exit_date", sa.Date(), nullable=True))
    op.add_column("employees", sa.Column("exit_reason", sa.Text(), nullable=True))
    op.add_column("employees", sa.Column("current_work", sa.Text(), nullable=True))
    op.create_index("ix_employees_manager_id", "employees", ["manager_id"])
    op.create_foreign_key(
        "fk_employees_manager_id",
        "employees",
        "employees",
        ["manager_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_employees_client_manager",
        "employees",
        "employees",
        ["client_id", "manager_id"],
        ["client_id", "id"],
    )

    op.add_column("risks", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("risks", "due_date")

    op.drop_constraint("fk_employees_client_manager", "employees", type_="foreignkey")
    op.drop_constraint("fk_employees_manager_id", "employees", type_="foreignkey")
    op.drop_index("ix_employees_manager_id", table_name="employees")
    op.drop_column("employees", "current_work")
    op.drop_column("employees", "exit_reason")
    op.drop_column("employees", "exit_date")
    op.drop_column("employees", "joining_date")
    op.drop_column("employees", "employment_type")
    op.drop_column("employees", "manager_id")
