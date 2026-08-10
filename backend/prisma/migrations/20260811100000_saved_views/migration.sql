-- Private per-user register views. Query state is JSON because each register
-- owns a different allowlisted URL filter set; API validation is the authority.
CREATE TABLE "saved_views" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "register_key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "query" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "saved_views_tenant_id_user_id_register_key_name_key"
  ON "saved_views"("tenant_id", "user_id", "register_key", "name");
CREATE INDEX "saved_views_tenant_id_user_id_register_key_created_at_idx"
  ON "saved_views"("tenant_id", "user_id", "register_key", "created_at");
