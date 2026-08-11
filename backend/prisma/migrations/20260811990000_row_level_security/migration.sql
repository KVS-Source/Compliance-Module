-- Row-level security: a database backstop behind the application's tenant
-- predicates, so a query that forgets its `where tenantId` returns nothing
-- instead of another Company's rows.
--
-- Deliberately numbered to run LAST. Policies are applied by walking the
-- catalogue for tables carrying `tenant_id`, so any table created by an earlier
-- migration is covered and none is missed. A table added *later* is not
-- covered by this file — `tests/rls-tenant-isolation.test.ts` fails if a
-- tenant-owned table ever lacks the policy, which is the guard against drift.
--
-- IMPORTANT — this is inert while the application connects as a superuser.
-- PostgreSQL superusers (and roles with BYPASSRLS) ignore policies entirely,
-- including FORCE ROW LEVEL SECURITY. The policies below only take effect once
-- the connection uses `genbioca_app`, which this migration creates. Switching
-- DATABASE_URL to that role is a deployment decision and belongs with
-- production bring-up; until then the policies are proven by test but not
-- enforced at runtime. Do not record RLS as active without making that switch.

-- The application role. Created NOLOGIN deliberately: giving it a password here
-- would put a credential in source control. The deployment grants login out of
-- band from its secret manager:
--   ALTER ROLE genbioca_app LOGIN PASSWORD '<from secret manager>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'genbioca_app') THEN
    CREATE ROLE genbioca_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO genbioca_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO genbioca_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO genbioca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO genbioca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO genbioca_app;

-- `current_setting('app.tenant_id', true)` yields an EMPTY STRING, not NULL,
-- once the setting has been touched in a session — and ''::uuid raises
-- `invalid input syntax for type uuid`. NULLIF converts that back to NULL so an
-- unset context compares as NULL and matches no rows: a clean deny rather than
-- a query error. Without NULLIF a request that never established its tenant
-- would fail with a 500 instead of simply seeing nothing.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    -- FORCE so the table owner is subject to its own policy too; without it an
    -- owner connection would quietly bypass the backstop.
    EXECUTE format(
      'ALTER TABLE %I FORCE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON %I', target.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      target.table_name);
  END LOOP;
END
$$;
