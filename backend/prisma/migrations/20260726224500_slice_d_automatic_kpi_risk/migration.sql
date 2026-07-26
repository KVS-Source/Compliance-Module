BEGIN;

CREATE TYPE "KpiRiskClass" AS ENUM (
  'MAJOR',
  'MINOR'
);

CREATE TYPE "GeneralRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "RiskStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'TREATED',
  'CLOSED',
  'ARCHIVED'
);

CREATE TYPE "RiskTreatmentStrategy" AS ENUM (
  'AVOID',
  'MITIGATE',
  'TRANSFER',
  'ACCEPT'
);

ALTER TABLE "tenants"
  ADD COLUMN "next_risk_number" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "tenants_next_risk_number_positive"
    CHECK ("next_risk_number" >= 1);

-- This redundant key lets a KPI-triggered risk prove that its actual,
-- configuration, and target belong to one coherent Company-owned lineage.
CREATE UNIQUE INDEX "kpi_actuals_tenant_id_id_kpi_configuration_id_kpi_target_id_key"
  ON "kpi_actuals"(
    "tenant_id",
    "id",
    "kpi_configuration_id",
    "kpi_target_id"
  );

CREATE TABLE "risks" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "kpi_actual_id" UUID,
  "kpi_configuration_id" UUID,
  "kpi_target_id" UUID,
  "inherent_likelihood" INTEGER NOT NULL,
  "inherent_impact" INTEGER NOT NULL,
  "inherent_score" INTEGER NOT NULL,
  "residual_likelihood" INTEGER,
  "residual_impact" INTEGER,
  "residual_score" INTEGER,
  "kpi_risk_class" "KpiRiskClass",
  "general_level" "GeneralRiskLevel",
  "owner_id" UUID,
  "treatment_strategy" "RiskTreatmentStrategy",
  "review_date" DATE,
  "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
  "closed_at" TIMESTAMPTZ(6),
  "closure_reason" TEXT,
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "risks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risks_kpi_source_all_or_none"
    CHECK (
      (
        "kpi_actual_id" IS NULL
        AND "kpi_configuration_id" IS NULL
        AND "kpi_target_id" IS NULL
      )
      OR (
        "kpi_actual_id" IS NOT NULL
        AND "kpi_configuration_id" IS NOT NULL
        AND "kpi_target_id" IS NOT NULL
      )
    ),
  CONSTRAINT "risks_inherent_likelihood_valid"
    CHECK ("inherent_likelihood" BETWEEN 1 AND 5),
  CONSTRAINT "risks_inherent_impact_valid"
    CHECK ("inherent_impact" BETWEEN 1 AND 5),
  CONSTRAINT "risks_residual_likelihood_valid"
    CHECK (
      "residual_likelihood" IS NULL
      OR "residual_likelihood" BETWEEN 1 AND 5
    ),
  CONSTRAINT "risks_residual_impact_valid"
    CHECK (
      "residual_impact" IS NULL
      OR "residual_impact" BETWEEN 1 AND 5
    ),
  CONSTRAINT "risks_inherent_score_consistent"
    CHECK ("inherent_score" = "inherent_likelihood" * "inherent_impact")
);

CREATE UNIQUE INDEX "risks_tenant_id_id_key"
  ON "risks"("tenant_id", "id");
CREATE UNIQUE INDEX "risks_tenant_id_code_key"
  ON "risks"("tenant_id", "code");
CREATE INDEX "risks_tenant_id_status_deleted_at_created_at_idx"
  ON "risks"("tenant_id", "status", "deleted_at", "created_at");
CREATE INDEX "risks_tenant_id_kpi_actual_id_idx"
  ON "risks"("tenant_id", "kpi_actual_id");
CREATE INDEX "risks_tenant_id_kpi_configuration_id_idx"
  ON "risks"("tenant_id", "kpi_configuration_id");
CREATE INDEX "risks_tenant_id_kpi_target_id_idx"
  ON "risks"("tenant_id", "kpi_target_id");
CREATE INDEX "risks_tenant_id_owner_id_status_deleted_at_idx"
  ON "risks"("tenant_id", "owner_id", "status", "deleted_at");

CREATE UNIQUE INDEX "risks_one_active_per_kpi_actual"
  ON "risks"("tenant_id", "kpi_actual_id")
  WHERE "kpi_actual_id" IS NOT NULL
    AND "status" NOT IN ('CLOSED', 'ARCHIVED')
    AND "deleted_at" IS NULL;

ALTER TABLE "risks"
  ADD CONSTRAINT "risks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_tenant_actual_lineage_fkey"
  FOREIGN KEY (
    "tenant_id",
    "kpi_actual_id",
    "kpi_configuration_id",
    "kpi_target_id"
  )
  REFERENCES "kpi_actuals"(
    "tenant_id",
    "id",
    "kpi_configuration_id",
    "kpi_target_id"
  )
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_tenant_configuration_fkey"
  FOREIGN KEY ("tenant_id", "kpi_configuration_id")
  REFERENCES "kpi_configurations"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_tenant_target_fkey"
  FOREIGN KEY ("tenant_id", "kpi_target_id")
  REFERENCES "kpi_targets"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risks_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_risk_tenant_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."owner_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."owner_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'risk owner must be an active Company member';
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
    RAISE EXCEPTION 'risk creator must be an active Company member';
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
    RAISE EXCEPTION 'risk updater must be an active Company member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "risks_tenant_users_active"
BEFORE INSERT OR UPDATE OF
  "tenant_id",
  "owner_id",
  "created_by_id",
  "updated_by_id"
ON "risks"
FOR EACH ROW EXECUTE FUNCTION enforce_risk_tenant_users();

INSERT INTO "permissions" ("id", "code", "name")
VALUES
  (
    '20000000-0000-4000-8000-000000000005',
    'risk:read',
    'Read Company risks'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    'risk:write',
    'Create and update Company risks'
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
  AND permission."code" IN ('risk:read', 'risk:write')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
