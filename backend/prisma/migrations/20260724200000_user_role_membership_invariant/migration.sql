-- Active role assignments require an active membership for the same user and tenant.
-- This migration performs no automatic cleanup. It aborts if inconsistent rows exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS ur
    LEFT JOIN "user_companies" AS uc
      ON uc."user_id" = ur."user_id"
      AND uc."tenant_id" = ur."tenant_id"
      AND uc."status" = 'ACTIVE'
    WHERE ur."status" = 'ACTIVE'
      AND uc."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'active user role assignments without active Company membership require manual cleanup';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_active_user_role_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'ACTIVE' AND NOT EXISTS (
    SELECT 1
    FROM "user_companies"
    WHERE "user_companies"."user_id" = NEW."user_id"
      AND "user_companies"."tenant_id" = NEW."tenant_id"
      AND "user_companies"."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION
      'active user role assignment requires active Company membership';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_roles_active_membership_required"
BEFORE INSERT OR UPDATE OF "user_id", "tenant_id", "status" ON "user_roles"
FOR EACH ROW EXECUTE FUNCTION enforce_active_user_role_membership();
