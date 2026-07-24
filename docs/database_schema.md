# Database schema

All primary keys are PostgreSQL UUIDs. Main tables use snake_case columns plus `created_at` and `updated_at` timestamps. Tenant-owned rows carry and index `client_id`; `kpis` additionally enforce `(client_id, kpi_code)` uniqueness.

| Area | Tables | Tenant scope |
|---|---|---|
| Identity | clients, users, roles, permissions, user_roles, role_permissions | Users/roles/joins are tenant scoped; permissions are global |
| Organization | departments, employees | Tenant scoped |
| Catalog | frameworks, controls, checkpoints | Global controlled catalog |
| Policies | policies, policy_register | Tenant scoped |
| KPI | kpis, kpi_targets, kpi_actuals, kpi_framework_mapping | Tenant scoped |
| Proof | evidence_documents, evidence_links | Tenant scoped |
| Remediation | gaps, capa, risks | Tenant scoped |
| Support | lookups, audit_trail | Global or tenant lookups; tenant audit |

Evidence links are polymorphic by `linked_entity_type` and `linked_entity_id`. Services validate the referenced entity and client before linking. Audit rows are immutable and written in the same transaction as business mutations.

## KPI and risk relationship

- `kpis.unit` stores the unit of measure shown beside target and actual values.
- `kpis.frequency` stores the KPI measurement frequency; a target may override it through `kpi_targets.frequency`.
- A missed target can create a risk-register row linked through `risks.kpi_id`, `risks.kpi_target_id`, and `risks.kpi_actual_id`.
- `risks.classification` and `risks.risk_level` use the same business-facing `major` or `minor` values; probability, impact, and score remain available for analysis.

## Company-agreed KPI mapping order

The presentation/UI sequence is `Policy → Framework → Rule → Evidence → Control → KPI → Risk`. The normalized mapping record retains the foreign keys needed for all of those objects; display order does not weaken referential integrity. Risk is placed after KPI because it is created or updated only when the KPI actual misses the configured target, and the target-versus-actual detail is shown in the mapping table as the risk trigger.
