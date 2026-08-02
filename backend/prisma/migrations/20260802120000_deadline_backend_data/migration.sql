-- CreateEnum
CREATE TYPE "GapSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'OBSERVATION', 'OFI');

-- CreateEnum
CREATE TYPE "GapStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CapaPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CapaStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEWED', 'COMMITTING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowResult" AS ENUM ('CREATED', 'UPDATED', 'UNCHANGED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditEventSource" AS ENUM ('SYSTEM', 'IMPORT');

-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "source" "AuditEventSource" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "source_file_reference" TEXT;

-- AlterTable
ALTER TABLE "framework_rules" ADD COLUMN     "clause_ref" TEXT,
ADD COLUMN     "criticality" TEXT,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "theme" TEXT;

-- AlterTable
ALTER TABLE "frameworks" ADD COLUMN     "scope_status" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "next_capa_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_gap_number" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "gaps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "framework_id" UUID,
    "framework_rule_id" UUID,
    "control_id" UUID,
    "checkpoint_id" UUID,
    "clause_ref" TEXT,
    "recommended_action" TEXT,
    "severity" "GapSeverity" NOT NULL,
    "status" "GapStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" UUID,
    "source_owner_ref" TEXT,
    "department_id" UUID,
    "identified_on" DATE,
    "due_date" DATE,
    "closed_at" TIMESTAMPTZ(6),
    "closure_note" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "import_batch_id" UUID,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_evidence_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gap_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "link_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gap_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "gap_id" UUID,
    "source" TEXT,
    "source_ref" TEXT,
    "framework_id" UUID,
    "root_cause" TEXT,
    "corrective_action" TEXT,
    "preventive_action" TEXT,
    "priority" "CapaPriority" NOT NULL,
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" UUID,
    "source_owner_ref" TEXT,
    "department_id" UUID,
    "raised_on" DATE,
    "due_date" DATE,
    "completion_percentage" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "closure_note" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "import_batch_id" UUID,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "capas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capa_evidence_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "capa_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "link_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "capa_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_register_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_sheet" TEXT,
    "field_configuration" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operational_register_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_register_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "register_type_id" UUID NOT NULL,
    "business_record_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "owner_id" UUID,
    "source_owner_ref" TEXT,
    "department_id" UUID,
    "record_date" DATE,
    "due_date" DATE,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "import_batch_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "operational_register_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_checksum" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "report" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch_rows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "business_key" TEXT,
    "normalized_payload" JSONB NOT NULL DEFAULT '{}',
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "import_result" "ImportRowResult" NOT NULL,
    "destination_table" TEXT,
    "destination_record_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batch_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gaps_tenant_id_status_deleted_at_due_date_idx" ON "gaps"("tenant_id", "status", "deleted_at", "due_date");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_severity_status_deleted_at_idx" ON "gaps"("tenant_id", "severity", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_owner_id_idx" ON "gaps"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_department_id_idx" ON "gaps"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_framework_id_idx" ON "gaps"("tenant_id", "framework_id");

-- CreateIndex
CREATE INDEX "gaps_framework_rule_id_idx" ON "gaps"("framework_rule_id");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_control_id_idx" ON "gaps"("tenant_id", "control_id");

-- CreateIndex
CREATE INDEX "gaps_tenant_id_checkpoint_id_idx" ON "gaps"("tenant_id", "checkpoint_id");

-- CreateIndex
CREATE INDEX "gaps_import_batch_id_idx" ON "gaps"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "gaps_tenant_id_id_key" ON "gaps"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gaps_tenant_id_code_key" ON "gaps"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "gap_evidence_links_tenant_id_gap_id_is_active_idx" ON "gap_evidence_links"("tenant_id", "gap_id", "is_active");

-- CreateIndex
CREATE INDEX "gap_evidence_links_tenant_id_evidence_id_is_active_idx" ON "gap_evidence_links"("tenant_id", "evidence_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "gap_evidence_links_tenant_id_id_key" ON "gap_evidence_links"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_evidence_links_tenant_id_gap_id_evidence_id_key" ON "gap_evidence_links"("tenant_id", "gap_id", "evidence_id");

-- CreateIndex
CREATE INDEX "capas_tenant_id_status_deleted_at_due_date_idx" ON "capas"("tenant_id", "status", "deleted_at", "due_date");

-- CreateIndex
CREATE INDEX "capas_tenant_id_priority_status_deleted_at_idx" ON "capas"("tenant_id", "priority", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "capas_tenant_id_gap_id_idx" ON "capas"("tenant_id", "gap_id");

-- CreateIndex
CREATE INDEX "capas_tenant_id_owner_id_idx" ON "capas"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "capas_tenant_id_department_id_idx" ON "capas"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "capas_framework_id_idx" ON "capas"("framework_id");

-- CreateIndex
CREATE INDEX "capas_import_batch_id_idx" ON "capas"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "capas_tenant_id_id_key" ON "capas"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "capas_tenant_id_code_key" ON "capas"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "capa_evidence_links_tenant_id_capa_id_is_active_idx" ON "capa_evidence_links"("tenant_id", "capa_id", "is_active");

-- CreateIndex
CREATE INDEX "capa_evidence_links_tenant_id_evidence_id_is_active_idx" ON "capa_evidence_links"("tenant_id", "evidence_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "capa_evidence_links_tenant_id_id_key" ON "capa_evidence_links"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "capa_evidence_links_tenant_id_capa_id_evidence_id_key" ON "capa_evidence_links"("tenant_id", "capa_id", "evidence_id");

-- CreateIndex
CREATE INDEX "operational_register_types_tenant_id_active_code_idx" ON "operational_register_types"("tenant_id", "active", "code");

-- CreateIndex
CREATE UNIQUE INDEX "operational_register_types_tenant_id_id_key" ON "operational_register_types"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "operational_register_types_tenant_id_code_key" ON "operational_register_types"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "operational_register_records_tenant_id_register_type_id_del_idx" ON "operational_register_records"("tenant_id", "register_type_id", "deleted_at", "due_date");

-- CreateIndex
CREATE INDEX "operational_register_records_tenant_id_register_type_id_sta_idx" ON "operational_register_records"("tenant_id", "register_type_id", "status");

-- CreateIndex
CREATE INDEX "operational_register_records_tenant_id_owner_id_idx" ON "operational_register_records"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "operational_register_records_tenant_id_department_id_idx" ON "operational_register_records"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "operational_register_records_import_batch_id_idx" ON "operational_register_records"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "operational_register_records_tenant_id_id_key" ON "operational_register_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "operational_register_records_tenant_id_register_type_id_bus_key" ON "operational_register_records"("tenant_id", "register_type_id", "business_record_code");

-- CreateIndex
CREATE INDEX "import_batches_tenant_id_status_started_at_idx" ON "import_batches"("tenant_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "import_batches_tenant_id_file_checksum_idx" ON "import_batches"("tenant_id", "file_checksum");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_tenant_id_id_key" ON "import_batches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_tenant_id_idempotency_key_key" ON "import_batches"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "import_batch_rows_tenant_id_batch_id_sheet_row_number_idx" ON "import_batch_rows"("tenant_id", "batch_id", "sheet", "row_number");

-- CreateIndex
CREATE INDEX "import_batch_rows_tenant_id_batch_id_import_result_idx" ON "import_batch_rows"("tenant_id", "batch_id", "import_result");

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_rows_tenant_id_id_key" ON "import_batch_rows"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_source_created_at_idx" ON "audit_events"("tenant_id", "source", "created_at");

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_framework_rule_id_fkey" FOREIGN KEY ("framework_rule_id") REFERENCES "framework_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_tenant_id_control_id_fkey" FOREIGN KEY ("tenant_id", "control_id") REFERENCES "controls"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_tenant_id_checkpoint_id_fkey" FOREIGN KEY ("tenant_id", "checkpoint_id") REFERENCES "checkpoints"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_evidence_links" ADD CONSTRAINT "gap_evidence_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_evidence_links" ADD CONSTRAINT "gap_evidence_links_tenant_id_gap_id_fkey" FOREIGN KEY ("tenant_id", "gap_id") REFERENCES "gaps"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_evidence_links" ADD CONSTRAINT "gap_evidence_links_tenant_id_evidence_id_fkey" FOREIGN KEY ("tenant_id", "evidence_id") REFERENCES "evidence"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_evidence_links" ADD CONSTRAINT "gap_evidence_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_evidence_links" ADD CONSTRAINT "gap_evidence_links_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_tenant_id_gap_id_fkey" FOREIGN KEY ("tenant_id", "gap_id") REFERENCES "gaps"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas" ADD CONSTRAINT "capas_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_evidence_links" ADD CONSTRAINT "capa_evidence_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_evidence_links" ADD CONSTRAINT "capa_evidence_links_tenant_id_capa_id_fkey" FOREIGN KEY ("tenant_id", "capa_id") REFERENCES "capas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_evidence_links" ADD CONSTRAINT "capa_evidence_links_tenant_id_evidence_id_fkey" FOREIGN KEY ("tenant_id", "evidence_id") REFERENCES "evidence"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_evidence_links" ADD CONSTRAINT "capa_evidence_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_evidence_links" ADD CONSTRAINT "capa_evidence_links_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_types" ADD CONSTRAINT "operational_register_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_tenant_id_register_type_id_fkey" FOREIGN KEY ("tenant_id", "register_type_id") REFERENCES "operational_register_types"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "org_departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_register_records" ADD CONSTRAINT "operational_register_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch_rows" ADD CONSTRAINT "import_batch_rows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch_rows" ADD CONSTRAINT "import_batch_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Completion percentage is a business invariant, not only a DTO rule: enforce
-- it at the database so an importer or a future writer cannot bypass Zod.
ALTER TABLE "capas"
  ADD CONSTRAINT "capas_completion_percentage_range"
  CHECK ("completion_percentage" BETWEEN 0 AND 100);

-- A closed CAPA must carry a closure note. Mirrors the evidence-gated closure
-- rule enforced in CapaService.
ALTER TABLE "capas"
  ADD CONSTRAINT "capas_closed_requires_note"
  CHECK ("status" <> 'CLOSED' OR "closure_note" IS NOT NULL);

ALTER TABLE "gaps"
  ADD CONSTRAINT "gaps_closed_requires_note"
  CHECK ("status" <> 'CLOSED' OR "closure_note" IS NOT NULL);
