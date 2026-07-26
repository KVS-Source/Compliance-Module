-- Link the risk register to KPI target failures and classify each risk.
ALTER TABLE "risks"
ADD COLUMN "kpi_id" UUID,
ADD COLUMN "kpi_target_id" UUID,
ADD COLUMN "kpi_actual_id" UUID,
ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'minor';

CREATE INDEX "risks_kpi_id_idx" ON "risks"("kpi_id");
CREATE INDEX "risks_kpi_target_id_idx" ON "risks"("kpi_target_id");
CREATE INDEX "risks_kpi_actual_id_idx" ON "risks"("kpi_actual_id");
CREATE INDEX "risks_classification_idx" ON "risks"("classification");

ALTER TABLE "risks" ADD CONSTRAINT "risks_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risks" ADD CONSTRAINT "risks_kpi_target_id_fkey"
FOREIGN KEY ("kpi_target_id") REFERENCES "kpi_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risks" ADD CONSTRAINT "risks_kpi_actual_id_fkey"
FOREIGN KEY ("kpi_actual_id") REFERENCES "kpi_actuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
