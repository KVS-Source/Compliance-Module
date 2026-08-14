-- Milestone 5 Slice 5.5C: allow APPROVED/SUPERSEDED/OBSOLETE Policy Versions
-- when requires_evidence is true after application Evidence gate evaluation.
-- Option A: remove only AND NOT requires_evidence; preserve all other invariants.

ALTER TABLE "policy_versions"
  DROP CONSTRAINT "policy_versions_submission_fields_consistent";

ALTER TABLE "policy_versions"
  ADD CONSTRAINT "policy_versions_submission_fields_consistent"
  CHECK (
    (
      "status" = 'DRAFT'
      AND "submitted_by_id" IS NULL
      AND "submitted_at" IS NULL
      AND "approved_by_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" IN ('SUBMITTED', 'REJECTED')
      AND "submitted_by_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" IN ('APPROVED', 'SUPERSEDED', 'OBSOLETE')
      AND "submitted_by_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_id" IS NOT NULL
      AND "approved_at" IS NOT NULL
      AND "effective_date" IS NOT NULL
      AND "review_date" IS NOT NULL
      AND "effective_date" <= CURRENT_DATE
      AND "submitted_by_id" <> "approved_by_id"
    )
  );
