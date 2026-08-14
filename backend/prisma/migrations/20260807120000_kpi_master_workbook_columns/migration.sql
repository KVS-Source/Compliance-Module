-- AlterTable
-- `14_KPI_Master` carries three columns the importer already reads but had
-- nowhere to store: the declared compliance framework mapping, the default
-- data source and the suggested owner. All three are nullable because the
-- workbook leaves them blank for part of the 91-KPI basket.
ALTER TABLE "kpi_definitions"
    ADD COLUMN "framework_mapping" TEXT,
    ADD COLUMN "default_data_source" TEXT,
    ADD COLUMN "owner_suggestion" TEXT;
