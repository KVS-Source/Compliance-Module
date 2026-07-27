-- Slice E: risk review, treatment and closure.
--
-- RiskReview and RiskTreatment are append-only history tables, not mutable
-- fields on risks. The same reasoning as kpi_approvals applies: a compliance
-- product needs the whole decision trail, and the guarantee is only worth
-- having if the database enforces it.
--
-- Treatment rows are immutable. Completing a treatment inserts a new COMPLETED
-- row that supersedes the original, so the current treatment is the latest
-- row. See docs/claude-tasks/02-kpi-risk-schema.md section 3.7.

BEGIN;

CREATE TYPE "RiskTreatmentStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

-- Slice D deferred the residual equality check. All-or-none matches the KPI
-- lineage constraint already on this table: a residual likelihood without an
-- impact is not a meaningful assessment.
ALTER TABLE "risks"
  ADD CONSTRAINT "risks_residual_score_consistent"
  CHECK (
    (
      "residual_likelihood" IS NULL
      AND "residual_impact" IS NULL
      AND "residual_score" IS NULL
    )
    OR (
      "residual_likelihood" IS NOT NULL
      AND "residual_impact" IS NOT NULL
      AND "residual_score" = "residual_likelihood" * "residual_impact"
    )
  );

CREATE TABLE "risk_reviews" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "risk_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "comments" TEXT NOT NULL,
  "likelihood_at_review" INTEGER,
  "impact_at_review" INTEGER,
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "risk_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_reviews_comments_present"
    CHECK (length(btrim("comments")) > 0),
  CONSTRAINT "risk_reviews_likelihood_valid"
    CHECK (
      "likelihood_at_review" IS NULL
      OR "likelihood_at_review" BETWEEN 1 AND 5
    ),
  CONSTRAINT "risk_reviews_impact_valid"
    CHECK (
      "impact_at_review" IS NULL
      OR "impact_at_review" BETWEEN 1 AND 5
    ),
  -- A revised assessment needs both dimensions or neither, mirroring the
  -- all-or-none residual rule on risks.
  CONSTRAINT "risk_reviews_assessment_all_or_none"
    CHECK (
      (
        "likelihood_at_review" IS NULL
        AND "impact_at_review" IS NULL
      )
      OR (
        "likelihood_at_review" IS NOT NULL
        AND "impact_at_review" IS NOT NULL
      )
    )
);

CREATE TABLE "risk_treatments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "risk_id" UUID NOT NULL,
  "strategy" "RiskTreatmentStrategy" NOT NULL,
  "plan" TEXT NOT NULL,
  "owner_id" UUID,
  "due_date" DATE,
  "completed_at" TIMESTAMPTZ(6),
  "status" "RiskTreatmentStatus" NOT NULL DEFAULT 'PLANNED',
  "effectiveness_notes" TEXT,
  "supersedes_id" UUID,
  "recorded_by_id" UUID NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "risk_treatments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_treatments_plan_present"
    CHECK (length(btrim("plan")) > 0),
  CONSTRAINT "risk_treatments_completion_consistent"
    CHECK (
      ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
      OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
    ),
  CONSTRAINT "risk_treatments_no_self_supersede"
    CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id")
);

CREATE UNIQUE INDEX "risk_reviews_tenant_id_id_key"
  ON "risk_reviews"("tenant_id", "id");
CREATE INDEX "risk_reviews_tenant_risk_reviewed_idx"
  ON "risk_reviews"("tenant_id", "risk_id", "reviewed_at");
CREATE INDEX "risk_reviews_tenant_reviewer_reviewed_idx"
  ON "risk_reviews"("tenant_id", "reviewer_id", "reviewed_at");

CREATE UNIQUE INDEX "risk_treatments_tenant_id_id_key"
  ON "risk_treatments"("tenant_id", "id");
CREATE INDEX "risk_treatments_tenant_risk_recorded_idx"
  ON "risk_treatments"("tenant_id", "risk_id", "recorded_at");
CREATE INDEX "risk_treatments_tenant_owner_status_idx"
  ON "risk_treatments"("tenant_id", "owner_id", "status");

ALTER TABLE "risk_reviews"
  ADD CONSTRAINT "risk_reviews_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_reviews"
  ADD CONSTRAINT "risk_reviews_tenant_id_risk_id_fkey"
  FOREIGN KEY ("tenant_id", "risk_id") REFERENCES "risks"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_reviews"
  ADD CONSTRAINT "risk_reviews_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "risk_treatments"
  ADD CONSTRAINT "risk_treatments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_treatments"
  ADD CONSTRAINT "risk_treatments_tenant_id_risk_id_fkey"
  FOREIGN KEY ("tenant_id", "risk_id") REFERENCES "risks"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_treatments"
  ADD CONSTRAINT "risk_treatments_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_treatments"
  ADD CONSTRAINT "risk_treatments_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_treatments"
  ADD CONSTRAINT "risk_treatments_tenant_id_supersedes_id_fkey"
  FOREIGN KEY ("tenant_id", "supersedes_id")
  REFERENCES "risk_treatments"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A reviewer or treatment owner must hold active membership of the same
-- Company as the risk, so cross-tenant people cannot be attached.
CREATE OR REPLACE FUNCTION enforce_risk_review_reviewer_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."reviewer_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "user_companies" membership
    WHERE membership."user_id" = NEW."reviewer_id"
      AND membership."tenant_id" = NEW."tenant_id"
      AND membership."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION
      'risk review reviewer must be an active member of the risk Company';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "risk_reviews_reviewer_membership"
BEFORE INSERT ON "risk_reviews"
FOR EACH ROW EXECUTE FUNCTION enforce_risk_review_reviewer_membership();

CREATE OR REPLACE FUNCTION enforce_risk_treatment_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."owner_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "user_companies" membership
    WHERE membership."user_id" = NEW."owner_id"
      AND membership."tenant_id" = NEW."tenant_id"
      AND membership."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION
      'risk treatment owner must be an active member of the risk Company';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "user_companies" membership
    WHERE membership."user_id" = NEW."recorded_by_id"
      AND membership."tenant_id" = NEW."tenant_id"
      AND membership."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION
      'risk treatment recorder must be an active member of the risk Company';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "risk_treatments_owner_membership"
BEFORE INSERT ON "risk_treatments"
FOR EACH ROW EXECUTE FUNCTION enforce_risk_treatment_owner_membership();

-- Append-only ledgers, mirroring prevent_kpi_approval_mutation.
CREATE OR REPLACE FUNCTION prevent_risk_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'risk_reviews are append-only';
END;
$$;

CREATE TRIGGER "risk_reviews_append_only"
BEFORE UPDATE OR DELETE ON "risk_reviews"
FOR EACH ROW EXECUTE FUNCTION prevent_risk_review_mutation();

CREATE OR REPLACE FUNCTION prevent_risk_treatment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'risk_treatments are append-only';
END;
$$;

CREATE TRIGGER "risk_treatments_append_only"
BEFORE UPDATE OR DELETE ON "risk_treatments"
FOR EACH ROW EXECUTE FUNCTION prevent_risk_treatment_mutation();

INSERT INTO "permissions" ("id", "code", "name")
VALUES
  (
    '20000000-0000-4000-8000-000000000008',
    'risk:treat',
    'Review, treat and assign Company risks'
  ),
  (
    '20000000-0000-4000-8000-000000000009',
    'risk:close',
    'Close and reopen Company risks'
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
  AND permission."code" IN ('risk:treat', 'risk:close')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
