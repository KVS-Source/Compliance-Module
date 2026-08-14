ALTER TABLE "user_companies"
  ADD COLUMN "department_id" UUID;

CREATE INDEX "user_companies_department_id_idx"
  ON "user_companies"("department_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_default_tenant_id_fkey"
  FOREIGN KEY ("default_tenant_id") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_companies"
  ADD CONSTRAINT "user_companies_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "org_departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_user_role_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "roles"
    WHERE "roles"."id" = NEW."role_id"
      AND "roles"."tenant_id" = NEW."tenant_id"
  ) THEN
    RAISE EXCEPTION 'user role tenant must match role tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_roles_tenant_match"
BEFORE INSERT OR UPDATE OF "role_id", "tenant_id" ON "user_roles"
FOR EACH ROW EXECUTE FUNCTION enforce_user_role_tenant();

CREATE OR REPLACE FUNCTION enforce_membership_department_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."department_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "org_departments"
    WHERE "org_departments"."id" = NEW."department_id"
      AND "org_departments"."tenant_id" = NEW."tenant_id"
  ) THEN
    RAISE EXCEPTION 'membership department must belong to membership tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_companies_department_tenant_match"
BEFORE INSERT OR UPDATE OF "department_id", "tenant_id" ON "user_companies"
FOR EACH ROW EXECUTE FUNCTION enforce_membership_department_tenant();
