# pgAdmin 4 operations guide

pgAdmin 4 is an inspection and administration tool. It is not the schema
authority: reviewed SQL in `backend/prisma/migrations/`, applied with Prisma
Migrate, remains authoritative.

Prohibited actions:

- do not create, alter or drop application tables, columns, enums, functions,
  indexes, constraints or triggers through pgAdmin;
- do not edit compliance rows through the data grid;
- do not store credentials, complete connection strings or authentication
  cookies in screenshots, tickets or documentation;
- do not test restores over development, UAT or production databases.

Use a database account with read-only rights for ordinary inspection. Elevate
only for a recorded administration procedure, then return to least privilege.

## Register a server

1. Obtain the approved host, port, maintenance database and username from the
   environment owner. Retrieve the password through the approved secret
   channel.
2. In pgAdmin choose **Register → Server**.
3. On **General**, use a non-sensitive label such as
   `GenBioCa disposable PostgreSQL`.
4. On **Connection**, enter the approved host, port, maintenance database and
   username. Do not enable password saving on an unmanaged workstation.
5. Configure TLS as required by the target environment.
6. Confirm the connection target before opening the Query Tool.

For local Docker, the host is normally `127.0.0.1`; use the configured
`POSTGRES_PORT`, database and username values. Never paste values from a real
environment into this document.

## Browse database objects

Under **Databases → selected database → Schemas → public**:

- **Tables → Columns** shows types, defaults and nullability;
- **Tables → Constraints** shows PK, FK, unique and check constraints;
- **Tables → Indexes** shows ordinary, unique and partial indexes;
- **Tables → Triggers** shows the 51 application triggers;
- **Functions** shows the trigger functions;
- **Catalogs** provides PostgreSQL-owned metadata.

View Prisma history read-only:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public."_prisma_migrations"
ORDER BY started_at;
```

There must be ten finished, non-rolled-back migrations for this baseline.
Never edit `_prisma_migrations` manually.

## Safe inspection queries

Use **Query Tool → Execute** only after confirming the database name shown in
the tab. These statements are read-only:

```sql
SELECT current_database(), current_user, current_timestamp;

SELECT COUNT(*) AS tenant_count FROM public.tenants;
SELECT COUNT(*) AS user_count FROM public.users;
SELECT COUNT(*) AS active_membership_count
FROM public.user_companies
WHERE status = 'ACTIVE';

SELECT t.code, COUNT(kc.id) AS active_kpi_configuration_count
FROM public.tenants AS t
LEFT JOIN public.kpi_configurations AS kc
  ON kc.tenant_id = t.id
 AND kc.deleted_at IS NULL
 AND kc.status = 'ACTIVE'
 AND kc.enabled = true
GROUP BY t.code
ORDER BY t.code;

SELECT t.code, r.status, COUNT(r.id) AS risk_count
FROM public.tenants AS t
LEFT JOIN public.risks AS r
  ON r.tenant_id = t.id
 AND r.deleted_at IS NULL
GROUP BY t.code, r.status
ORDER BY t.code, r.status;
```

Inspect definitions without changing them:

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname;

SELECT c.relname AS table_name, t.tgname,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
```

Identify long-running, non-idle sessions:

```sql
SELECT pid, usename, application_name, client_addr, state,
       now() - query_start AS query_age, wait_event_type, wait_event,
       left(query, 160) AS query_excerpt
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY query_start;
```

Do not terminate a session without confirming its owner and following the
environment incident/change procedure.

## Custom-format backup

1. Confirm the source database and change record.
2. Right-click the source database and choose **Backup**.
3. Select **Custom** format.
4. Enable **No owner** and **No privileges** when the restore target uses
   different roles.
5. Save outside the repository in approved access-controlled, encrypted
   storage.
6. Record timestamp, source identifier, backup size, tool/PostgreSQL version,
   retention owner and integrity check.

## Isolated restore

1. Create a separately named disposable database. Never select an existing UAT
   or production database.
2. Right-click that disposable database, choose **Restore**, select the custom
   dump, and use **No owner**, **No privileges** and **Exit on error**.
3. Reconcile migration digest/count, selected row counts, constraints, indexes
   and triggers.
4. point a local application process at the disposable restore and verify
   `/api/v1/health` and `/api/v1/ready`.
5. Record observed recovery time and recovery point.
6. Disconnect sessions, drop the disposable database and securely remove the
   temporary dump according to retention policy.

The detailed command-line procedure and the Milestone 0 drill evidence are in
[backup-and-restore.md](./backup-and-restore.md).
