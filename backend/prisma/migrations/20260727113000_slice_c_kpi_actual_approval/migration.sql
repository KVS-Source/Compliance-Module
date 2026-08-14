BEGIN;

CREATE TYPE "ApprovalDecision" AS ENUM (
  'APPROVED',
  'REJECTED',
  'RESUBMITTED'
);

-- Slice B/D rows remain in SUBMITTED state. No approval decision is inferred
-- or backfilled for historical compliance data.
CREATE TABLE "kpi_approvals" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "kpi_actual_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "decision" "ApprovalDecision" NOT NULL,
  "comments" TEXT,
  "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kpi_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_approvals_system_reviewer_valid"
    CHECK ("reviewer_id" IS NOT NULL OR "decision" = 'APPROVED')
);

CREATE UNIQUE INDEX "kpi_approvals_tenant_id_id_key"
  ON "kpi_approvals"("tenant_id", "id");
CREATE INDEX "kpi_approvals_tenant_id_kpi_actual_id_decided_at_idx"
  ON "kpi_approvals"("tenant_id", "kpi_actual_id", "decided_at");
CREATE INDEX "kpi_approvals_tenant_id_reviewer_id_decided_at_idx"
  ON "kpi_approvals"("tenant_id", "reviewer_id", "decided_at");

ALTER TABLE "kpi_approvals"
  ADD CONSTRAINT "kpi_approvals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_approvals_tenant_actual_fkey"
  FOREIGN KEY ("tenant_id", "kpi_actual_id")
  REFERENCES "kpi_actuals"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "kpi_approvals_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "kpi_actuals"
    WHERE "approved_by_id" IS NOT NULL
      AND "approved_by_id" = "submitted_by_id"
  ) THEN
    RAISE EXCEPTION
      'KPI actual self-approval rows require manual review before migration';
  END IF;
END;
$$;

ALTER TABLE "kpi_actuals"
  ADD CONSTRAINT "kpi_actuals_no_self_approval"
    CHECK (
      "approved_by_id" IS NULL
      OR "approved_by_id" <> "submitted_by_id"
    ),
  ADD CONSTRAINT "kpi_actuals_approval_state_consistent"
    CHECK (
      (
        "approval_status" = 'APPROVED'
        AND "approved_at" IS NOT NULL
        AND "rejection_reason" IS NULL
      )
      OR (
        "approval_status" = 'REJECTED'
        AND "approved_by_id" IS NULL
        AND "approved_at" IS NULL
        AND "rejection_reason" IS NOT NULL
      )
      OR (
        "approval_status" IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL')
        AND "approved_by_id" IS NULL
        AND "approved_at" IS NULL
        AND "rejection_reason" IS NULL
      )
    );

CREATE OR REPLACE FUNCTION enforce_kpi_approval_reviewer_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."reviewer_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS app_user ON app_user."id" = membership."user_id"
    JOIN "tenants" AS tenant ON tenant."id" = membership."tenant_id"
    WHERE membership."tenant_id" = NEW."tenant_id"
      AND membership."user_id" = NEW."reviewer_id"
      AND membership."status" = 'ACTIVE'
      AND app_user."status" = 'ACTIVE'
      AND tenant."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION
      'KPI approval reviewer must be an active Company member';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_approvals_reviewer_membership"
BEFORE INSERT ON "kpi_approvals"
FOR EACH ROW EXECUTE FUNCTION enforce_kpi_approval_reviewer_membership();

CREATE OR REPLACE FUNCTION prevent_kpi_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kpi_approvals are append-only';
END;
$$;

CREATE TRIGGER "kpi_approvals_append_only"
BEFORE UPDATE OR DELETE ON "kpi_approvals"
FOR EACH ROW EXECUTE FUNCTION prevent_kpi_approval_mutation();

INSERT INTO "permissions" ("id", "code", "name")
VALUES (
  '20000000-0000-4000-8000-000000000007',
  'kpi-actual:approve',
  'Approve and reject Company KPI actuals'
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
  AND permission."code" = 'kpi-actual:approve'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
