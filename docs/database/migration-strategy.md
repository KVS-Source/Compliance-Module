# PostgreSQL migration strategy

## Authority

`backend/prisma/migrations/` is the only authoritative database migration
history. The current baseline contains ordered migrations including:

1. `20260721181500_milestone_1`
2. `20260721190000_membership_hardening`
3. `20260724200000_user_role_membership_invariant`
4. `20260726143000_slice_a_kpi_configuration_targets`
5. `20260726201500_slice_b_kpi_actual_submission`
6. `20260726224500_slice_d_automatic_kpi_risk`
7. `20260727113000_slice_c_kpi_actual_approval`
8. `20260727123000_kpi_actual_server_generated_codes`
9. `20260727150000_slice_e_risk_workflow`
10. `20260730040412_milestone_4_policy_control_checkpoint_foundation`
11. `20260801090000_milestone_5_slice_1_evidence_foundation`
12. `20260801120000_milestone_5_slice_2_evidence_content_sha_unique`
13. `20260801160000_milestone_5_slice_5c_policy_evidence_gate`
14. `20260801200000_milestone_5_slice_5d_kpi_evidence_gate`

Migration fourteen adds typed `evidence_kpi_actual_links` (tenant-safe FKs,
unique evidence+actual pair, soft `is_active`, indexes for gate and list
queries). No Evidence-link backfill. Permission catalogue entries and role
assignments are applied by the idempotent seed mechanism, not migration SQL.

## Commands by environment

- Controlled shared environments use `npm run prisma:migrate --prefix backend`,
  which invokes `prisma migrate deploy`.
- `prisma migrate dev` is permitted only while creating a migration against an
  isolated developer database.
- `prisma db push` is prohibited for UAT, staging and production because it
  bypasses the reviewed migration history.
- Application startup, Docker startup and package installation must not apply
  migrations or seed data automatically.

## Required change workflow

1. Create one schema branch at a time from the current protected `main`.
2. Change `schema.prisma` and create one clearly named, timestamped migration
   on an isolated database.
3. Review generated SQL and every handwritten SQL block. Pay particular
   attention to locks, data rewrites, trigger ordering, constraint validation,
   destructive statements and tenant-key coverage.
4. Test the complete history against an empty disposable database.
5. Test upgrade from the previous released schema and representative synthetic
   data.
6. Run `prisma migrate status` and a catalogue comparison to detect schema
   drift.
7. Record backup and preflight results before applying to a controlled shared
   environment.
8. Merge the single schema branch before another branch allocates a migration
   timestamp. Rebase a later, unmerged schema branch and regenerate its
   migration rather than accepting ordering conflicts.

Never rewrite, rename or delete an applied migration. A defect in an applied
migration is repaired by a new forward migration.

## Rollback and forward repair

Before deployment, classify the change:

- Prefer a forward repair when the migration was applied and application data
  has already been written under the new contract.
- Roll back application code only when the prior code remains compatible with
  the migrated schema.
- Restore a database only for an agreed recovery event where data loss and the
  observed recovery-point objective are understood.
- Never mark a failed migration as resolved until the database state and SQL
  effect have been independently inspected.

The deployment record must identify the decision owner, migration range,
backup identifier, preflight results, start/end times, outcome and any repair.

## Long-running data migrations

Use expand-and-contract delivery:

1. add nullable or backward-compatible structures;
2. deploy code that can read both representations;
3. backfill in bounded, resumable batches with progress and lock monitoring;
4. verify counts and checksums;
5. enforce constraints using low-lock techniques where PostgreSQL permits;
6. switch reads and writes;
7. remove the retired representation only in a later reviewed release.

Set an explicit lock timeout and statement timeout based on the environment.
Do not hold a transaction open while waiting for external work. Pause when
replication lag, lock waits or error thresholds exceed the approved limit.

## Verification gates

Every schema pull request must provide:

- Prisma validation and generation;
- empty-database `migrate deploy`;
- previous-release upgrade;
- integration tests against real disposable PostgreSQL;
- migration count and checksum review;
- table, index, constraint, function and trigger catalogue comparison;
- drift check;
- backup/restore evidence proportionate to risk;
- confirmation that no private workbook data or credentials entered Git.
