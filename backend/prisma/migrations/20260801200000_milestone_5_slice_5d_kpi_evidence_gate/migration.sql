-- Milestone 5 Slice 5D: typed Evidence ↔ KpiActual links for KPI Evidence gate.
-- No backfill. Application enforces requiresEvidence ⇒ requiresApproval.

-- CreateTable
CREATE TABLE "evidence_kpi_actual_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "kpi_actual_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "link_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_kpi_actual_links_pkey" PRIMARY KEY ("id")
);

-- Uniques
CREATE UNIQUE INDEX "evidence_kpi_actual_links_tenant_id_id_key"
  ON "evidence_kpi_actual_links"("tenant_id", "id");
CREATE UNIQUE INDEX "evidence_kpi_actual_links_tenant_evidence_actual_key"
  ON "evidence_kpi_actual_links"("tenant_id", "evidence_id", "kpi_actual_id");

-- Indexes for gate and list queries
CREATE INDEX "evidence_kpi_actual_links_tenant_actual_active_idx"
  ON "evidence_kpi_actual_links"("tenant_id", "kpi_actual_id", "is_active");
CREATE INDEX "evidence_kpi_actual_links_tenant_evidence_active_idx"
  ON "evidence_kpi_actual_links"("tenant_id", "evidence_id", "is_active");

-- Foreign keys (Restrict)
ALTER TABLE "evidence_kpi_actual_links"
  ADD CONSTRAINT "evidence_kpi_actual_links_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_kpi_actual_links"
  ADD CONSTRAINT "evidence_kpi_actual_links_tenant_id_evidence_id_fkey"
  FOREIGN KEY ("tenant_id", "evidence_id")
  REFERENCES "evidence"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_kpi_actual_links"
  ADD CONSTRAINT "evidence_kpi_actual_links_tenant_id_kpi_actual_id_fkey"
  FOREIGN KEY ("tenant_id", "kpi_actual_id")
  REFERENCES "kpi_actuals"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_kpi_actual_links"
  ADD CONSTRAINT "evidence_kpi_actual_links_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evidence_kpi_actual_links"
  ADD CONSTRAINT "evidence_kpi_actual_links_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
