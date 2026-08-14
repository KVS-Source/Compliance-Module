# GenBioCa GRC Entity Relationship Guide

This document explains the database relationships used by the GenBioCa GRC and KPI Compliance Management Platform. The physical definitions are in [`app/models/models.py`](app/models/models.py).

## Tenant boundary

`clients` is the tenant root. Every client-owned record carries `client_id`, and API requests derive that value from the authenticated JWT rather than accepting it from request bodies.

The following are global catalog tables shared read-only across clients:

- `frameworks`
- `controls`
- `checkpoints`
- `permissions`

All other operational tables are tenant-owned. Composite foreign keys include both `client_id` and the referenced record ID, preventing a record from client A from referencing a tenant-owned record from client B.

```mermaid
erDiagram
    CLIENTS ||--o{ USERS : contains
    CLIENTS ||--o{ ROLES : defines
    USERS ||--o{ USER_ROLES : receives
    ROLES ||--o{ USER_ROLES : assigned_through
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : included_in

    CLIENTS ||--o{ DEPARTMENTS : organizes
    DEPARTMENTS ||--o{ DEPARTMENTS : parent_of
    DEPARTMENTS ||--o{ EMPLOYEES : contains
    EMPLOYEES ||--o{ EMPLOYEES : manages
    USERS o|--o| EMPLOYEES : may_represent

    FRAMEWORKS ||--o{ CONTROLS : contains
    CONTROLS ||--o{ CHECKPOINTS : verifies

    CLIENTS ||--o{ POLICIES : owns
    POLICIES ||--o{ POLICY_REGISTER : versions
    DEPARTMENTS o|--o{ POLICIES : responsible_for

    CLIENTS ||--o{ KPIS : owns
    DEPARTMENTS o|--o{ KPIS : measures
    KPIS ||--o{ KPI_TARGETS : targets
    KPIS ||--o{ KPI_ACTUALS : actuals
    KPI_TARGETS o|--o{ KPI_ACTUALS : supplies_target
    KPIS ||--o{ KPI_FRAMEWORK_MAPPING : maps
    FRAMEWORKS ||--o{ KPI_FRAMEWORK_MAPPING : covered_by
    CONTROLS o|--o{ KPI_FRAMEWORK_MAPPING : optionally_maps

    CLIENTS ||--o{ EVIDENCE_DOCUMENTS : stores
    EVIDENCE_DOCUMENTS ||--o{ EVIDENCE_LINKS : linked_by

    CLIENTS ||--o{ GAPS : identifies
    FRAMEWORKS o|--o{ GAPS : relates_to
    CONTROLS o|--o{ GAPS : relates_to
    CHECKPOINTS o|--o{ GAPS : relates_to
    GAPS o|--o{ CAPA : corrected_by
    RISKS o|--o{ CAPA : treated_by
    CLIENTS ||--o{ RISKS : owns

    CLIENTS ||--o{ AUDIT_TRAIL : records
    USERS o|--o{ AUDIT_TRAIL : performs
    CLIENTS ||--o{ LOOKUPS : customizes
```

## Evidence relationships

`evidence_links` is deliberately polymorphic. It stores `entity_type` and `entity_id` instead of adding a separate evidence foreign key to every business table.

```mermaid
flowchart LR
    D["evidence_documents"] --> L["evidence_links"]
    L --> K["kpi_actual"]
    L --> P["policy_register"]
    L --> C["capa"]
    L --> G["gap"]
    L --> R["risk"]
    L --> CP["checkpoint"]
    L -. future module .-> A["audit"]
    L -. future module .-> T["training"]
    L -. future module .-> I["incident"]
    L -. extension .-> O["other"]
```

The API validates the tenant and target for modules that currently exist. `audit`, `training`, and `incident` are reserved for future business-module tables; `audit` does not refer to the immutable `audit_trail` log.

Only an active evidence document with `approval_status = approved` and an active evidence link satisfies a proof requirement.

## Core workflow relationships

### Policy workflow

`policies` is the policy master. `policy_register` stores versions and approval/review state. A register record cannot transition to approved, reviewed, or closed through the API unless approved evidence is linked to that exact register ID.

### KPI workflow

`kpis` is the master record. `kpi_targets` stores period targets, and `kpi_actuals` stores actual values and a copied target value for reporting history. An actual can optionally reference its target; a composite constraint guarantees that the target belongs to the same client and KPI.

When `use_in_scope` becomes false, `enabled` is automatically set to false. The database also rejects `enabled = true` when `use_in_scope = false`.

### Gap and CAPA workflow

A gap may point to a framework, control, and checkpoint. Constraints ensure that the control belongs to the framework and the checkpoint belongs to both. CAPA may originate from a gap or risk. Closing a gap or completing/closing a CAPA requires approved linked evidence.

## Framework scope

Frameworks are global reference data, but a client's active framework count is derived from that client's active KPI framework mappings. The count includes only the nine allowlisted frameworks and only mappings attached to enabled, in-scope KPIs.

GDPR, SOC variants, ADA, A11Y, and WCAG cannot appear in active mappings or dashboard framework counts. Historical rows are marked `not_in_current_scope`.
