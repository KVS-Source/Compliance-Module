BEGIN;

-- Convert the KPI catalogue strings without losing or silently coercing rows.
-- The preflight accepts only the reviewed workbook labels and their canonical
-- enum-form equivalents, matched case-insensitively after trimming.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "kpi_definitions"
    WHERE CASE lower(btrim("direction"))
      WHEN 'higher is better' THEN 'HIGHER_IS_BETTER'
      WHEN 'higher_is_better' THEN 'HIGHER_IS_BETTER'
      WHEN 'lower is better' THEN 'LOWER_IS_BETTER'
      WHEN 'lower_is_better' THEN 'LOWER_IS_BETTER'
      WHEN 'target exact' THEN 'TARGET_EXACT'
      WHEN 'target_exact' THEN 'TARGET_EXACT'
      WHEN 'informational' THEN 'INFORMATIONAL'
      ELSE NULL
    END IS NULL
  ) THEN
    RAISE EXCEPTION
      'kpi_definitions.direction contains an unmapped value; migration aborted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "kpi_definitions"
    WHERE CASE lower(btrim("frequency"))
      WHEN 'daily' THEN 'DAILY'
      WHEN 'weekly' THEN 'WEEKLY'
      WHEN 'monthly' THEN 'MONTHLY'
      WHEN 'quarterly' THEN 'QUARTERLY'
      WHEN 'half-yearly' THEN 'HALF_YEARLY'
      WHEN 'half_yearly' THEN 'HALF_YEARLY'
      WHEN 'annual' THEN 'ANNUAL'
      WHEN 'continuous' THEN 'CONTINUOUS'
      WHEN 'per-event' THEN 'PER_EVENT'
      WHEN 'per_event' THEN 'PER_EVENT'
      WHEN 'one-time' THEN 'ONE_TIME'
      WHEN 'one_time' THEN 'ONE_TIME'
      ELSE NULL
    END IS NULL
  ) THEN
    RAISE EXCEPTION
      'kpi_definitions.frequency contains an unmapped value; migration aborted';
  END IF;
END;
$$;

CREATE TYPE "KpiDirection" AS ENUM (
  'HIGHER_IS_BETTER',
  'LOWER_IS_BETTER',
  'TARGET_EXACT',
  'INFORMATIONAL'
);

CREATE TYPE "KpiFrequency" AS ENUM (
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'CONTINUOUS',
  'PER_EVENT',
  'ONE_TIME'
);

CREATE TYPE "SubmissionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "kpi_definitions"
  ADD COLUMN "direction_enum" "KpiDirection",
  ADD COLUMN "frequency_enum" "KpiFrequency";

UPDATE "kpi_definitions"
SET
  "direction_enum" = (
    CASE lower(btrim("direction"))
      WHEN 'higher is better' THEN 'HIGHER_IS_BETTER'
      WHEN 'higher_is_better' THEN 'HIGHER_IS_BETTER'
      WHEN 'lower is better' THEN 'LOWER_IS_BETTER'
      WHEN 'lower_is_better' THEN 'LOWER_IS_BETTER'
      WHEN 'target exact' THEN 'TARGET_EXACT'
      WHEN 'target_exact' THEN 'TARGET_EXACT'
      WHEN 'informational' THEN 'INFORMATIONAL'
    END
  )::"KpiDirection",
  "frequency_enum" = (
    CASE lower(btrim("frequency"))
      WHEN 'daily' THEN 'DAILY'
      WHEN 'weekly' THEN 'WEEKLY'
      WHEN 'monthly' THEN 'MONTHLY'
      WHEN 'quarterly' THEN 'QUARTERLY'
      WHEN 'half-yearly' THEN 'HALF_YEARLY'
      WHEN 'half_yearly' THEN 'HALF_YEARLY'
      WHEN 'annual' THEN 'ANNUAL'
      WHEN 'continuous' THEN 'CONTINUOUS'
      WHEN 'per-event' THEN 'PER_EVENT'
      WHEN 'per_event' THEN 'PER_EVENT'
      WHEN 'one-time' THEN 'ONE_TIME'
      WHEN 'one_time' THEN 'ONE_TIME'
    END
  )::"KpiFrequency";

ALTER TABLE "kpi_definitions"
  ALTER COLUMN "direction_enum" SET NOT NULL,
  ALTER COLUMN "frequency_enum" SET NOT NULL,
  DROP COLUMN "direction",
  DROP COLUMN "frequency";

ALTER TABLE "kpi_definitions"
  RENAME COLUMN "direction_enum" TO "direction";
ALTER TABLE "kpi_definitions"
  RENAME COLUMN "frequency_enum" TO "frequency";

ALTER TABLE "tenants"
  ADD COLUMN "default_amber_threshold_pct" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "default_red_threshold_pct" DECIMAL(6,2) NOT NULL DEFAULT 10.00;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_kpi_thresholds_valid"
  CHECK (
    "default_amber_threshold_pct" >= 0
    AND "default_red_threshold_pct" >= "default_amber_threshold_pct"
  );

-- Composite keys let tenant-owned foreign keys prove tenant consistency.
CREATE UNIQUE INDEX "org_departments_tenant_id_id_key"
  ON "org_departments"("tenant_id", "id");
CREATE UNIQUE INDEX "org_locations_tenant_id_id_key"
  ON "org_locations"("tenant_id", "id");
CREATE UNIQUE INDEX "org_units_tenant_id_id_key"
  ON "org_units"("tenant_id", "id");

CREATE TABLE "kpi_configurations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "kpi_definition_id" UUID NOT NULL,
  "org_unit_id" UUID,
  "org_location_id" UUID,
  "product_service" TEXT,
  "department_id" UUID,
  "owner_id" UUID NOT NULL,
  "approver_id" UUID,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "currency" TEXT,
  "review_frequency" "KpiFrequency" NOT NULL,
  "amber_threshold_pct" DECIMAL(6,2),
  "red_threshold_pct" DECIMAL(6,2),
  "requires_evidence" BOOLEAN NOT NULL DEFAULT false,
  "requires_approval" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "kpi_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_configurations_effective_dates_valid"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "kpi_configurations_currency_valid"
    CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "kpi_configurations_thresholds_valid"
    CHECK (
      ("amber_threshold_pct" IS NULL OR "amber_threshold_pct" >= 0)
      AND ("red_threshold_pct" IS NULL OR "red_threshold_pct" >= 0)
      AND (
        "amber_threshold_pct" IS NULL
        OR "red_threshold_pct" IS NULL
        OR "red_threshold_pct" >= "amber_threshold_pct"
      )
    )
);

CREATE TABLE "kpi_targets" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "kpi_configuration_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "target_value" DECIMAL(18,4) NOT NULL,
  "min_value" DECIMAL(18,4),
  "max_value" DECIMAL(18,4),
  "approval_status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_by_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "superseded_by_id" UUID,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_targets_period_dates_valid"
    CHECK ("period_end" >= "period_start"),
  CONSTRAINT "kpi_targets_effective_dates_valid"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "kpi_targets_tolerance_valid"
    CHECK (
      "max_value" IS NULL
      OR "min_value" IS NULL
      OR "max_value" >= "min_value"
    ),
  CONSTRAINT "kpi_targets_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "kpi_targets_no_self_approval"
    CHECK (
      "submitted_by_id" IS NULL
      OR "approved_by_id" IS NULL
      OR "submitted_by_id" <> "approved_by_id"
    )
);

CREATE UNIQUE INDEX "kpi_configurations_tenant_id_id_key"
  ON "kpi_configurations"("tenant_id", "id");
CREATE INDEX "kpi_configurations_tenant_status_enabled_deleted_effective_idx"
  ON "kpi_configurations"(
    "tenant_id",
    "status",
    "enabled",
    "deleted_at",
    "effective_from"
  );
CREATE INDEX "kpi_configurations_tenant_definition_idx"
  ON "kpi_configurations"("tenant_id", "kpi_definition_id");
CREATE INDEX "kpi_configurations_owner_id_idx"
  ON "kpi_configurations"("owner_id");
CREATE INDEX "kpi_configurations_approver_id_idx"
  ON "kpi_configurations"("approver_id");
CREATE INDEX "kpi_configurations_org_unit_id_idx"
  ON "kpi_configurations"("org_unit_id");
CREATE INDEX "kpi_configurations_org_location_id_idx"
  ON "kpi_configurations"("org_location_id");
CREATE INDEX "kpi_configurations_department_id_idx"
  ON "kpi_configurations"("department_id");

CREATE UNIQUE INDEX "kpi_configurations_one_active_scope_key"
  ON "kpi_configurations"(
    "tenant_id",
    "kpi_definition_id",
    "org_unit_id",
    "org_location_id",
    "product_service",
    "department_id"
  )
  NULLS NOT DISTINCT
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "kpi_targets_tenant_id_id_key"
  ON "kpi_targets"("tenant_id", "id");
CREATE UNIQUE INDEX "kpi_targets_tenant_id_code_key"
  ON "kpi_targets"("tenant_id", "code");
CREATE UNIQUE INDEX "kpi_targets_tenant_configuration_period_version_key"
  ON "kpi_targets"(
    "tenant_id",
    "kpi_configuration_id",
    "period",
    "version"
  );
CREATE INDEX "kpi_targets_tenant_configuration_period_approval_deleted_idx"
  ON "kpi_targets"(
    "tenant_id",
    "kpi_configuration_id",
    "period",
    "approval_status",
    "deleted_at"
  );
CREATE INDEX "kpi_targets_tenant_approval_deleted_idx"
  ON "kpi_targets"("tenant_id", "approval_status", "deleted_at");
CREATE INDEX "kpi_targets_superseded_by_id_idx"
  ON "kpi_targets"("superseded_by_id");

ALTER TABLE "kpi_configurations"
  ADD CONSTRAINT "kpi_configurations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_kpi_definition_id_fkey"
  FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_tenant_org_unit_fkey"
  FOREIGN KEY ("tenant_id", "org_unit_id")
  REFERENCES "org_units"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_tenant_org_location_fkey"
  FOREIGN KEY ("tenant_id", "org_location_id")
  REFERENCES "org_locations"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_tenant_department_fkey"
  FOREIGN KEY ("tenant_id", "department_id")
  REFERENCES "org_departments"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_approver_id_fkey"
  FOREIGN KEY ("approver_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_configurations_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kpi_targets"
  ADD CONSTRAINT "kpi_targets_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_tenant_configuration_fkey"
  FOREIGN KEY ("tenant_id", "kpi_configuration_id")
  REFERENCES "kpi_configurations"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_targets_tenant_superseded_by_fkey"
  FOREIGN KEY ("tenant_id", "superseded_by_id")
  REFERENCES "kpi_targets"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_kpi_configuration_tenant_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."owner_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI configuration owner must be an active Company member';
  END IF;

  IF NEW."approver_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."approver_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI configuration approver must be an active Company member';
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
    RAISE EXCEPTION 'KPI configuration creator must be an active Company member';
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
    RAISE EXCEPTION 'KPI configuration updater must be an active Company member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_configurations_tenant_users_active"
BEFORE INSERT OR UPDATE OF
  "tenant_id",
  "owner_id",
  "approver_id",
  "created_by_id",
  "updated_by_id"
ON "kpi_configurations"
FOR EACH ROW EXECUTE FUNCTION enforce_kpi_configuration_tenant_users();

CREATE OR REPLACE FUNCTION enforce_kpi_target_tenant_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."submitted_by_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."submitted_by_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'KPI target submitter must be an active Company member';
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
    RAISE EXCEPTION 'KPI target approver must be an active Company member';
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
    RAISE EXCEPTION 'KPI target creator must be an active Company member';
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
    RAISE EXCEPTION 'KPI target updater must be an active Company member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_targets_tenant_users_active"
BEFORE INSERT OR UPDATE OF
  "tenant_id",
  "submitted_by_id",
  "approved_by_id",
  "created_by_id",
  "updated_by_id"
ON "kpi_targets"
FOR EACH ROW EXECUTE FUNCTION enforce_kpi_target_tenant_users();

CREATE OR REPLACE FUNCTION prevent_approved_kpi_target_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."approval_status" <> 'APPROVED' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approved KPI targets are immutable';
  END IF;

  IF (
    to_jsonb(NEW) - ARRAY['superseded_by_id', 'updated_by_id', 'updated_at']
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY['superseded_by_id', 'updated_by_id', 'updated_at']
  ) THEN
    RAISE EXCEPTION 'approved KPI targets are immutable';
  END IF;

  IF OLD."superseded_by_id" IS NOT NULL
    AND NEW."superseded_by_id" IS DISTINCT FROM OLD."superseded_by_id"
  THEN
    RAISE EXCEPTION 'approved KPI target supersession cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_targets_approved_immutable"
BEFORE UPDATE OR DELETE ON "kpi_targets"
FOR EACH ROW EXECUTE FUNCTION prevent_approved_kpi_target_mutation();

INSERT INTO "permissions" ("id", "code", "name")
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    'kpi-config:write',
    'Create and update Company KPI configurations'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'kpi-target:write',
    'Create and update Company KPI targets'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'kpi-target:approve',
    'Approve and reject Company KPI targets'
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
  AND permission."code" IN (
    'kpi-config:write',
    'kpi-target:write',
    'kpi-target:approve'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
