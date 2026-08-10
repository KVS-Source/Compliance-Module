-- Session management: capture client context on refresh tokens so
-- administrators can list and revoke live sessions without inventing a second
-- token store. Existing rows stay valid with null address/agent metadata.

ALTER TABLE "refresh_tokens"
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pre-migration tokens should sort by when they were issued, not by migration time.
UPDATE "refresh_tokens"
SET "last_used_at" = "created_at";

CREATE INDEX "refresh_tokens_user_id_tenant_id_revoked_at_idx"
  ON "refresh_tokens" ("user_id", "tenant_id", "revoked_at");
