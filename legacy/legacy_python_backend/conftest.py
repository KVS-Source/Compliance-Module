"""Pytest bootstrap.

Default the test database to in-memory SQLite and disable startup seeding before
any application module is imported. Using ``setdefault`` means an explicitly set
``DATABASE_URL`` (for example a real PostgreSQL test database) is still honored.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SEED_ON_STARTUP", "false")
