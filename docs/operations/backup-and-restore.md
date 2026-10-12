# PostgreSQL backup and restore

## Purpose and safety boundary

This runbook verifies that a PostgreSQL custom-format backup can be restored
into a separately created disposable database. It does not authorize access to
production or UAT.

- Confirm the exact source and target names before every command.
- Never restore over an existing shared database.
- Never place a dump, password or complete connection string in Git.
- Use `pg_dump`/`pg_restore` versions compatible with the server.
- Use an approved encrypted store with access logging for retained backups.
- Assign an owner for retention, expiry, restoration testing and deletion.

## Backup procedure

1. Record the change or recovery ticket, source identifier, PostgreSQL version,
   operator and start time.
2. Confirm that the target directory is outside the repository and restricted
   to the operator.
3. Create a custom-format dump:

   ```sh
   pg_dump --format=custom --no-owner --no-privileges \
     --file=<protected-temporary-path> <approved-source-database>
   ```

4. Record file size and an approved integrity digest. Move a retained dump to
   encrypted storage; remove the temporary plaintext/local copy.
5. Record the recovery point. A logical dump is not continuous point-in-time
   recovery; its achievable RPO is bounded by when the dump captured each
   object. Production RPO requires an approved WAL/PITR design, which is not
   established by Milestone 0.

## Restore procedure

1. Create a new, unmistakably disposable database:

   ```sh
   createdb <new-disposable-restore-database>
   ```

2. Restore without source ownership or grants:

   ```sh
   pg_restore --dbname=<new-disposable-restore-database> \
     --no-owner --no-privileges --exit-on-error \
     <protected-temporary-path>
   ```

3. Compare source and restore:

   - every finished, non-rolled-back Prisma migration and its source checksum;
   - all business-table row counts, without exporting private row content;
   - every model table and enum type/value in the current Prisma schema;
   - all non-internal triggers and their enabled states;
   - constraint, index, function and RLS policy definitions.

   Derive expected counts from the current source, not historical milestone
   records. PostgreSQL can regroup equivalent CHECK expressions on restore;
   reparse both definitions in temporary tables when comparing them. Do not
   remove conditions or ignore a difference without establishing equivalence.

4. Start the current backend against the disposable restore. Require
   `/api/v1/health` and `/api/v1/ready` to return success.
5. Record end time and observed RTO. Include application readiness, not only
   `pg_restore`, in the operational RTO measurement.
6. Disconnect the application, drop only the validated disposable restore, and
   securely remove the temporary dump.

## Verification SQL

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT COUNT(*) FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

SELECT COUNT(*) FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'public';

SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
```

Select row counts based on implemented domains and data classification. Do not
export private row content merely to compare counts.

## Milestone 0 local drill record

Date: 2026-07-29 UTC
Environment: local Docker `postgres:16-alpine`; disposable test service only

| Evidence | Result |
| --- | --- |
| Source | `genbioca_m0_catalog_20260729` — freshly created, migrated and synthetic test-seeded |
| Format | PostgreSQL custom format (`pg_dump --format=custom`), no owner, no privileges |
| Backup size | 123,758 bytes |
| Restore target | separately created `genbioca_m0_restore_20260729` |
| Backup/restore interval | 2026-07-29 05:08:51Z–05:08:52Z; 1 second locally |
| Migration history | source 9; restore 9; aggregate checksum digest matched (`a70a619834991a863ede5d7c2b410875`) |
| Application triggers | source 15; restore 15 |
| Constraints | source 118; restore 118 |
| Indexes | source 98; restore 98 |
| `tenants` | source 3; restore 3 |
| `users` | source 2; restore 2 |
| `kpi_configurations` | source 3; restore 3 |
| `kpi_targets` | source 3; restore 3 |
| `kpi_actuals` | source 0; restore 0 |
| `risks` | source 0; restore 0 |
| Application readiness | PASS: current backend returned ready on the restored database |
| Cleanup | source database, restored database, temporary dump and temporary directory removed |

Observed local RTO for `pg_dump` plus `pg_restore` was one second; application
readiness was verified immediately afterward. This small synthetic drill is
not a production RTO commitment. Observed drill RPO was zero for the compared
migration metadata and selected row counts, but this snapshot result is not a
production backup-frequency or PITR commitment.
