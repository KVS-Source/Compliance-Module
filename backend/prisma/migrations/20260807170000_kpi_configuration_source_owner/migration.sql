-- `15_KPI_Config_Targets` refers to workbook user tokens rather than
-- authenticated platform users. Keep the token for traceability while the
-- import actor remains the accountable platform owner.
ALTER TABLE "kpi_configurations"
    ADD COLUMN "source_owner_ref" TEXT;
