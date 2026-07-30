BEGIN;

-- CreateEnum
CREATE TYPE "GovernanceRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PolicyVersionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "ControlImplementationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PARTIALLY_IMPLEMENTED', 'IMPLEMENTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('PREVENTIVE', 'DETECTIVE', 'CORRECTIVE', 'DIRECTIVE');

-- CreateEnum
CREATE TYPE "CheckpointOutcome" AS ENUM ('PASS', 'PARTIAL', 'FAIL', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "next_checkpoint_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_control_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_policy_number" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" UUID,
    "department_id" UUID,
    "lifecycle_status" "GovernanceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_approved_version_id" UUID,
    "next_version_sequence" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "version_major" INTEGER NOT NULL,
    "version_minor" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "purpose" TEXT,
    "scope" TEXT,
    "change_summary" TEXT,
    "status" "PolicyVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE,
    "review_date" DATE,
    "requires_evidence" BOOLEAN NOT NULL DEFAULT false,
    "requested_approver_id" UUID,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "superseded_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_frameworks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "acted_by_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controls" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT NOT NULL,
    "owner_id" UUID,
    "department_id" UUID,
    "implementation_status" "ControlImplementationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "implementation_notes" TEXT,
    "control_type" "ControlType" NOT NULL,
    "frequency" "KpiFrequency" NOT NULL,
    "verification_method" TEXT NOT NULL,
    "requires_evidence" BOOLEAN NOT NULL DEFAULT false,
    "lifecycle_status" "GovernanceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_review_date" DATE,
    "next_review_date" DATE,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_policy_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "control_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_frameworks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "control_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_controls" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "framework_rule_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rule_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "verification_frequency" "KpiFrequency" NOT NULL,
    "owner_id" UUID,
    "department_id" UUID,
    "expected_result" TEXT NOT NULL,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "lifecycle_status" "GovernanceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "initial_review_date" DATE,
    "next_review_date" DATE,
    "latest_review_id" UUID,
    "last_reviewed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "review_period" VARCHAR(48) NOT NULL,
    "review_date" DATE NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "outcome" "CheckpointOutcome" NOT NULL,
    "observation" TEXT,
    "recommendation" TEXT,
    "next_review_date" DATE,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoint_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_tenant_id_lifecycle_status_archived_at_idx" ON "policies"("tenant_id", "lifecycle_status", "archived_at");

-- CreateIndex
CREATE INDEX "policies_tenant_id_owner_id_idx" ON "policies"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "policies_tenant_id_department_id_idx" ON "policies"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "policies_current_approved_version_id_idx" ON "policies"("current_approved_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_tenant_id_id_key" ON "policies"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_tenant_id_id_current_approved_version_id_key" ON "policies"("tenant_id", "id", "current_approved_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_tenant_id_code_key" ON "policies"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "policy_versions_tenant_id_policy_id_status_sequence_idx" ON "policy_versions"("tenant_id", "policy_id", "status", "sequence");

-- CreateIndex
CREATE INDEX "policy_versions_requested_approver_id_idx" ON "policy_versions"("requested_approver_id");

-- CreateIndex
CREATE INDEX "policy_versions_submitted_by_id_idx" ON "policy_versions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "policy_versions_approved_by_id_idx" ON "policy_versions"("approved_by_id");

-- CreateIndex
CREATE INDEX "policy_versions_superseded_by_id_idx" ON "policy_versions"("superseded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_id_key" ON "policy_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_policy_id_id_key" ON "policy_versions"("tenant_id", "policy_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_policy_id_sequence_key" ON "policy_versions"("tenant_id", "policy_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_policy_id_version_major_version_m_key" ON "policy_versions"("tenant_id", "policy_id", "version_major", "version_minor");

-- CreateIndex
CREATE INDEX "policy_frameworks_tenant_id_policy_id_policy_version_id_is__idx" ON "policy_frameworks"("tenant_id", "policy_id", "policy_version_id", "is_active");

-- CreateIndex
CREATE INDEX "policy_frameworks_framework_id_is_active_idx" ON "policy_frameworks"("framework_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "policy_frameworks_tenant_id_id_key" ON "policy_frameworks"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_frameworks_tenant_id_policy_version_id_framework_id_key" ON "policy_frameworks"("tenant_id", "policy_version_id", "framework_id");

-- CreateIndex
CREATE INDEX "policy_approvals_tenant_id_policy_version_id_decided_at_idx" ON "policy_approvals"("tenant_id", "policy_version_id", "decided_at");

-- CreateIndex
CREATE INDEX "policy_approvals_tenant_id_acted_by_id_decided_at_idx" ON "policy_approvals"("tenant_id", "acted_by_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "policy_approvals_tenant_id_id_key" ON "policy_approvals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "controls_tenant_id_lifecycle_status_implementation_status_idx" ON "controls"("tenant_id", "lifecycle_status", "implementation_status");

-- CreateIndex
CREATE INDEX "controls_tenant_id_owner_id_idx" ON "controls"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "controls_tenant_id_department_id_idx" ON "controls"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "controls_tenant_id_next_review_date_idx" ON "controls"("tenant_id", "next_review_date");

-- CreateIndex
CREATE UNIQUE INDEX "controls_tenant_id_id_key" ON "controls"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "controls_tenant_id_code_key" ON "controls"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "control_policy_versions_tenant_id_control_id_is_active_idx" ON "control_policy_versions"("tenant_id", "control_id", "is_active");

-- CreateIndex
CREATE INDEX "control_policy_versions_tenant_id_policy_id_policy_version__idx" ON "control_policy_versions"("tenant_id", "policy_id", "policy_version_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "control_policy_versions_tenant_id_id_key" ON "control_policy_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "control_policy_versions_one_active_mapping"
ON "control_policy_versions"("tenant_id", "control_id", "policy_id")
WHERE "is_active";

-- CreateIndex
CREATE INDEX "control_frameworks_tenant_id_control_id_is_active_idx" ON "control_frameworks"("tenant_id", "control_id", "is_active");

-- CreateIndex
CREATE INDEX "control_frameworks_framework_id_is_active_idx" ON "control_frameworks"("framework_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "control_frameworks_tenant_id_id_key" ON "control_frameworks"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "control_frameworks_tenant_id_control_id_framework_id_key" ON "control_frameworks"("tenant_id", "control_id", "framework_id");

-- CreateIndex
CREATE INDEX "rule_controls_tenant_id_control_id_framework_id_is_active_idx" ON "rule_controls"("tenant_id", "control_id", "framework_id", "is_active");

-- CreateIndex
CREATE INDEX "rule_controls_framework_id_framework_rule_id_is_active_idx" ON "rule_controls"("framework_id", "framework_rule_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rule_controls_tenant_id_id_key" ON "rule_controls"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_controls_tenant_id_control_id_framework_rule_id_key" ON "rule_controls"("tenant_id", "control_id", "framework_rule_id");

-- CreateIndex
CREATE INDEX "checkpoints_tenant_id_control_id_lifecycle_status_idx" ON "checkpoints"("tenant_id", "control_id", "lifecycle_status");

-- CreateIndex
CREATE INDEX "checkpoints_tenant_id_owner_id_idx" ON "checkpoints"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "checkpoints_tenant_id_department_id_idx" ON "checkpoints"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "checkpoints_tenant_id_next_review_date_idx" ON "checkpoints"("tenant_id", "next_review_date");

-- CreateIndex
CREATE INDEX "checkpoints_latest_review_id_idx" ON "checkpoints"("latest_review_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_tenant_id_id_key" ON "checkpoints"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_tenant_id_id_latest_review_id_key" ON "checkpoints"("tenant_id", "id", "latest_review_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_tenant_id_code_key" ON "checkpoints"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "checkpoint_reviews_tenant_id_checkpoint_id_review_date_idx" ON "checkpoint_reviews"("tenant_id", "checkpoint_id", "review_date");

-- CreateIndex
CREATE INDEX "checkpoint_reviews_tenant_id_reviewer_id_submitted_at_idx" ON "checkpoint_reviews"("tenant_id", "reviewer_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_reviews_tenant_id_id_key" ON "checkpoint_reviews"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_reviews_tenant_id_checkpoint_id_id_key" ON "checkpoint_reviews"("tenant_id", "checkpoint_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_reviews_tenant_id_checkpoint_id_review_period_key" ON "checkpoint_reviews"("tenant_id", "checkpoint_id", "review_period");

-- CreateIndex
CREATE UNIQUE INDEX "framework_rules_framework_id_id_key" ON "framework_rules"("framework_id", "id");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_id_current_approved_version_id_fkey" FOREIGN KEY ("tenant_id", "id", "current_approved_version_id") REFERENCES "policy_versions"("tenant_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_tenant_id_policy_id_fkey" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "policies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_requested_approver_id_fkey" FOREIGN KEY ("requested_approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_tenant_id_policy_id_superseded_by_id_fkey" FOREIGN KEY ("tenant_id", "policy_id", "superseded_by_id") REFERENCES "policy_versions"("tenant_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_frameworks" ADD CONSTRAINT "policy_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_frameworks" ADD CONSTRAINT "policy_frameworks_tenant_id_policy_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_frameworks" ADD CONSTRAINT "policy_frameworks_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_frameworks" ADD CONSTRAINT "policy_frameworks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_frameworks" ADD CONSTRAINT "policy_frameworks_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_tenant_id_policy_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_acted_by_id_fkey" FOREIGN KEY ("acted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_policy_versions" ADD CONSTRAINT "control_policy_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_policy_versions" ADD CONSTRAINT "control_policy_versions_tenant_id_control_id_fkey" FOREIGN KEY ("tenant_id", "control_id") REFERENCES "controls"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_policy_versions" ADD CONSTRAINT "control_policy_versions_tenant_id_policy_id_policy_version_fkey" FOREIGN KEY ("tenant_id", "policy_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "policy_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_policy_versions" ADD CONSTRAINT "control_policy_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_policy_versions" ADD CONSTRAINT "control_policy_versions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_frameworks" ADD CONSTRAINT "control_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_frameworks" ADD CONSTRAINT "control_frameworks_tenant_id_control_id_fkey" FOREIGN KEY ("tenant_id", "control_id") REFERENCES "controls"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_frameworks" ADD CONSTRAINT "control_frameworks_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_frameworks" ADD CONSTRAINT "control_frameworks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_frameworks" ADD CONSTRAINT "control_frameworks_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_controls" ADD CONSTRAINT "rule_controls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_controls" ADD CONSTRAINT "rule_controls_tenant_id_control_id_framework_id_fkey" FOREIGN KEY ("tenant_id", "control_id", "framework_id") REFERENCES "control_frameworks"("tenant_id", "control_id", "framework_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_controls" ADD CONSTRAINT "rule_controls_framework_id_framework_rule_id_fkey" FOREIGN KEY ("framework_id", "framework_rule_id") REFERENCES "framework_rules"("framework_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_controls" ADD CONSTRAINT "rule_controls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_controls" ADD CONSTRAINT "rule_controls_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_tenant_id_control_id_fkey" FOREIGN KEY ("tenant_id", "control_id") REFERENCES "controls"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_tenant_id_id_latest_review_id_fkey" FOREIGN KEY ("tenant_id", "id", "latest_review_id") REFERENCES "checkpoint_reviews"("tenant_id", "checkpoint_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_reviews" ADD CONSTRAINT "checkpoint_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_reviews" ADD CONSTRAINT "checkpoint_reviews_tenant_id_checkpoint_id_fkey" FOREIGN KEY ("tenant_id", "checkpoint_id") REFERENCES "checkpoints"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_reviews" ADD CONSTRAINT "checkpoint_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_governance_counters_positive"
  CHECK (
    "next_policy_number" > 0
    AND "next_control_number" > 0
    AND "next_checkpoint_number" > 0
  );

ALTER TABLE "policies"
  ADD CONSTRAINT "policies_code_format"
  CHECK ("code" ~ '^[A-Z][A-Z0-9-]{2,79}$'),
  ADD CONSTRAINT "policies_title_not_blank"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 300),
  ADD CONSTRAINT "policies_version_sequence_positive"
  CHECK ("next_version_sequence" > 0),
  ADD CONSTRAINT "policies_archive_state_consistent"
  CHECK (("lifecycle_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));

ALTER TABLE "policy_versions"
  ADD CONSTRAINT "policy_versions_numbers_valid"
  CHECK ("sequence" > 0 AND "version_major" >= 1 AND "version_minor" >= 0),
  ADD CONSTRAINT "policy_versions_content_bounded_plain_text"
  CHECK (
    char_length(btrim("content")) BETWEEN 1 AND 100000
    AND "content" !~* '<[[:space:]]*/?[[:space:]]*[a-z][^>]*>'
    AND "content" !~ '<[[:space:]]*[!?][^>]*>'
  ),
  ADD CONSTRAINT "policy_versions_dates_valid"
  CHECK (
    ("effective_date" IS NULL AND "review_date" IS NULL)
    OR (
      "effective_date" IS NOT NULL
      AND "review_date" IS NOT NULL
      AND "review_date" > "effective_date"
    )
  ),
  ADD CONSTRAINT "policy_versions_submission_fields_consistent"
  CHECK (
    (
      "status" = 'DRAFT'
      AND "submitted_by_id" IS NULL
      AND "submitted_at" IS NULL
      AND "approved_by_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" IN ('SUBMITTED', 'REJECTED')
      AND "submitted_by_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" IN ('APPROVED', 'SUPERSEDED', 'OBSOLETE')
      AND "submitted_by_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_id" IS NOT NULL
      AND "approved_at" IS NOT NULL
      AND "effective_date" IS NOT NULL
      AND "review_date" IS NOT NULL
      AND "effective_date" <= CURRENT_DATE
      AND NOT "requires_evidence"
      AND "submitted_by_id" <> "approved_by_id"
    )
  ),
  ADD CONSTRAINT "policy_versions_supersession_consistent"
  CHECK (("status" = 'SUPERSEDED') = ("superseded_by_id" IS NOT NULL));

ALTER TABLE "policy_approvals"
  ADD CONSTRAINT "policy_approvals_decisions_only"
  CHECK ("decision" IN ('APPROVED', 'REJECTED')),
  ADD CONSTRAINT "policy_approvals_rejection_comments_required"
  CHECK (
    "decision" <> 'REJECTED'
    OR char_length(btrim(COALESCE("comments", ''))) BETWEEN 2 AND 2000
  );

ALTER TABLE "controls"
  ADD CONSTRAINT "controls_code_format"
  CHECK ("code" ~ '^[A-Z][A-Z0-9-]{2,79}$'),
  ADD CONSTRAINT "controls_required_text_not_blank"
  CHECK (
    char_length(btrim("title")) BETWEEN 1 AND 300
    AND char_length(btrim("objective")) BETWEEN 1 AND 5000
    AND char_length(btrim("verification_method")) BETWEEN 1 AND 5000
  ),
  ADD CONSTRAINT "controls_not_applicable_notes_required"
  CHECK (
    "implementation_status" <> 'NOT_APPLICABLE'
    OR char_length(btrim(COALESCE("implementation_notes", ''))) BETWEEN 2 AND 5000
  ),
  ADD CONSTRAINT "controls_review_dates_valid"
  CHECK (
    "last_review_date" IS NULL
    OR "next_review_date" IS NULL
    OR "next_review_date" > "last_review_date"
  ),
  ADD CONSTRAINT "controls_archive_state_consistent"
  CHECK (("lifecycle_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));

ALTER TABLE "checkpoints"
  ADD CONSTRAINT "checkpoints_code_format"
  CHECK ("code" ~ '^[A-Z][A-Z0-9-]{2,79}$'),
  ADD CONSTRAINT "checkpoints_required_text_not_blank"
  CHECK (
    char_length(btrim("title")) BETWEEN 1 AND 300
    AND char_length(btrim("expected_result")) BETWEEN 1 AND 5000
  ),
  ADD CONSTRAINT "checkpoints_archive_state_consistent"
  CHECK (("lifecycle_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));

ALTER TABLE "checkpoint_reviews"
  ADD CONSTRAINT "checkpoint_reviews_observation_required"
  CHECK (
    "outcome" NOT IN ('PARTIAL', 'FAIL')
    OR char_length(btrim(COALESCE("observation", ''))) BETWEEN 2 AND 10000
  ),
  ADD CONSTRAINT "checkpoint_reviews_next_date_valid"
  CHECK ("next_review_date" IS NULL OR "next_review_date" > "review_date");

CREATE UNIQUE INDEX "policy_versions_one_current_approved"
ON "policy_versions" ("tenant_id", "policy_id")
WHERE "status" = 'APPROVED';

-- Tenant actor membership
CREATE OR REPLACE FUNCTION require_active_governance_member(
  p_tenant_id UUID,
  p_user_id UUID,
  p_field_name TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "user_companies" AS membership
    JOIN "users" AS member_user ON member_user."id" = membership."user_id"
    JOIN "tenants" AS member_tenant ON member_tenant."id" = membership."tenant_id"
    WHERE membership."tenant_id" = p_tenant_id
      AND membership."user_id" = p_user_id
      AND membership."status" = 'ACTIVE'
      AND member_user."status" = 'ACTIVE'
      AND member_tenant."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION '% must be an active member of the record Company', p_field_name
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_governance_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_fields TEXT[];
  actor_field TEXT;
  actor_value UUID;
  new_record JSONB := to_jsonb(NEW);
  old_record JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_record := to_jsonb(OLD);
    IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
      RAISE EXCEPTION 'governance record Company ownership is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  actor_fields := CASE TG_TABLE_NAME
    WHEN 'policies' THEN ARRAY['owner_id', 'created_by_id', 'updated_by_id']
    WHEN 'policy_versions' THEN ARRAY[
      'requested_approver_id',
      'submitted_by_id',
      'approved_by_id',
      'created_by_id',
      'updated_by_id'
    ]
    WHEN 'policy_frameworks' THEN ARRAY['created_by_id', 'updated_by_id']
    WHEN 'policy_approvals' THEN ARRAY['acted_by_id']
    WHEN 'controls' THEN ARRAY['owner_id', 'created_by_id', 'updated_by_id']
    WHEN 'control_policy_versions' THEN ARRAY['created_by_id', 'updated_by_id']
    WHEN 'control_frameworks' THEN ARRAY['created_by_id', 'updated_by_id']
    WHEN 'rule_controls' THEN ARRAY['created_by_id', 'updated_by_id']
    WHEN 'checkpoints' THEN ARRAY['owner_id', 'created_by_id', 'updated_by_id']
    WHEN 'checkpoint_reviews' THEN ARRAY['reviewer_id']
    ELSE ARRAY[]::TEXT[]
  END;

  FOREACH actor_field IN ARRAY actor_fields LOOP
    IF TG_OP = 'INSERT'
      OR (new_record -> actor_field) IS DISTINCT FROM (old_record -> actor_field)
    THEN
      actor_value := NULLIF(new_record ->> actor_field, '')::UUID;
      IF actor_value IS NOT NULL THEN
        PERFORM require_active_governance_member(
          NEW."tenant_id",
          actor_value,
          actor_field
        );
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "policies_actor_membership"
BEFORE INSERT OR UPDATE ON "policies"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "policy_versions_actor_membership"
BEFORE INSERT OR UPDATE ON "policy_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "policy_frameworks_actor_membership"
BEFORE INSERT OR UPDATE ON "policy_frameworks"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "policy_approvals_actor_membership"
BEFORE INSERT ON "policy_approvals"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "controls_actor_membership"
BEFORE INSERT OR UPDATE ON "controls"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "control_policy_versions_actor_membership"
BEFORE INSERT OR UPDATE ON "control_policy_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "control_frameworks_actor_membership"
BEFORE INSERT OR UPDATE ON "control_frameworks"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "rule_controls_actor_membership"
BEFORE INSERT OR UPDATE ON "rule_controls"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "checkpoints_actor_membership"
BEFORE INSERT OR UPDATE ON "checkpoints"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

CREATE TRIGGER "checkpoint_reviews_actor_membership"
BEFORE INSERT ON "checkpoint_reviews"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_actor_membership();

-- Policy lifecycle, approval and immutable lineage
CREATE OR REPLACE FUNCTION enforce_policy_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'policy versions cannot be physically deleted';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'policy versions must be created in DRAFT';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."policy_id" IS DISTINCT FROM OLD."policy_id"
      OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
      OR NEW."version_major" IS DISTINCT FROM OLD."version_major"
      OR NEW."version_minor" IS DISTINCT FROM OLD."version_minor"
    THEN
      RAISE EXCEPTION 'Policy Version identity and numbering are immutable';
    END IF;
    IF OLD."status" = 'DRAFT'
      AND NEW."status" NOT IN ('DRAFT', 'SUBMITTED')
    THEN
      RAISE EXCEPTION 'invalid Policy Version transition from DRAFT';
    ELSIF OLD."status" = 'REJECTED'
      AND NEW."status" NOT IN ('REJECTED', 'SUBMITTED')
    THEN
      RAISE EXCEPTION 'invalid Policy Version transition from REJECTED';
    ELSIF OLD."status" = 'SUBMITTED' THEN
      IF NEW."status" NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'invalid Policy Version transition from SUBMITTED';
      END IF;
      IF (
        to_jsonb(NEW) - ARRAY[
          'status',
          'approved_by_id',
          'approved_at',
          'updated_by_id',
          'updated_at'
        ]
      ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY[
          'status',
          'approved_by_id',
          'approved_at',
          'updated_by_id',
          'updated_at'
        ]
      ) THEN
        RAISE EXCEPTION 'submitted Policy Version content and lineage are immutable';
      END IF;
    ELSIF OLD."status" = 'APPROVED' THEN
      IF NEW."status" NOT IN ('SUPERSEDED', 'OBSOLETE') THEN
        RAISE EXCEPTION 'approved Policy Versions are immutable';
      END IF;
      IF (
        to_jsonb(NEW) - ARRAY[
          'status',
          'superseded_by_id',
          'updated_by_id',
          'updated_at'
        ]
      ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY[
          'status',
          'superseded_by_id',
          'updated_by_id',
          'updated_at'
        ]
      ) THEN
        RAISE EXCEPTION 'approved Policy Versions are immutable';
      END IF;
      IF NEW."status" = 'SUPERSEDED' AND NEW."superseded_by_id" IS NULL THEN
        RAISE EXCEPTION 'a superseded Policy Version requires its successor';
      END IF;
      IF NEW."status" = 'OBSOLETE' AND NEW."superseded_by_id" IS NOT NULL THEN
        RAISE EXCEPTION 'an obsolete Policy Version cannot name a successor';
      END IF;
    ELSIF OLD."status" IN ('SUPERSEDED', 'OBSOLETE') THEN
      RAISE EXCEPTION 'historical Policy Versions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "policy_versions_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "policy_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_policy_version_lifecycle();

CREATE OR REPLACE FUNCTION enforce_policy_framework_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "PolicyVersionStatus";
BEGIN
  SELECT "status"
  INTO version_status
  FROM "policy_versions"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "policy_id" = NEW."policy_id"
    AND "id" = NEW."policy_version_id";

  IF version_status IS NULL THEN
    RAISE EXCEPTION 'Policy Version lineage is invalid';
  END IF;
  IF version_status NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Policy Framework lineage is immutable after submission';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "policy_frameworks_lineage_immutable"
BEFORE INSERT OR UPDATE ON "policy_frameworks"
FOR EACH ROW EXECUTE FUNCTION enforce_policy_framework_lineage();

CREATE OR REPLACE FUNCTION prevent_append_only_governance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "policy_approvals_append_only"
BEFORE UPDATE OR DELETE ON "policy_approvals"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_governance_mutation();

CREATE TRIGGER "checkpoint_reviews_append_only"
BEFORE UPDATE OR DELETE ON "checkpoint_reviews"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_governance_mutation();

CREATE OR REPLACE FUNCTION enforce_policy_approval_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "PolicyVersionStatus";
  submitter_id UUID;
BEGIN
  SELECT "status", "submitted_by_id"
  INTO version_status, submitter_id
  FROM "policy_versions"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "policy_id" = NEW."policy_id"
    AND "id" = NEW."policy_version_id";

  IF submitter_id IS NULL THEN
    RAISE EXCEPTION 'Policy Version has not been submitted';
  END IF;
  IF submitter_id = NEW."acted_by_id" THEN
    RAISE EXCEPTION 'Policy Version self-approval is prohibited';
  END IF;
  IF NEW."decision" = 'APPROVED' AND version_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'approval decision requires an APPROVED Policy Version';
  END IF;
  IF NEW."decision" = 'REJECTED' AND version_status <> 'REJECTED' THEN
    RAISE EXCEPTION 'rejection decision requires a REJECTED Policy Version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "policy_approvals_decision_guard"
BEFORE INSERT ON "policy_approvals"
FOR EACH ROW EXECUTE FUNCTION enforce_policy_approval_decision();

CREATE OR REPLACE FUNCTION enforce_policy_current_approved_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_tenant_id UUID;
  target_policy_id UUID;
  pointer_id UUID;
  approved_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'policies' THEN
    target_tenant_id := NEW."tenant_id";
    target_policy_id := NEW."id";
  ELSE
    target_tenant_id := NEW."tenant_id";
    target_policy_id := NEW."policy_id";
  END IF;

  SELECT "current_approved_version_id"
  INTO pointer_id
  FROM "policies"
  WHERE "tenant_id" = target_tenant_id
    AND "id" = target_policy_id;

  SELECT "id"
  INTO approved_id
  FROM "policy_versions"
  WHERE "tenant_id" = target_tenant_id
    AND "policy_id" = target_policy_id
    AND "status" = 'APPROVED';

  IF pointer_id IS DISTINCT FROM approved_id THEN
    RAISE EXCEPTION 'Policy current approved version pointer is inconsistent';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "policies_current_approved_consistency"
AFTER INSERT OR UPDATE OF "current_approved_version_id" ON "policies"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_policy_current_approved_version();

CREATE CONSTRAINT TRIGGER "policy_versions_current_approved_consistency"
AFTER INSERT OR UPDATE OF "status" ON "policy_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_policy_current_approved_version();

-- Mapping and lifecycle protection
CREATE OR REPLACE FUNCTION enforce_active_rule_control_framework()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_active" AND NOT EXISTS (
    SELECT 1
    FROM "control_frameworks"
    WHERE "tenant_id" = NEW."tenant_id"
      AND "control_id" = NEW."control_id"
      AND "framework_id" = NEW."framework_id"
      AND "is_active"
  ) THEN
    RAISE EXCEPTION 'active RuleControl requires an active ControlFramework mapping';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "rule_controls_active_framework"
BEFORE INSERT OR UPDATE ON "rule_controls"
FOR EACH ROW EXECUTE FUNCTION enforce_active_rule_control_framework();

CREATE OR REPLACE FUNCTION prevent_framework_mapping_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."is_active" AND NOT NEW."is_active" AND EXISTS (
    SELECT 1
    FROM "rule_controls"
    WHERE "tenant_id" = OLD."tenant_id"
      AND "control_id" = OLD."control_id"
      AND "framework_id" = OLD."framework_id"
      AND "is_active"
  ) THEN
    RAISE EXCEPTION 'deactivate RuleControl mappings before ControlFramework';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "control_frameworks_active_rule_guard"
BEFORE UPDATE ON "control_frameworks"
FOR EACH ROW EXECUTE FUNCTION prevent_framework_mapping_deactivation();

CREATE OR REPLACE FUNCTION enforce_terminal_governance_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."lifecycle_status" = 'ARCHIVED'
    AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)
  THEN
    RAISE EXCEPTION 'archived % records are immutable', TG_TABLE_NAME;
  END IF;
  IF TG_TABLE_NAME = 'controls'
    AND OLD."lifecycle_status" <> 'ARCHIVED'
    AND NEW."lifecycle_status" = 'ARCHIVED'
  THEN
    -- Reaffirm the Control row lock already held by this UPDATE so Checkpoint
    -- INSERT/activation (which locks the same parent row) serializes here.
    PERFORM 1
    FROM "controls"
    WHERE "tenant_id" = OLD."tenant_id"
      AND "id" = OLD."id"
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM "checkpoints"
      WHERE "tenant_id" = OLD."tenant_id"
        AND "control_id" = OLD."id"
        AND "lifecycle_status" = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Control cannot be archived while active Checkpoints exist';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "policies_archive_terminal"
BEFORE UPDATE ON "policies"
FOR EACH ROW EXECUTE FUNCTION enforce_terminal_governance_archive();

CREATE TRIGGER "controls_archive_terminal"
BEFORE UPDATE ON "controls"
FOR EACH ROW EXECUTE FUNCTION enforce_terminal_governance_archive();

CREATE TRIGGER "checkpoints_archive_terminal"
BEFORE UPDATE ON "checkpoints"
FOR EACH ROW EXECUTE FUNCTION enforce_terminal_governance_archive();

CREATE OR REPLACE FUNCTION enforce_checkpoint_parent_control_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_lifecycle "GovernanceRecordStatus";
BEGIN
  -- Skip non-lifecycle/non-lineage Checkpoint updates (for example latest-review
  -- sync) so parent locking stays scoped to INSERT and activation paths.
  IF TG_OP = 'UPDATE'
    AND NEW."lifecycle_status" IS NOT DISTINCT FROM OLD."lifecycle_status"
    AND NEW."control_id" IS NOT DISTINCT FROM OLD."control_id"
  THEN
    RETURN NEW;
  END IF;

  -- Lock the parent Control before validating. Same lock order as Control
  -- archival prevents ARCHIVED Control + ACTIVE Checkpoint races.
  SELECT "lifecycle_status"
  INTO parent_lifecycle
  FROM "controls"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "id" = NEW."control_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkpoint Control lineage is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."lifecycle_status" = 'ACTIVE'
    AND parent_lifecycle = 'ARCHIVED'
  THEN
    RAISE EXCEPTION 'ACTIVE Checkpoint cannot reference an ARCHIVED Control'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "checkpoints_parent_control_lifecycle"
BEFORE INSERT OR UPDATE ON "checkpoints"
FOR EACH ROW EXECUTE FUNCTION enforce_checkpoint_parent_control_lifecycle();

CREATE OR REPLACE FUNCTION enforce_governance_lineage_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lineage_fields TEXT[];
  lineage_field TEXT;
  new_record JSONB := to_jsonb(NEW);
  old_record JSONB := to_jsonb(OLD);
BEGIN
  lineage_fields := CASE TG_TABLE_NAME
    WHEN 'control_policy_versions'
      THEN ARRAY['control_id', 'policy_id', 'policy_version_id']
    WHEN 'control_frameworks' THEN ARRAY['control_id', 'framework_id']
    WHEN 'rule_controls'
      THEN ARRAY['control_id', 'framework_id', 'framework_rule_id']
    WHEN 'checkpoints' THEN ARRAY['control_id']
    ELSE ARRAY[]::TEXT[]
  END;

  FOREACH lineage_field IN ARRAY lineage_fields LOOP
    IF (new_record -> lineage_field) IS DISTINCT FROM
      (old_record -> lineage_field)
    THEN
      RAISE EXCEPTION '% lineage is immutable', TG_TABLE_NAME;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "control_policy_versions_lineage_immutable"
BEFORE UPDATE ON "control_policy_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_lineage_immutability();

CREATE TRIGGER "control_frameworks_lineage_immutable"
BEFORE UPDATE ON "control_frameworks"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_lineage_immutability();

CREATE TRIGGER "rule_controls_lineage_immutable"
BEFORE UPDATE ON "rule_controls"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_lineage_immutability();

CREATE TRIGGER "checkpoints_control_lineage_immutable"
BEFORE UPDATE ON "checkpoints"
FOR EACH ROW EXECUTE FUNCTION enforce_governance_lineage_immutability();

CREATE OR REPLACE FUNCTION prevent_governance_history_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records cannot be physically deleted', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "policies_no_hard_delete"
BEFORE DELETE ON "policies"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "policy_frameworks_no_hard_delete"
BEFORE DELETE ON "policy_frameworks"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "controls_no_hard_delete"
BEFORE DELETE ON "controls"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "control_policy_versions_no_hard_delete"
BEFORE DELETE ON "control_policy_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "control_frameworks_no_hard_delete"
BEFORE DELETE ON "control_frameworks"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "rule_controls_no_hard_delete"
BEFORE DELETE ON "rule_controls"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

CREATE TRIGGER "checkpoints_no_hard_delete"
BEFORE DELETE ON "checkpoints"
FOR EACH ROW EXECUTE FUNCTION prevent_governance_history_delete();

-- Checkpoint review period and current summary
CREATE OR REPLACE FUNCTION enforce_checkpoint_review_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checkpoint_frequency "KpiFrequency";
  checkpoint_status "GovernanceRecordStatus";
BEGIN
  SELECT "verification_frequency", "lifecycle_status"
  INTO checkpoint_frequency, checkpoint_status
  FROM "checkpoints"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "id" = NEW."checkpoint_id";

  IF checkpoint_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Checkpoint reviews require an ACTIVE Checkpoint';
  END IF;

  IF (
    checkpoint_frequency = 'DAILY'
    AND NEW."review_period" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ) OR (
    checkpoint_frequency = 'WEEKLY'
    AND NEW."review_period" !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
  ) OR (
    checkpoint_frequency = 'MONTHLY'
    AND NEW."review_period" !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ) OR (
    checkpoint_frequency = 'QUARTERLY'
    AND NEW."review_period" !~ '^[0-9]{4}-Q[1-4]$'
  ) OR (
    checkpoint_frequency = 'HALF_YEARLY'
    AND NEW."review_period" !~ '^[0-9]{4}-H[1-2]$'
  ) OR (
    checkpoint_frequency = 'ANNUAL'
    AND NEW."review_period" !~ '^[0-9]{4}$'
  ) OR (
    checkpoint_frequency IN ('CONTINUOUS', 'PER_EVENT')
    AND NEW."review_period" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}#[A-Z0-9][A-Z0-9_-]{0,31}$'
  ) OR (
    checkpoint_frequency = 'ONE_TIME'
    AND NEW."review_period" <> 'ONE-TIME'
  ) THEN
    RAISE EXCEPTION 'reviewPeriod does not match the Checkpoint frequency';
  END IF;
  IF checkpoint_frequency = 'DAILY'
    AND to_char(NEW."review_period"::DATE, 'YYYY-MM-DD') <> NEW."review_period"
  THEN
    RAISE EXCEPTION 'reviewPeriod is not a real calendar date';
  END IF;
  IF checkpoint_frequency = 'WEEKLY'
    AND to_char(
      to_date(NEW."review_period" || '-1', 'IYYY-"W"IW-ID'),
      'IYYY-"W"IW'
    ) <> NEW."review_period"
  THEN
    RAISE EXCEPTION 'reviewPeriod is not a real ISO week';
  END IF;
  IF checkpoint_frequency IN ('CONTINUOUS', 'PER_EVENT')
    AND to_char(
      split_part(NEW."review_period", '#', 1)::DATE,
      'YYYY-MM-DD'
    ) <> split_part(NEW."review_period", '#', 1)
  THEN
    RAISE EXCEPTION 'reviewPeriod is not a real calendar date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "checkpoint_reviews_period_guard"
BEFORE INSERT ON "checkpoint_reviews"
FOR EACH ROW EXECUTE FUNCTION enforce_checkpoint_review_period();

CREATE OR REPLACE FUNCTION sync_checkpoint_latest_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "checkpoints"
  SET "latest_review_id" = NEW."id",
      "last_reviewed_at" = NEW."submitted_at",
      "next_review_date" = NEW."next_review_date",
      "updated_by_id" = NEW."reviewer_id",
      "updated_at" = NEW."submitted_at"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "id" = NEW."checkpoint_id"
    AND (
      "last_reviewed_at" IS NULL
      OR "last_reviewed_at" < NEW."submitted_at"
      OR (
        "last_reviewed_at" = NEW."submitted_at"
        AND (
          "latest_review_id" IS NULL
          OR "latest_review_id"::TEXT < NEW."id"::TEXT
        )
      )
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "checkpoint_reviews_sync_latest"
AFTER INSERT ON "checkpoint_reviews"
FOR EACH ROW EXECUTE FUNCTION sync_checkpoint_latest_review();

COMMIT;
