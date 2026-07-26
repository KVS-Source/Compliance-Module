import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SEED_ON_STARTUP", "false")

from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import configure_mappers

from app.core.database import Base
import app.models  # noqa: F401
from app.utils.framework_scope import ACTIVE_FRAMEWORK_CODES, REMOVED_FRAMEWORK_CODES


GLOBAL_TABLES = {"clients", "permissions", "frameworks", "controls", "checkpoints"}


def test_all_tenant_tables_have_client_and_timestamps() -> None:
    for name, table in Base.metadata.tables.items():
        assert {"created_at", "updated_at"}.issubset(table.c.keys()), name
        if name not in GLOBAL_TABLES:
            assert "client_id" in table.c, name


def test_kpi_code_is_unique_per_client() -> None:
    constraints = Base.metadata.tables["kpis"].constraints
    assert any(
        isinstance(item, UniqueConstraint)
        and tuple(column.name for column in item.columns) == ("client_id", "kpi_code")
        for item in constraints
    )


def test_tenant_foreign_keys_are_tenant_consistent() -> None:
    unprotected: list[str] = []
    for table_name, table in Base.metadata.tables.items():
        if "client_id" not in table.c:
            continue
        for foreign_key in table.foreign_keys:
            target = foreign_key.column.table
            if "client_id" not in target.c or foreign_key.parent.name == "client_id":
                continue
            local_column = foreign_key.parent.name
            if not any(
                {"client_id", local_column}.issubset(
                    {element.parent.name for element in constraint.elements}
                )
                and (target.name, "client_id")
                in {(element.column.table.name, element.column.name) for element in constraint.elements}
                and (target.name, "id")
                in {(element.column.table.name, element.column.name) for element in constraint.elements}
                for constraint in table.foreign_key_constraints
            ):
                unprotected.append(f"{table_name}.{local_column}")
    assert unprotected == []


def test_required_index_prefixes_exist() -> None:
    required = {
        "kpis": [("client_id",), ("status",), ("kpi_code",), ("department_id",)],
        "kpi_framework_mapping": [("client_id",), ("status",), ("framework_id",)],
        "gaps": [("client_id",), ("status",), ("framework_id",), ("department_id",)],
    }
    for table_name, prefixes in required.items():
        indexes = [tuple(column.name for column in index.columns) for index in Base.metadata.tables[table_name].indexes]
        for prefix in prefixes:
            assert any(columns[: len(prefix)] == prefix for columns in indexes), (table_name, prefix)


def test_removed_frameworks_cannot_be_active_codes() -> None:
    assert ACTIVE_FRAMEWORK_CODES.isdisjoint(REMOVED_FRAMEWORK_CODES)


def test_mappers_configure_without_broken_relationships() -> None:
    configure_mappers()
