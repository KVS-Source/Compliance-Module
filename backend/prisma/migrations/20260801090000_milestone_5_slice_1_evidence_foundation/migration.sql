BEGIN;

-- CreateEnum
CREATE TYPE "EvidenceLifecycleStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ARCHIVED'
);

-- CreateEnum
CREATE TYPE "EvidenceDecisionOutcome" AS ENUM (
  'APPROVED',
  'REJECTED'
);

-- AlterTable
ALTER TABLE "tenants"
  ADD COLUMN "next_evidence_number" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "lifecycle_status" "EvidenceLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" UUID,
    "department_id" UUID,
    "issue_date" DATE,
    "expires_at" DATE,
    "supersedes_evidence_id" UUID,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "original_file_name" TEXT,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "detected_mime_type" TEXT,
    "byte_size" INTEGER,
    "content_sha256" TEXT,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidence_byte_size_positive"
      CHECK ("byte_size" IS NULL OR "byte_size" > 0),
    CONSTRAINT "evidence_expires_after_issue"
      CHECK (
        "expires_at" IS NULL
        OR "issue_date" IS NULL
        OR "expires_at" >= "issue_date"
      ),
    CONSTRAINT "evidence_content_sha256_format"
      CHECK (
        "content_sha256" IS NULL
        OR "content_sha256" ~ '^[0-9a-f]{64}$'
      )
);

-- CreateTable
CREATE TABLE "evidence_control_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "link_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_control_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_checkpoint_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "link_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_checkpoint_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_review_decisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "acted_by_id" UUID NOT NULL,
    "decision" "EvidenceDecisionOutcome" NOT NULL,
    "reason" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_review_decisions_pkey" PRIMARY KEY ("id")
);

-- Unique indexes / constraints
CREATE UNIQUE INDEX "evidence_tenant_id_id_key"
  ON "evidence"("tenant_id", "id");
CREATE UNIQUE INDEX "evidence_tenant_id_code_key"
  ON "evidence"("tenant_id", "code");

CREATE UNIQUE INDEX "evidence_control_links_tenant_id_id_key"
  ON "evidence_control_links"("tenant_id", "id");
CREATE UNIQUE INDEX "evidence_control_links_tenant_evidence_control_key"
  ON "evidence_control_links"("tenant_id", "evidence_id", "control_id");

CREATE UNIQUE INDEX "evidence_checkpoint_links_tenant_id_id_key"
  ON "evidence_checkpoint_links"("tenant_id", "id");
CREATE UNIQUE INDEX "evidence_checkpoint_links_tenant_evidence_checkpoint_key"
  ON "evidence_checkpoint_links"("tenant_id", "evidence_id", "checkpoint_id");

CREATE UNIQUE INDEX "evidence_review_decisions_tenant_id_id_key"
  ON "evidence_review_decisions"("tenant_id", "id");

-- Supporting indexes
CREATE INDEX "evidence_tenant_id_lifecycle_status_created_at_idx"
  ON "evidence"("tenant_id", "lifecycle_status", "created_at");
CREATE INDEX "evidence_tenant_id_owner_id_idx"
  ON "evidence"("tenant_id", "owner_id");
CREATE INDEX "evidence_tenant_id_department_id_idx"
  ON "evidence"("tenant_id", "department_id");
CREATE INDEX "evidence_tenant_id_expires_at_idx"
  ON "evidence"("tenant_id", "expires_at");
CREATE INDEX "evidence_tenant_id_supersedes_evidence_id_idx"
  ON "evidence"("tenant_id", "supersedes_evidence_id");
CREATE INDEX "evidence_tenant_id_content_sha256_idx"
  ON "evidence"("tenant_id", "content_sha256");

CREATE INDEX "evidence_control_links_tenant_control_active_idx"
  ON "evidence_control_links"("tenant_id", "control_id", "is_active");
CREATE INDEX "evidence_control_links_tenant_evidence_active_idx"
  ON "evidence_control_links"("tenant_id", "evidence_id", "is_active");

CREATE INDEX "evidence_checkpoint_links_tenant_checkpoint_active_idx"
  ON "evidence_checkpoint_links"("tenant_id", "checkpoint_id", "is_active");
CREATE INDEX "evidence_checkpoint_links_tenant_evidence_active_idx"
  ON "evidence_checkpoint_links"("tenant_id", "evidence_id", "is_active");

CREATE INDEX "evidence_review_decisions_tenant_evidence_decided_idx"
  ON "evidence_review_decisions"("tenant_id", "evidence_id", "decided_at");
CREATE INDEX "evidence_review_decisions_tenant_actor_decided_idx"
  ON "evidence_review_decisions"("tenant_id", "acted_by_id", "decided_at");

-- Foreign keys: evidence
ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_tenant_id_department_id_fkey"
  FOREIGN KEY ("tenant_id", "department_id")
  REFERENCES "org_departments"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_tenant_id_supersedes_evidence_id_fkey"
  FOREIGN KEY ("tenant_id", "supersedes_evidence_id")
  REFERENCES "evidence"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: evidence_control_links
ALTER TABLE "evidence_control_links"
  ADD CONSTRAINT "evidence_control_links_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_control_links"
  ADD CONSTRAINT "evidence_control_links_tenant_id_evidence_id_fkey"
  FOREIGN KEY ("tenant_id", "evidence_id")
  REFERENCES "evidence"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_control_links"
  ADD CONSTRAINT "evidence_control_links_tenant_id_control_id_fkey"
  FOREIGN KEY ("tenant_id", "control_id")
  REFERENCES "controls"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_control_links"
  ADD CONSTRAINT "evidence_control_links_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_control_links"
  ADD CONSTRAINT "evidence_control_links_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: evidence_checkpoint_links
ALTER TABLE "evidence_checkpoint_links"
  ADD CONSTRAINT "evidence_checkpoint_links_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_checkpoint_links"
  ADD CONSTRAINT "evidence_checkpoint_links_tenant_id_evidence_id_fkey"
  FOREIGN KEY ("tenant_id", "evidence_id")
  REFERENCES "evidence"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_checkpoint_links"
  ADD CONSTRAINT "evidence_checkpoint_links_tenant_id_checkpoint_id_fkey"
  FOREIGN KEY ("tenant_id", "checkpoint_id")
  REFERENCES "checkpoints"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_checkpoint_links"
  ADD CONSTRAINT "evidence_checkpoint_links_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_checkpoint_links"
  ADD CONSTRAINT "evidence_checkpoint_links_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: evidence_review_decisions
ALTER TABLE "evidence_review_decisions"
  ADD CONSTRAINT "evidence_review_decisions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_review_decisions"
  ADD CONSTRAINT "evidence_review_decisions_tenant_id_evidence_id_fkey"
  FOREIGN KEY ("tenant_id", "evidence_id")
  REFERENCES "evidence"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_review_decisions"
  ADD CONSTRAINT "evidence_review_decisions_acted_by_id_fkey"
  FOREIGN KEY ("acted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only Review decisions (reuse governance append-only function when present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'prevent_append_only_governance_mutation'
  ) THEN
    CREATE FUNCTION prevent_append_only_governance_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
    END;
    $fn$;
  END IF;
END $$;

CREATE TRIGGER "evidence_review_decisions_append_only"
BEFORE UPDATE OR DELETE ON "evidence_review_decisions"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_governance_mutation();

COMMIT;
