# pgAdmin 4 operator note for the UAT demo

PostgreSQL is the application database. pgAdmin 4 is an inspection and
administration tool only; Prisma migrations in `backend/prisma/migrations/`
remain authoritative. Never create or alter application tables manually in
pgAdmin.

## Register the local Docker server

1. Start the repository PostgreSQL service.
2. In pgAdmin, choose **Register → Server**.
3. Give it a local description such as `GenBioCa local Docker`.
4. On **Connection**, use:
   - Host: `127.0.0.1`
   - Port: the local `POSTGRES_PORT` value
   - Maintenance database: the local `POSTGRES_DB` value
   - Username: the local `POSTGRES_USER` value
5. Retrieve the password from the operator's private local environment. Do not
   copy it into this document or save it in source control.

Application tables are under **Databases → selected database → Schemas →
public → Tables**. A table's **Constraints** and **Triggers** nodes expose the
database invariants installed by Prisma migrations.

Use **View/Edit Data → First 100 Rows** for inspection. Do not edit compliance
records through that grid.

## Safe read-only verification

Run this in the Query Tool. It performs only `SELECT` statements:

```sql
SELECT COUNT(*) AS tenant_count
FROM public.tenants;

SELECT COUNT(*) AS active_user_membership_count
FROM public.user_companies
WHERE status = 'ACTIVE';

SELECT COUNT(*) AS framework_count
FROM public.frameworks;

SELECT t.code AS tenant_code, COUNT(kc.id) AS active_kpi_configuration_count
FROM public.tenants AS t
LEFT JOIN public.kpi_configurations AS kc
  ON kc.tenant_id = t.id
 AND kc.deleted_at IS NULL
 AND kc.status = 'ACTIVE'
 AND kc.enabled = true
GROUP BY t.code
ORDER BY t.code;

SELECT
  t.code AS tenant_code,
  COALESCE(ka.rag_status::text, 'INFORMATIONAL') AS rag,
  COUNT(ka.id) AS actual_count
FROM public.tenants AS t
LEFT JOIN public.kpi_actuals AS ka
  ON ka.tenant_id = t.id
 AND ka.deleted_at IS NULL
GROUP BY t.code, COALESCE(ka.rag_status::text, 'INFORMATIONAL')
ORDER BY t.code, rag;

SELECT
  t.code AS tenant_code,
  r.status,
  COALESCE(r.kpi_risk_class::text, 'UNCLASSIFIED') AS kpi_risk_class,
  COUNT(r.id) AS risk_count
FROM public.tenants AS t
LEFT JOIN public.risks AS r
  ON r.tenant_id = t.id
 AND r.deleted_at IS NULL
GROUP BY t.code, r.status, COALESCE(r.kpi_risk_class::text, 'UNCLASSIFIED')
ORDER BY t.code, r.status, kpi_risk_class;
```

## Backup and isolated restore

To create a backup, right-click the database, choose **Backup**, select
**Custom** format, and store the file outside the repository in an
access-controlled location.

Never overwrite the working UAT database to test a restore. Create a separate
empty test database, right-click that database, choose **Restore**, select the
custom-format backup, and verify the restored schema and row counts there.
