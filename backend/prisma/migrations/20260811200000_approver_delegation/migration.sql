-- Approver delegation: temporary out-of-office routing for maker-checker
-- approvals. The delegate may act as the configured approver while the window
-- is active; self-approval remains forbidden at the service layer.

CREATE TABLE "approver_delegations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "delegator_user_id" UUID NOT NULL,
    "delegate_user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approver_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approver_delegations_window_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "approver_delegations_not_self_check" CHECK ("delegator_user_id" <> "delegate_user_id")
);

CREATE INDEX "approver_delegations_tenant_delegate_active_idx"
  ON "approver_delegations" ("tenant_id", "delegate_user_id", "status", "starts_at", "ends_at");

CREATE INDEX "approver_delegations_tenant_delegator_idx"
  ON "approver_delegations" ("tenant_id", "delegator_user_id", "status");

ALTER TABLE "approver_delegations"
  ADD CONSTRAINT "approver_delegations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approver_delegations"
  ADD CONSTRAINT "approver_delegations_delegator_user_id_fkey"
  FOREIGN KEY ("delegator_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approver_delegations"
  ADD CONSTRAINT "approver_delegations_delegate_user_id_fkey"
  FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approver_delegations"
  ADD CONSTRAINT "approver_delegations_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approver_delegations"
  ADD CONSTRAINT "approver_delegations_revoked_by_id_fkey"
  FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
