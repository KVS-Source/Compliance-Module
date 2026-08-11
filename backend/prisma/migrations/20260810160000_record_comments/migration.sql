-- Record comments: remediation conversation held inside the audit trail
-- instead of in email. Rows are immutable by database trigger, matching the
-- risk_reviews / risk_treatments / audit_events precedent, so history cannot
-- be rewritten after a reviewer has read it.

CREATE TYPE "CommentEntityType" AS ENUM ('GAP', 'CAPA', 'RISK', 'EVIDENCE');

CREATE TABLE "record_comments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "entity_type" "CommentEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "author_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "record_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "record_comments"
  ADD CONSTRAINT "record_comments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The author may be erased or removed later; the comment and its place in the
-- trail survive, attributed to a withdrawn account rather than deleted.
ALTER TABLE "record_comments"
  ADD CONSTRAINT "record_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "record_comments_tenant_id_entity_type_entity_id_created_at_idx"
  ON "record_comments" ("tenant_id", "entity_type", "entity_id", "created_at");

CREATE INDEX "record_comments_tenant_id_author_id_created_at_idx"
  ON "record_comments" ("tenant_id", "author_id", "created_at");

CREATE OR REPLACE FUNCTION prevent_record_comment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'record_comments are append-only';
END;
$$;

CREATE TRIGGER "record_comments_append_only"
BEFORE UPDATE OR DELETE ON "record_comments"
FOR EACH ROW EXECUTE FUNCTION prevent_record_comment_mutation();
