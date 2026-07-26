# GenBioCa GRC API

FastAPI/PostgreSQL foundation for a multi-client GRC and KPI compliance platform.

## What is included

- SQLAlchemy 2.x models with UUID primary keys, timestamps, indexes, and normalized relationships.
- Tenant-scoped business tables and API queries using the authenticated user's `client_id`.
- JWT bearer authentication with scrypt password hashing.
- KPI master, targets, actuals, framework mappings, policies, gaps, CAPA, risks, evidence, and audit trail.
- Local development file storage behind a small service boundary that can later be replaced by S3.
- Evidence-gated transitions for policy approval/review, KPI actual approval, gap closure, and CAPA completion.
- Alembic migration foundation and idempotent active-framework seeding.

## Developer handoff documents

- [ERD and tenant relationship guide](ERD.md)
- [Database schema guide](database_schema.md)
- [API endpoint guide](api_endpoints.md)
- [Postman collection](postman/GenBioCa_GRC.postman_collection.json)

## Active framework scope

The seed contains only ISO 9001:2015, ISO 27001:2022, ISO 14001:2015, ISO 45001:2018, ISO 22301:2019, SA 8000:2014, HIPAA Omnibus, CMMI SVC L3, and DPDPA 2023/2025.

GDPR, SOC 1, SOC 2, generic SOC, A11Y, ADA, and WCAG are not seeded and are excluded from dashboard counts. If historical records are added later, store them with `status = 'not_in_current_scope'` and `is_active = false`.

## Local setup

### 1. Set up PostgreSQL

Start PostgreSQL using your normal local installation, then create the database:

```bash
createdb genbioca_grc
```

The default connection expects PostgreSQL on `localhost:5432` with user/password `postgres`.

### 2. Install Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Use `requirements.txt` instead when development/test tools are not needed.

### 3. Create `.env`

```bash
cp .env.example .env
```

Edit `.env`, verify `DATABASE_URL`, and replace `JWT_SECRET_KEY`. Load it into the shell before running commands:

```bash
set -a
source .env
set +a
```

The optional bootstrap variables create the first platform operator. Remove them after successful bootstrap. The `DEMO_*_PASSWORD` values are only for local development.

### 4. Run Alembic migrations

```bash
alembic upgrade head
```

### 5. Run seed scripts

Seed only the nine active framework records:

```bash
python -m app.seed
```

For UI integration, seed the complete idempotent GenBioCa demo dataset:

```bash
python -m app.demo_seed
```

Demo login:

- Client slug: `genbioca`
- Email: `admin@genbioca.local`
- Password: value of `DEMO_ADMIN_PASSWORD`

The demo seed adds four users, four departments, roles/permissions, nine active frameworks, sample controls/checkpoints, policies, KPIs/targets/actual, approved evidence, a gap, an overdue CAPA, a risk, and audit data. It is safe to run more than once.

### 6. Start FastAPI

```bash
uvicorn app.main:app --reload
```

### 7. Open Swagger

Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). The OpenAPI JSON is available at [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json).

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### 8. Run tests

```bash
pytest -q
```

Tests default to an in-memory SQLite database (configured in the root `conftest.py`), so PostgreSQL is not required to run them. Set `DATABASE_URL` explicitly to run against another database.

The schema-invariant tests verify tenant columns, tenant-safe foreign keys, the KPI business key, required indexes, framework scope, and SQLAlchemy relationship configuration. `tests/test_new_modules.py` covers the roles, permissions, departments, employees, controls, checkpoints, risks, and lookups routes, including tenant scoping, the sensitive `exit_reason` masking, risk-score calculation, and rejection of removed frameworks.

## Postman

Import [`postman/GenBioCa_GRC.postman_collection.json`](postman/GenBioCa_GRC.postman_collection.json) into Postman. Run **Login - GenBioCa Admin** first; its test script saves the JWT into the collection's `token` variable.

The collection uses the documented demo credentials by default. For the upload request, select any small local file in the `file` form-data field. Requests that create records save their returned IDs for later target, actual, evidence-link, policy, gap, and CAPA requests.

## Authentication

Login requires a client slug because emails are unique within a client, not globally:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"client_slug":"genbioca","email":"admin@genbioca.local","password":"ChangeMe-Admin-2026!"}'
```

Send the returned token as `Authorization: Bearer <token>`.

## Main endpoints

- `/api/v1/clients`, `/api/v1/users`, `/api/v1/frameworks`
- `/api/v1/roles`, `/api/v1/permissions`, `/api/v1/roles/{role_id}/permissions`
- `/api/v1/departments`, `/api/v1/employees`
- `/api/v1/controls`, `/api/v1/checkpoints`
- `/api/v1/kpis`, `/api/v1/kpi-targets`, `/api/v1/kpi-actuals`
- `/api/v1/kpis/{kpi_id}/framework-mappings`
- `/api/v1/policies`, `/api/v1/policy-register`
- `/api/v1/evidence/upload`, `/api/v1/evidence/links`
- `/api/v1/gaps`, `/api/v1/capa`, `/api/v1/risks`
- `/api/v1/lookups`
- `/api/v1/dashboard/summary`

The demo dashboard response is:

```json
{
  "total_kpis": 3,
  "active_kpis": 3,
  "pending_evidence": 0,
  "approved_evidence": 1,
  "open_gaps": 1,
  "open_capa": 1,
  "overdue_capa": 1,
  "policies_pending_review": 2,
  "active_frameworks_count": 9
}
```

All dashboard business counts use the authenticated client's ID. Active framework count uses that client's KPI mappings and the nine-framework allowlist.

## Tenant and evidence rules

Tenant-facing routes never accept `client_id` from request bodies; it comes from the verified JWT and every query includes it. Foreign tenant IDs return 404 to avoid disclosing that another client's record exists. Global framework/control/checkpoint catalog tables intentionally have no `client_id`. Composite foreign keys also enforce that tenant-owned references (for example KPI-to-target, policy-to-register, and evidence-to-document) carry the same `client_id` at the database layer.

Platform administrators can onboard a tenant through `POST /clients`, then create its first tenant administrator through `POST /clients/{client_id}/admin`. These are deliberately separate from ordinary tenant-user administration.

An evidence file starts in `pending`. Approve it, link it to the target record with the correct `entity_type`, and only then perform the approval/closure transition. Each create, update, approval decision, upload, link, completion, closure, and identifiable login attempt writes an `audit_trail` record in the same transaction.

The application layer enforces cross-table evidence rules because a PostgreSQL `CHECK` constraint cannot query evidence links. Database constraints still enforce KPI scope, unique business keys, periods, and risk ranges.

## Authorization and RBAC

Fine-grained RBAC is planned. The current MVP uses the authenticated user, tenant superuser, platform admin, and a basic permission helper check.

The helper lives in `app/api/deps.py`:

```python
current_user: User = Depends(require_permission("admin.manage"))
```

Tenant superusers and platform administrators implicitly hold every permission; other users must have the code assigned through one of their roles (`user_roles` -> `role_permissions` -> `permissions`). It is enforced today on the roles and permissions administration routes and can be extended to codes such as `kpi.edit`, `evidence.approve`, `policy.approve`, and `capa.close` in later increments. Employee create/update and the sensitive `exit_reason` field are restricted to HR access (tenant superuser or platform admin for now; a dedicated HR role is a documented TODO).

## Migrations

The first revision (`0001_initial_schema`) is the schema baseline. Revision `0002_hr_and_risk_fields` adds the employee HR columns (`manager_id`, `employment_type`, `joining_date`, `exit_date`, `exit_reason`, `current_work`) and `risks.due_date`; all new columns are nullable, so it is a safe additive change. For subsequent changes:

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

Review autogenerated migrations before applying them. In production, run migrations as a deployment step and set `SEED_ON_STARTUP=false`; execute the seed command separately.
