"""Idempotent reference-data and optional bootstrap-admin seeding."""

import os
import uuid

from sqlalchemy import select, update

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.models import Client, Framework, KPIFrameworkMapping, Permission, User
from app.utils.framework_scope import ACTIVE_FRAMEWORKS, REMOVED_FRAMEWORK_CODES


# Basic, reusable permission keys for the RBAC foundation. Kept intentionally small.
BASE_PERMISSIONS = [
    ("kpi.view", "View KPIs"),
    ("kpi.edit", "Edit KPIs"),
    ("kpi.approve", "Approve KPIs"),
    ("evidence.view", "View evidence"),
    ("evidence.upload", "Upload evidence"),
    ("evidence.approve", "Approve evidence"),
    ("policy.view", "View policies"),
    ("policy.edit", "Edit policies"),
    ("policy.approve", "Approve policies"),
    ("capa.view", "View CAPA"),
    ("capa.edit", "Edit CAPA"),
    ("capa.close", "Close CAPA"),
    ("dashboard.view", "View dashboard"),
    ("admin.manage", "Manage administration"),
]


def seed_reference_data() -> None:
    with SessionLocal() as db:
        for code, name in BASE_PERMISSIONS:
            permission = db.scalar(select(Permission).where(Permission.code == code))
            if permission is None:
                db.add(Permission(code=code, name=name, status="active"))


        for code, name, version in ACTIVE_FRAMEWORKS:
            framework = db.scalar(
                select(Framework).where(Framework.code == code, Framework.version == version)
            )
            if framework is None:
                db.add(
                    Framework(
                        code=code,
                        name=name,
                        version=version,
                        status="active",
                        is_active=True,
                    )
                )
            else:
                framework.status = "active"
                framework.is_active = True

        removed_framework_ids: list[uuid.UUID] = []
        for framework in db.scalars(
            select(Framework).where(Framework.code.in_(REMOVED_FRAMEWORK_CODES))
        ):
            framework.status = "not_in_current_scope"
            framework.is_active = False
            removed_framework_ids.append(framework.id)
        if removed_framework_ids:
            db.execute(
                update(KPIFrameworkMapping)
                .where(
                    KPIFrameworkMapping.framework_id.in_(removed_framework_ids),
                    KPIFrameworkMapping.status == "active",
                )
                .values(status="not_in_current_scope")
            )

        bootstrap_slug = os.getenv("BOOTSTRAP_CLIENT_SLUG")
        bootstrap_name = os.getenv("BOOTSTRAP_CLIENT_NAME")
        bootstrap_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL")
        bootstrap_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        if all((bootstrap_slug, bootstrap_name, bootstrap_email, bootstrap_password)):
            client = db.scalar(select(Client).where(Client.slug == bootstrap_slug))
            if client is None:
                client = Client(id=uuid.uuid4(), slug=bootstrap_slug, name=bootstrap_name)
                db.add(client)
                db.flush()
            user = db.scalar(
                select(User).where(
                    User.client_id == client.id,
                    User.email == bootstrap_email.lower(),
                )
            )
            if user is None:
                db.add(
                    User(
                        client_id=client.id,
                        email=bootstrap_email.lower(),
                        full_name="Bootstrap Administrator",
                        password_hash=hash_password(bootstrap_password),
                        is_superuser=True,
                        is_platform_admin=os.getenv("BOOTSTRAP_PLATFORM_ADMIN", "false").lower() == "true",
                    )
                )
        db.commit()


if __name__ == "__main__":
    seed_reference_data()
