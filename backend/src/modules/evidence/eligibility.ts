import type { EvidenceLifecycleStatus } from "@prisma/client";
import { hasEvidenceFile, type EvidenceFilePresence } from "./domain.js";

/** Fixed machine-readable reasons for Checkpoint Evidence gate failures. */
export type EvidenceGateFailureReason =
  | "EVIDENCE_LINK_REQUIRED"
  | "EVIDENCE_NOT_APPROVED"
  | "EVIDENCE_FILE_REQUIRED"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_NOT_YET_VALID"
  | "EVIDENCE_SUPERSEDED"
  | "EVIDENCE_COVERAGE_INCOMPLETE";

/** UTC calendar date as `YYYY-MM-DD`. */
export type UtcDateString = string;

export const utcDateString = (value: Date = new Date()): UtcDateString =>
  value.toISOString().slice(0, 10);

export const isApprovedLifecycle = (
  status: EvidenceLifecycleStatus,
): boolean => status === "APPROVED";

export const isIssueDateValid = (
  issueDate: string | Date | null | undefined,
  asOfDate: UtcDateString,
): boolean => {
  if (issueDate == null) return true;
  const issue =
    typeof issueDate === "string"
      ? issueDate.slice(0, 10)
      : issueDate.toISOString().slice(0, 10);
  return issue <= asOfDate;
};

export const isExpiryValid = (
  expiresAt: string | Date | null | undefined,
  asOfDate: UtcDateString,
): boolean => {
  if (expiresAt == null) return true;
  const expires =
    typeof expiresAt === "string"
      ? expiresAt.slice(0, 10)
      : expiresAt.toISOString().slice(0, 10);
  return expires >= asOfDate;
};

/**
 * A successor in APPROVED or ARCHIVED invalidates the prior Evidence.
 * DRAFT / SUBMITTED / REJECTED successors do not.
 */
export const isInvalidatedBySuccessorLifecycle = (
  successorStatus: EvidenceLifecycleStatus,
): boolean =>
  successorStatus === "APPROVED" || successorStatus === "ARCHIVED";

export type EvidenceEligibilitySnapshot = {
  lifecycleStatus: EvidenceLifecycleStatus;
  file: EvidenceFilePresence;
  issueDate?: string | Date | null;
  expiresAt?: string | Date | null;
  linkIsActive?: boolean;
  /** True when an APPROVED or ARCHIVED successor supersedes this row. */
  hasInvalidatingSuccessor?: boolean;
};

/**
 * Pure eligibility for Checkpoint gate (assumes same tenant + correct
 * checkpoint link already established by the caller/query).
 */
export const evaluateEvidenceEligibility = (
  input: EvidenceEligibilitySnapshot,
  asOfDate: UtcDateString,
): { eligible: boolean; reason?: EvidenceGateFailureReason } => {
  if (input.linkIsActive === false) {
    return { eligible: false, reason: "EVIDENCE_LINK_REQUIRED" };
  }
  if (!isApprovedLifecycle(input.lifecycleStatus)) {
    return { eligible: false, reason: "EVIDENCE_NOT_APPROVED" };
  }
  if (!hasEvidenceFile(input.file)) {
    return { eligible: false, reason: "EVIDENCE_FILE_REQUIRED" };
  }
  if (!isIssueDateValid(input.issueDate, asOfDate)) {
    return { eligible: false, reason: "EVIDENCE_NOT_YET_VALID" };
  }
  if (!isExpiryValid(input.expiresAt, asOfDate)) {
    return { eligible: false, reason: "EVIDENCE_EXPIRED" };
  }
  if (input.hasInvalidatingSuccessor === true) {
    return { eligible: false, reason: "EVIDENCE_SUPERSEDED" };
  }
  return { eligible: true };
};

export const coverageIncompleteReason =
  (): EvidenceGateFailureReason => "EVIDENCE_COVERAGE_INCOMPLETE";
