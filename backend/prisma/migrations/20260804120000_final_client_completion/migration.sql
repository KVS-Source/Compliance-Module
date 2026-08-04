-- AlterEnum
ALTER TYPE "AuditEventSource" ADD VALUE 'EXTERNAL_SYNC';

-- CreateEnum
CREATE TYPE "ExternalConnectorType" AS ENUM ('CSV_FILE', 'REST', 'POSTGRES_READONLY');
CREATE TYPE "ExternalConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'ERROR', 'DISABLED');
CREATE TYPE "SyncRunStatus" AS ENUM ('PREVIEWED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "ExternalMapStatus" AS ENUM ('ACTIVE', 'CONFLICT', 'DEACTIVATED', 'INVALID');

-- CreateTable
CREATE TABLE "external_system_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "system_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "connector_type" "ExternalConnectorType" NOT NULL,
    "status" "ExternalConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secret_ref_keys" JSONB NOT NULL DEFAULT '[]',
    "last_tested_at" TIMESTAMPTZ(6),
    "last_test_success" BOOLEAN,
    "last_test_message" TEXT,
    "last_successful_sync_at" TIMESTAMPTZ(6),
    "last_attempted_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_system_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_record_maps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "external_record_id" TEXT NOT NULL,
    "local_entity_type" TEXT NOT NULL,
    "local_entity_id" TEXT,
    "source_updated_at" TIMESTAMPTZ(6),
    "sync_hash" TEXT,
    "status" "ExternalMapStatus" NOT NULL DEFAULT 'ACTIVE',
    "conflict_reason" TEXT,
    "deactivated_at" TIMESTAMPTZ(6),
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_record_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'PREVIEWED',
    "mode" TEXT NOT NULL DEFAULT 'PREVIEW',
    "cursor" TEXT,
    "create_count" INTEGER NOT NULL DEFAULT 0,
    "update_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "skip_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" JSONB NOT NULL DEFAULT '[]',
    "report" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_run_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "external_record_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_run_items_pkey" PRIMARY KEY ("id")
);

-- Indexes and uniqueness
CREATE UNIQUE INDEX "external_system_connections_tenant_id_id_key" ON "external_system_connections"("tenant_id", "id");
CREATE UNIQUE INDEX "external_system_connections_tenant_id_system_code_key" ON "external_system_connections"("tenant_id", "system_code");
CREATE INDEX "external_system_connections_tenant_id_status_idx" ON "external_system_connections"("tenant_id", "status");

CREATE UNIQUE INDEX "external_record_maps_tenant_id_id_key" ON "external_record_maps"("tenant_id", "id");
CREATE UNIQUE INDEX "external_record_maps_tenant_id_connection_id_source_entity_type_external_record_id_key" ON "external_record_maps"("tenant_id", "connection_id", "source_entity_type", "external_record_id");
CREATE INDEX "external_record_maps_tenant_id_local_entity_type_local_entity_id_idx" ON "external_record_maps"("tenant_id", "local_entity_type", "local_entity_id");
CREATE INDEX "external_record_maps_tenant_id_status_idx" ON "external_record_maps"("tenant_id", "status");

CREATE UNIQUE INDEX "sync_runs_tenant_id_id_key" ON "sync_runs"("tenant_id", "id");
CREATE INDEX "sync_runs_tenant_id_connection_id_started_at_idx" ON "sync_runs"("tenant_id", "connection_id", "started_at");
CREATE INDEX "sync_runs_tenant_id_status_started_at_idx" ON "sync_runs"("tenant_id", "status", "started_at");

CREATE INDEX "sync_run_items_tenant_id_sync_run_id_outcome_idx" ON "sync_run_items"("tenant_id", "sync_run_id", "outcome");

-- Foreign keys
ALTER TABLE "external_system_connections" ADD CONSTRAINT "external_system_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_record_maps" ADD CONSTRAINT "external_record_maps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_record_maps" ADD CONSTRAINT "external_record_maps_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "external_system_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "external_system_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_run_items" ADD CONSTRAINT "sync_run_items_tenant_id_sync_run_id_fkey" FOREIGN KEY ("tenant_id", "sync_run_id") REFERENCES "sync_runs"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
