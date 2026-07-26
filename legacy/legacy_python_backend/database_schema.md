# Database Schema Guide

The platform uses PostgreSQL, SQLAlchemy 2.x, UUID primary keys, snake_case names, and UTC-aware timestamps. Every main table has `created_at` and `updated_at`.

## Common conventions

- `id`: Internal UUID primary key.
- `client_id`: Tenant owner. Present on operational/client data.
- `status`: Lifecycle state such as `active`, `draft`, `open`, `closed`, or `not_in_current_scope`.
- Business codes such as `kpi_code` remain readable identifiers but are not primary keys.
- Tenant queries always filter by the authenticated user's `client_id`.
- Composite foreign keys prevent cross-client references in addition to API filtering.

## clients

Tenant root for an organization using the platform.

Important columns: `name`, unique `slug`, `contact_email`, `status`, and JSON `settings`.

One client owns users, roles, departments, policies, KPIs, evidence, gaps, CAPA, risks, audit records, and client-specific lookups.

## Users, roles, and permissions

### users

Authentication identities. Email is unique per client through `UNIQUE(client_id, email)`. Passwords are stored only as scrypt hashes.

`is_superuser` means tenant administrator. `is_platform_admin` is a separate, stronger privilege used for client onboarding.

### roles

Client-defined role names. Role names are unique per client.

### permissions

Global permission catalog identified by unique codes. Reference seeding creates a small base set: `kpi.view`, `kpi.edit`, `kpi.approve`, `evidence.view`, `evidence.upload`, `evidence.approve`, `policy.view`, `policy.edit`, `policy.approve`, `capa.view`, `capa.edit`, `capa.close`, `dashboard.view`, and `admin.manage`.

### user_roles

Tenant-safe many-to-many link between users and roles.

### role_permissions

Tenant-safe many-to-many link between roles and global permissions.

The current MVP routes enforce authenticated-user, tenant-superuser, and platform-administrator boundaries, plus a basic `require_permission("<code>")` dependency (used today on the roles and permissions administration routes). Superusers and platform administrators implicitly hold every permission. Fine-grained permission codes are seeded and modeled for a fuller authorization layer but are not yet checked by every route.

## Departments and employees

### departments

Client organization units identified by a code unique within the client. `parent_department_id` supports a hierarchy and must reference a department in the same client.

### employees

Employee directory records. `employee_code` is unique per client. An employee may link one-to-one to a login user and optionally belongs to a department. `manager_id` is a self-reference to another employee in the same client (tenant-safe composite foreign key).

HR columns: `employment_type`, `joining_date`, `designation`, `current_work`, `exit_date`, and `exit_reason`. `exit_reason` is sensitive: the API masks it to `null` for readers without HR access, and only HR-authorized users (tenant superuser or platform admin, for now) may create or update employees.

## Frameworks, controls, and checkpoints

These are global catalog tables and therefore do not carry `client_id`.

### frameworks

Framework master identified by `(code, version)`. `status` and `is_active` determine whether it can be used.

Active scope contains exactly:

- ISO 9001:2015
- ISO 27001:2022
- ISO 14001:2015
- ISO 45001:2018
- ISO 22301:2019
- SA 8000:2014
- HIPAA Omnibus
- CMMI SVC L3
- DPDPA 2023/2025

### controls

Control catalog under a framework. `control_code` is unique within its framework.

### checkpoints

Verification steps under a control. Each checkpoint records whether evidence is required. Composite constraints guarantee its `framework_id` matches its control's framework.

## Policies and policy_register

### policies

Client policy master. `policy_code` is unique per client. A policy may have a department and owner user and includes `use_in_scope`.

### policy_register

Version history and workflow state for a policy. `(client_id, policy_id, version)` is unique.

Important columns include `effective_date`, `next_review_date`, `approval_status`, `review_status`, approver/reviewer IDs and timestamps, and general `status`.

The API requires approved evidence linked to the register record before it can be marked approved, reviewed, or closed. Rejecting approval clears stale approval metadata.

## KPIs and related tables

### kpis

KPI master. `UNIQUE(client_id, kpi_code)` protects the business key. KPIs may belong to a department and owner.

`use_in_scope` decides whether the KPI is part of the client's program. `enabled` cannot be true unless `use_in_scope` is true.

### kpi_targets

Period-based targets with `period_start`, `period_end`, `target_value`, warning threshold, and critical threshold. One KPI cannot have duplicate target records for the same period.

### kpi_actuals

Period results containing `target_value`, `actual_value`, calculated `variance`, `rag_status`, `approval_status`, and `evidence_required`.

If a target is referenced, it must belong to the same client and KPI. Approval, completion, or closure requires approved linked evidence.

### kpi_framework_mapping

Connects a client's KPI to an active framework and optionally a control. It prevents duplicate framework-only mappings and validates that a selected control belongs to the framework.

Dashboard framework counts use distinct active mappings for the authenticated client.

## Evidence documents and links

### evidence_documents

File metadata only; file bytes are stored locally for development. Columns include original/stored names, provider, path, content type, size, SHA-256 checksum, uploader, approver, and `approval_status`.

Allowed approval values are `pending`, `approved`, `rejected`, and `more_info_required`.

### evidence_links

Connects one evidence document to many business records using `entity_type` plus UUID `entity_id`. Supported types are KPI actual, policy register, CAPA, gap, risk, checkpoint, audit, training, incident, and other.

The document link is tenant-enforced. Current business targets are also checked by the API. The composite `(client_id, entity_type, entity_id)` index supports proof lookups.

## Gaps and CAPA

### gaps

Compliance finding with framework/control/checkpoint context, department, owner, severity, due date, and closure timestamp. Framework hierarchy is validated. Closing requires approved evidence.

### capa

Corrective or preventive action linked optionally to a gap or risk. Stores root cause, action plan, due date, effectiveness review, status, and completion timestamp.

Completing or closing CAPA requires approved evidence. Reopening clears `completed_at`.

## Risks

Client risk register with unique `risk_code`, department, owner, likelihood, impact, inherent score, residual score, treatment (mitigation plan), `due_date`, and status.

Likelihood and impact are constrained to values from 1 through 5. The API sets `inherent_score = likelihood * impact` (the probability-times-impact risk score) on create and recalculates it on update. The read model also exposes a derived `risk_level` string (1-4 low, 5-9 medium, 10-14 high, 15-25 critical). Evidence may be linked using `entity_type = risk`.

## audit_trail

Immutable-style activity history for important API actions. It records tenant, actor user, action, entity type/ID, JSON changes, optional IP/user-agent fields, and status.

All current POST and PATCH routes write an audit record in the same database transaction. Successful login and identifiable failed-login attempts are also logged. Read-only requests are not audited.

## lookups

Configurable code/label values for dropdowns and other UI metadata. A lookup may be global (`client_id` is null) or client-specific. Tenant-specific category/code combinations and global category/code combinations are unique.

## Index strategy

The schema includes indexes for common tenant and dashboard filters:

- `client_id`
- `status`
- `kpi_code`
- `framework_id`
- `department_id`
- tenant plus entity for evidence/audit lookup
- tenant plus KPI for targets, actuals, and mappings
- tenant plus approval or lifecycle status for dashboard counts
