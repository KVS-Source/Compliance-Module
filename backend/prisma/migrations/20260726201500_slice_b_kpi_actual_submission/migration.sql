BEGIN;

CREATE TYPE "RagStatus" AS ENUM (
  'GREEN',
  'AMBER',
  'RED'
);

-- This redundant key lets the actual-to-target foreign key prove that the
-- selected target belongs to the same Company, configuration, and period.
CREATE UNIQUE INDEX "kpi_targets_tenant_id_kpi_configuration_id_period_id_key"
  ON "kpi_targets"(
    "tenant_id",
    "kpi_configuration_id",
    "period",
    "id"
  );

CREATE TABLE "kpi_actuals" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "kpi_configuration_id" UUID NOT NULL,
  "kpi_target_id" UUID NOT NULL,
  "period" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "target_value_snapshot" DECIMAL(18,4) NOT NULL,
  "actual_value" DECIMAL(18,4) NOT NULL,
  "variance" DECIMAL(18,4) NOT NULL,
  "variance_percentage" DECIMAL(18,4),
  "rag_status" "RagStatus",
  "target_met" BOOLEAN NOT NULL,
  "approval_status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "submitted_by_id" UUID NOT NULL,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "evidence_status" TEXT,
  "comments" TEXT,
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "kpi_actuals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_actuals_period_dates_valid"
    CHECK ("period_end" >= "period_start")
);

CREATE UNIQUE INDEX "kpi_actuals_tenant_id_id_key"
  ON "kpi_actuals"("tenant_id", "id");
CREATE UNIQUE INDEX "kpi_actuals_tenant_id_code_key"
  ON "kpi_actuals"("tenant_id", "code");
CREATE INDEX "kpi_actuals_tenant_id_approval_status_deleted_at_submitted_at_idx"
  ON "kpi_actuals"(
    "tenant_id",
    "approval_status",
    "deleted_at",
    "submitted_at"
  );
CREATE INDEX "kpi_actuals_tenant_id_kpi_target_id_idx"
  ON "kpi_actuals"("tenant_id", "kpi_target_id");

CREATE UNIQUE INDEX "kpi_actuals_one_active_configuration_period_key"
  ON "kpi_actuals"("tenant_id", "kpi_configuration_id", "period")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "kpi_actuals"
  ADD CONSTRAINT "kpi_actuals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_tenant_configuration_fkey"
  FOREIGN KEY ("tenant_id", "kpi_configuration_id")
  REFERENCES "kpi_configurations"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_tenant_target_configuration_period_fkey"
  FOREIGN KEY (
    "tenant_id",
    "kpi_configuration_id",
    "period",
    "kpi_target_id"
  )
  REFERENCES "kpi_targets"(
    "tenant_id",
    "kpi_configuration_id",
    "period",
    "id"
  )
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_actuals_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_kpi_actual_tenant_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."submitted_by_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI actual submitter must be an active Company member';
  END IF;

  IF NEW."approved_by_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."approved_by_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI actual approver must be an active Company member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."created_by_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI actual creator must be an active Company member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."updated_by_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI actual updater must be an active Company member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_actuals_tenant_users_active"
BEFORE INSERT OR UPDATE OF
  "tenant_id",
  "submitted_by_id",
  "approved_by_id",
  "created_by_id",
  "updated_by_id"
ON "kpi_actuals"
FOR EACH ROW EXECUTE FUNCTION enforce_kpi_actual_tenant_users();

INSERT INTO "permissions" ("id", "code", "name")
VALUES (
  '20000000-0000-4000-8000-000000000004',
  'kpi-actual:write',
  'Submit Company KPI actuals'
)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name";

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT
  md5(role."id"::text || permission."id"::text)::uuid,
  role."id",
  permission."id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" = 'COMPANY_ADMIN'
  AND permission."code" = 'kpi-actual:write'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
