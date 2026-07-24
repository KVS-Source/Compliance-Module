# Schema alignment

## Milestone 1 models

All internal identifiers are PostgreSQL UUIDs. Human-facing codes remain separate and are never silently renamed.

- `tenants`: Company records (`code`, `name`, profile fields, status). API DTOs say Company; persistence keeps the conventional tenant name.
- `users`: global identity (`code`, unique email, full name, phone, Argon2 hash, account/lock state, nullable default Company).
- `user_companies`: active/inactive multi-Company membership plus the member's optional Company department. Every Company context is validated against this table on each protected request.
- `roles`, `permissions`, `role_permissions`, `user_roles`: Company-scoped assignments. `user_roles` preserves `user_id`, `role_id`, `tenant_id`, `status`, `assigned_by`, `assigned_at`.
- `org_departments`, `org_locations`, `org_units`: Company-owned organisation master data. Business codes are unique only within a Company.
- `frameworks`, `framework_rules`: shared framework catalogue and rule hierarchy.
- `kpi_definitions`: shared KPI catalogue; it is not an operational KPI result.
- `kpi_goals`: Company-owned target configuration preserving target, warning and critical values, period and effective dates.
- `refresh_tokens`: hashed rotating token records and token families. Raw refresh tokens never enter the database.
- `audit_events`: append-only authentication/logout/Company-switch history.

Shared-master models are read by business services only through `SharedMasterProvider` or a dedicated repository. `LocalPostgresSharedMasterProvider` is the Milestone 1 implementation.

## Frontend mapping

The frontend fields remain `id`, `companyId`, `name`, `status`, etc. API DTOs add UUID `id` and preserve human `code`; Company language hides persistence-level tenant terminology. Exact field mapping is in `frontend-inventory.md`.

## Constraints and indexes

- Globally unique: tenant code, user code/email, permission code, KPI definition code.
- Shared catalogue uniqueness: framework `(code, version)`, framework rule `(framework_id, code)`.
- Company-scoped uniqueness: role, department, location, unit and KPI goal `(tenant_id, code)`.
- Membership and role assignments use composite uniqueness.
- Tenant list paths use indexes covering status/creation or effective dates.
- Custom SQL adds `effective_to >= effective_from`, non-negative failed-login count, refresh expiry after creation, an append-only audit trigger, a trigger preventing a `user_roles.tenant_id` from disagreeing with its role's Company, and a trigger preventing a membership from referencing another Company's department.
- Foreign keys cover the user's optional default Company and the membership's optional department; the department mapping is membership-scoped because one identity may belong to multiple Companies.

## Future operational models (not implemented)

Milestone 2 should introduce explicit Company-owned models for policies, controls, evidence metadata/file versions, KPI actuals, risks, gaps, CAPA, uploads and reports. Evidence links must validate Company equality between evidence, target record, reviewer and file metadata. Audit events must remain append-only and Company-filtered. No identifier from a request body may establish Company context.

KPI catalogue (`kpi_definitions`) is shared reference data. Operational KPI configuration, actuals, approvals and evidence are Company-owned. `kpi_goals` is the sole Milestone 1 target store. Milestone 2 should expose **one authoritative Target Service** over these records; it must not create a second active target source.

The accepted trace ribbon is exactly **Policy → Framework → Rule → Evidence → Control → KPI → Target vs Actual → Risk**.

For future KPI actual evaluation:

- A met approved target creates no risk.
- A miss within tolerance may be `MINOR`; a miss beyond 10%, a critical KPI or a repeat miss is `MAJOR`.
- `MAJOR`/`MINOR` is KPI classification, separate from enterprise `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`.
- Add a partial unique index allowing at most one active linked risk per KPI actual.
- Preserve KPI, target snapshot, actual, period, variance, owner and evidence on the link.

Future date checks should cover policy review dates, evidence validity, gap/CAPA due dates and report periods. Future tenant indexes should cover at least `(tenant_id,status)`, `(tenant_id,owner_id,status)` and `(tenant_id,created_at)`.
