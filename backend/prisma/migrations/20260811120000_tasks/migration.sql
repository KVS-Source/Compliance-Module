-- Governed assigned tasks linked to a Gap, CAPA, Risk or Audit event.
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TaskLinkType" AS ENUM ('GAP', 'CAPA', 'RISK', 'AUDIT');

CREATE TABLE "tasks" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "due_date" DATE,
  "owner_id" UUID,
  "linked_entity_type" "TaskLinkType" NOT NULL,
  "linked_entity_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "tasks_tenant_id_id_key" ON "tasks"("tenant_id", "id");
CREATE INDEX "tasks_tenant_id_status_due_date_created_at_idx"
  ON "tasks"("tenant_id", "status", "due_date", "created_at");
CREATE INDEX "tasks_tenant_id_owner_id_status_due_date_idx"
  ON "tasks"("tenant_id", "owner_id", "status", "due_date");
CREATE INDEX "tasks_tenant_id_linked_entity_type_linked_entity_id_idx"
  ON "tasks"("tenant_id", "linked_entity_type", "linked_entity_id");
