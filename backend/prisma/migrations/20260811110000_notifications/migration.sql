-- Persistent in-app notifications only. Email transport is intentionally absent.
CREATE TYPE "NotificationKind" AS ENUM (
  'APPROVAL_REQUEST', 'OVERDUE_GAP', 'OVERDUE_CAPA', 'OWNERSHIP_ASSIGNMENT'
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "message" TEXT NOT NULL,
  "target_path" VARCHAR(500) NOT NULL,
  "source_type" VARCHAR(64) NOT NULL,
  "source_id" UUID NOT NULL,
  "dedupe_key" VARCHAR(180) NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notifications_tenant_id_user_id_dedupe_key_key"
  ON "notifications"("tenant_id", "user_id", "dedupe_key");
CREATE INDEX "notifications_tenant_id_user_id_read_at_created_at_idx"
  ON "notifications"("tenant_id", "user_id", "read_at", "created_at");
