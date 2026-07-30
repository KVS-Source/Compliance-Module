# PostgreSQL constraints and triggers

Status: reconciled with all ten migration SQL files. The verification queries
are read-only and safe for a disposable or read-only administration session.
Catalogue totals in the current database dictionary come from a freshly
migrated disposable PostgreSQL database.

## Application triggers: 50/50

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
| T16–T25 | `policies_actor_membership`; `policy_versions_actor_membership`; `policy_frameworks_actor_membership`; `policy_approvals_actor_membership`; `controls_actor_membership`; `control_policy_versions_actor_membership`; `control_frameworks_actor_membership`; `rule_controls_actor_membership`; `checkpoints_actor_membership`; `checkpoint_reviews_actor_membership` | corresponding governance tables | BEFORE INSERT and, except append-only ledgers, UPDATE | every populated owner, approver, reviewer, creator and updater actor is an active user with active tenant membership; tenant ownership is immutable | `20260730040412_milestone_4_policy_control_checkpoint_foundation` | `governance-foundation.test.ts` — non-member, cross-tenant actor and tenant-move rejection |
| T26 | `policy_versions_lifecycle` | `policy_versions` | BEFORE INSERT, UPDATE or DELETE | DRAFT-only creation, allowed transitions, submitted/approved/history immutability and no hard delete | same | Policy lifecycle and immutability |
| T27 | `policy_frameworks_lineage_immutable` | `policy_frameworks` | BEFORE INSERT or UPDATE | version Framework lineage can change only while the version is DRAFT or REJECTED | same | Framework lineage immutability |
| T28 | `policy_approvals_append_only` | `policy_approvals` | BEFORE UPDATE or DELETE | approval decisions are append-only | same | approval append-only |
| T29 | `checkpoint_reviews_append_only` | `checkpoint_reviews` | BEFORE UPDATE or DELETE | operational reviews are append-only | same | review append-only |
| T30 | `policy_approvals_decision_guard` | `policy_approvals` | BEFORE INSERT | prohibits self-approval and requires decision/state agreement | same | self-approval and decision validation |
| T31–T32 | `policies_current_approved_consistency`; `policy_versions_current_approved_consistency` | `policies`; `policy_versions` | deferred AFTER INSERT or guarded UPDATE | Policy pointer exactly matches its one approved version at transaction commit | same | one current approved version and atomic supersession |
| T33 | `rule_controls_active_framework` | `rule_controls` | BEFORE INSERT or UPDATE | an active RuleControl requires an active matching ControlFramework | same | RuleControl Framework consistency |
| T34 | `control_frameworks_active_rule_guard` | `control_frameworks` | BEFORE UPDATE | a ControlFramework cannot be deactivated while active RuleControls depend on it | same | mapping lifecycle consistency |
| T35–T37 | `policies_archive_terminal`; `controls_archive_terminal`; `checkpoints_archive_terminal` | base governance records | BEFORE UPDATE | archived records are terminal and immutable | same | terminal archive |
| T38–T41 | `control_policy_versions_lineage_immutable`; `control_frameworks_lineage_immutable`; `rule_controls_lineage_immutable`; `checkpoints_control_lineage_immutable` | mapping tables and `checkpoints` | BEFORE UPDATE | retained mapping and parent-Control lineage cannot be rewritten | same | mapping lineage immutability |
| T42–T48 | `policies_no_hard_delete`; `policy_frameworks_no_hard_delete`; `controls_no_hard_delete`; `control_policy_versions_no_hard_delete`; `control_frameworks_no_hard_delete`; `rule_controls_no_hard_delete`; `checkpoints_no_hard_delete` | named governance history tables | BEFORE DELETE | historically relevant records cannot be physically deleted | same | no hard-delete paths |
| T49 | `checkpoint_reviews_period_guard` | `checkpoint_reviews` | BEFORE INSERT | Checkpoint is active and review period matches its `KpiFrequency` | same | review-period validation |
| T50 | `checkpoint_reviews_sync_latest` | `checkpoint_reviews` | AFTER INSERT | latest review pointer, reviewed timestamp and next-review date advance from the append-only ledger | same | latest-review synchronization |

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

## Milestone 4 functions: 14/14

Migration `20260730040412_milestone_4_policy_control_checkpoint_foundation`
adds:

- `require_active_governance_member`;
- `enforce_governance_actor_membership`;
- `enforce_policy_version_lifecycle`;
- `enforce_policy_framework_lineage`;
- `prevent_append_only_governance_mutation`;
- `enforce_policy_approval_decision`;
- `enforce_policy_current_approved_version`;
- `enforce_active_rule_control_framework`;
- `prevent_framework_mapping_deactivation`;
- `enforce_terminal_governance_archive`;
- `enforce_governance_lineage_immutability`;
- `prevent_governance_history_delete`;
- `enforce_checkpoint_review_period`;
- `sync_checkpoint_latest_review`.

The fresh catalogue contains 29 `public` functions in total after all ten
migrations.

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
| Governance counters | Policy, Control and Checkpoint tenant counters remain positive |
| Policy | code/title/next-version values are valid; archive fields agree with lifecycle |
| Policy Version | positive sequence and semantic numbers; content length 1–100,000; dangerous raw HTML elements prohibited; dates and lifecycle actors/timestamps agree; no self-approval; approved date is not in the future; supersession fields agree with status |
| Policy approval | only `APPROVED` and `REJECTED` decisions; rejected decisions require comments |
| Control | code and required text are nonblank; `NOT_APPLICABLE` requires notes; review dates are ordered; archive fields agree with lifecycle |
| Checkpoint | code and required text are nonblank; archive fields agree with lifecycle |
| Checkpoint review | `PARTIAL` and `FAIL` require observations; next review follows review date |

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
- Policy to department and its deferred current Policy Version pointer;
- Policy Version to Policy and a same-Policy superseding version;
- Policy Framework and PolicyApproval to the exact Policy/Policy Version;
- Control to department;
- ControlPolicyVersion to the exact tenant Control and Policy Version/Policy;
- ControlFramework to tenant Control;
- RuleControl to the matching ControlFramework and Framework/FrameworkRule;
- Checkpoint to tenant Control, department and its deferred latest review;
- CheckpointReview to tenant Checkpoint.

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

Five partial unique indexes enforce active-state uniqueness:

- `kpi_configurations_one_active_scope_key` — one non-deleted configuration
  for a tenant/definition/scope, using `NULLS NOT DISTINCT`;
- `kpi_actuals_one_active_configuration_period_key` — one non-deleted actual
  per tenant/configuration/period;
- `risks_one_active_per_kpi_actual` — one non-deleted, non-archived risk per
  tenant/KPI actual.
- `policy_versions_one_current_approved` — no more than one `APPROVED` version
  per tenant/Policy;
- `control_policy_versions_one_active_mapping` — no duplicate active mapping
  for one tenant/Control/Policy/Policy Version tuple while inactive history is
  retained.

`tenants.next_kpi_actual_number`, `next_risk_number`, `next_policy_number`,
`next_control_number` and `next_checkpoint_number` are positive row counters.
Active KPI/Risk services increment their counters inside the business
transaction. The Milestone 4 foundation allocator exposes the same
transaction-bound `UPDATE ... RETURNING` pattern for later services; no Slice 1
API consumes it. The governance integration test proves independent,
concurrent and rollback-safe Policy, Control and Checkpoint allocations.
Unique `(tenant_id,code)` indexes remain the final collision barrier.

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
