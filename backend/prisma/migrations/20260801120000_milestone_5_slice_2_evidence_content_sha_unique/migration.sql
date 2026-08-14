-- Partial unique index: one non-null content hash per tenant.
-- Same hash may exist across tenants. Prisma schema cannot express this
-- partial uniqueness; it is a database-level invariant only.
CREATE UNIQUE INDEX "evidence_tenant_content_sha256_unique"
  ON "evidence" ("tenant_id", "content_sha256")
  WHERE "content_sha256" IS NOT NULL;
