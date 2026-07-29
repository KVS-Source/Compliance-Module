# PostgreSQL constraints and triggers

Status: reconciled with all nine migration SQL files. The verification queries
are read-only and safe for a disposable or read-only administration session.
Catalogue totals in the Milestone 0 report come from a freshly migrated
disposable PostgreSQL database.

## Application triggers: 15/15

All application triggers are `FOR EACH ROW`. `INSERT/UPDATE OF` means the
trigger runs only when one of the named guarded fields participates in the
update.

| Ref | Trigger | Table | Timing and event | Enforced invariant | Originating migration | Automated coverage |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | `user_roles_tenant_match` | `user_roles` | BEFORE INSERT or UPDATE of `role_id`, `tenant_id` | assigned role belongs to the same tenant | `20260721190000_membership_hardening` | `api.test.ts` — database tenant invariants |
| T02 | `user_companies_department_tenant_match` | `user_companies` | BEFORE INSERT or UPDATE of `tenant_id`, `department_id` | optional department belongs to membership tenant | `20260721190000_membership_hardening` | `api.test.ts` — database tenant invariants |
| T03 | `user_roles_active_membership_required` | `user_roles` | BEFORE INSERT or UPDATE of user/tenant/status | an active role assignment requires an active user, tenant and membership | `20260724200000_user_role_membership_invariant` | `api.test.ts` — active membership and role assignment |
| T04 | `kpi_configurations_tenant_users_active` | `kpi_configurations` | BEFORE INSERT or guarded actor-field UPDATE | owner, optional approver, creator and updater are active members of the tenant | `20260726143000_slice_a_kpi_configuration_targets` | `kpi-management.test.ts` — active membership and cross-tenant links |
| T05 | `kpi_targets_tenant_users_active` | `kpi_targets` | BEFORE INSERT or guarded actor-field UPDATE | submitter, approver, creator and updater are active tenant members | `20260726143000_slice_a_kpi_configuration_targets` | `kpi-management.test.ts` — database target constraints |
| T06 | `kpi_targets_approved_immutable` | `kpi_targets` | BEFORE UPDATE or DELETE | approved targets cannot be deleted or edited; only one-way supersession metadata may be added | `20260726143000_slice_a_kpi_configuration_targets` | `kpi-management.test.ts` and `kpi-management-unit.test.ts` |
| T07 | `kpi_actuals_tenant_users_active` | `kpi_actuals` | BEFORE INSERT or guarded actor-field UPDATE | submission/approval actors are active tenant members | `20260726201500_slice_b_kpi_actual_submission` | `kpi-actuals.test.ts` — cross-tenant submission and database constraints |
| T08 | `risks_tenant_users_active` | `risks` | BEFORE INSERT or guarded actor-field UPDATE | owner, creator and updater are active tenant members | `20260726224500_slice_d_automatic_kpi_risk` | `kpi-actuals.test.ts` and `risk-workflow.test.ts` |
| T09 | `kpi_approvals_reviewer_membership` | `kpi_approvals` | BEFORE INSERT or UPDATE of tenant/reviewer/decision | human reviewers are active tenant members; system auto-approval is the only approved decision allowed without a reviewer | `20260727113000_slice_c_kpi_actual_approval` | `kpi-approval.test.ts` — approval tenancy and system reviewer |
| T10 | `kpi_approvals_append_only` | `kpi_approvals` | BEFORE UPDATE or DELETE | approval decisions are append-only | `20260727113000_slice_c_kpi_actual_approval` | `kpi-approval.test.ts` — append-only constraints |
| T11 | `risk_reviews_reviewer_membership` | `risk_reviews` | BEFORE INSERT or UPDATE of tenant/reviewer | optional reviewer is an active tenant member | `20260727150000_slice_e_risk_workflow` | `risk-workflow.test.ts` — cross-tenant reviewer |
| T12 | `risk_treatments_owner_membership` | `risk_treatments` | BEFORE INSERT or UPDATE of tenant/owner/recorder | owner and recorder are active tenant members | `20260727150000_slice_e_risk_workflow` | `risk-workflow.test.ts` — cross-tenant owner |
| T13 | `risk_reviews_append_only` | `risk_reviews` | BEFORE UPDATE or DELETE | review history is append-only | `20260727150000_slice_e_risk_workflow` | `risk-workflow.test.ts` — append-only reviews |
| T14 | `risk_treatments_append_only` | `risk_treatments` | BEFORE UPDATE or DELETE | treatment history is append-only; completion appends a superseding row | `20260727150000_slice_e_risk_workflow` | `risk-workflow.test.ts` — append-only treatments |
| T15 | `audit_events_append_only` | `audit_events` | BEFORE UPDATE or DELETE | audit history cannot be edited or deleted | `20260721181500_milestone_1` | `api.test.ts` — AuditEvent UPDATE and DELETE rejection |

### Safe trigger verification queries

Run the catalogue query associated with each trigger reference. It returns
metadata only; it never invokes or modifies the trigger.

```sql
-- T01
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'user_roles_tenant_match';
-- T02
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'user_companies_department_tenant_match';
-- T03
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'user_roles_active_membership_required';
-- T04
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_configurations_tenant_users_active';
-- T05
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_targets_tenant_users_active';
-- T06
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_targets_approved_immutable';
-- T07
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_actuals_tenant_users_active';
-- T08
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'risks_tenant_users_active';
-- T09
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_approvals_reviewer_membership';
-- T10
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'kpi_approvals_append_only';
-- T11
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'risk_reviews_reviewer_membership';
-- T12
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'risk_treatments_owner_membership';
-- T13
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'risk_reviews_append_only';
-- T14
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'risk_treatments_append_only';
-- T15
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname = 'audit_events_append_only';
```

A complete reconciliation query is:

```sql
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
```

## Check constraints

| Area | Named constraints and rule |
| --- | --- |
| Authentication/session | `users_failed_login_count_nonnegative`; `refresh_tokens_expiry_after_creation` |
| Legacy KPI goal | `kpi_goals_effective_dates_valid` |
| Tenant counters/thresholds | `tenants_kpi_thresholds_valid`; `tenants_next_risk_number_positive`; `tenants_next_kpi_actual_number_positive` |
| KPI configuration | valid effective dates; ISO-style three-uppercase-letter currency when present; nonnegative ordered amber/red thresholds |
| KPI target | valid period/effective dates; ordered tolerance; positive version; `submitted_by_id <> approved_by_id` when both exist |
| KPI actual | valid period dates; `kpi_actuals_no_self_approval`; approval actor/timestamp/state consistency |
| KPI approval | reviewer required except system `APPROVED`; approved/rejected comment rules |
| Risk | KPI source columns are all present or all absent; likelihood and impact are 1–5; inherent score equals likelihood × impact; residual fields are all absent or all present and consistent; source type matches KPI/general classifications |
| Risk review | comments are nonblank; likelihood and impact are both null or both 1–5 |
| Risk treatment | plan is nonblank; completion timestamp/status and effectiveness-note rules agree; row cannot supersede itself |

Safe check-constraint inspection:

```sql
SELECT c.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY c.relname, con.conname;
```

## Tenant-safe foreign keys

Simple FKs attach tenant rows to `tenants.id`. The following composite FKs also
prove that both ends belong to the same tenant:

- KPI configuration to organisation unit, location and department;
- KPI target to configuration and to a superseding target;
- KPI actual to configuration and to the exact target/configuration/period;
- KPI approval to actual;
- risk to KPI actual lineage, configuration and target;
- risk review to risk;
- risk treatment to risk and to a superseded treatment.

The supporting `(tenant_id,id)` unique indexes are database invariants, not
merely performance indexes.

Safe FK inspection:

```sql
SELECT c.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY c.relname, con.conname;
```

## Partial uniqueness and counters

Three partial unique indexes enforce active-state uniqueness:

- `kpi_configurations_one_active_scope_key` — one non-deleted configuration
  for a tenant/definition/scope, using `NULLS NOT DISTINCT`;
- `kpi_actuals_one_active_configuration_period_key` — one non-deleted actual
  per tenant/configuration/period;
- `risks_one_active_per_kpi_actual` — one non-deleted, non-archived risk per
  tenant/KPI actual.

`tenants.next_kpi_actual_number` and `tenants.next_risk_number` are positive
row counters. Active services increment them atomically with
`UPDATE ... RETURNING` semantics inside the same transaction that creates the
business record. Unique `(tenant_id,code)` indexes remain the final collision
barrier. The integration suite exercises server-generated codes, concurrency
and deliberate counter rewind collisions.

Safe index inspection:

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## Defence-in-depth boundary

These constraints and triggers complement, but do not replace, authenticated
tenant context and repository predicates. PostgreSQL RLS is not implemented.
The production-readiness assessment must therefore continue to treat
tenant-filter coverage and the `COMPANY_ADMIN` wildcard permission as security
work.
