import type {
  EvidenceDecisionOutcome,
  EvidenceLifecycleStatus,
} from "@prisma/client";
import { GovernanceRuleError } from "../governance/domain-error.js";

const transitions = {
  DRAFT: ["SUBMITTED", "ARCHIVED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
} as const satisfies Readonly<
  Record<EvidenceLifecycleStatus, readonly EvidenceLifecycleStatus[]>
>;

export const isEvidenceTransitionAllowed = (
  from: EvidenceLifecycleStatus,
  to: EvidenceLifecycleStatus,
) => {
  const allowed: readonly EvidenceLifecycleStatus[] = transitions[from];
  return allowed.includes(to);
};

export const assertEvidenceTransition = (
  from: EvidenceLifecycleStatus,
  to: EvidenceLifecycleStatus,
) => {
  if (!isEvidenceTransitionAllowed(from, to)) {
    throw new GovernanceRuleError(
      "EVIDENCE_INVALID_STATE",
      `Evidence cannot transition from ${from} to ${to}`,
    );
  }
};

export const isEvidenceMetadataMutable = (
  status: EvidenceLifecycleStatus,
): boolean => status === "DRAFT" || status === "REJECTED";

export const assertEvidenceMetadataMutable = (
  status: EvidenceLifecycleStatus,
) => {
  if (!isEvidenceMetadataMutable(status)) {
    throw new GovernanceRuleError(
      status === "ARCHIVED" ? "EVIDENCE_ARCHIVED" : "EVIDENCE_INVALID_STATE",
      status === "ARCHIVED"
        ? "Archived Evidence cannot be modified"
        : `Evidence metadata cannot be modified while ${status}`,
    );
  }
};

export const isEvidenceArchiveAllowed = (
  status: EvidenceLifecycleStatus,
): boolean =>
  status === "DRAFT" || status === "REJECTED" || status === "APPROVED";

export const assertEvidenceArchiveAllowed = (
  status: EvidenceLifecycleStatus,
) => {
  if (status === "ARCHIVED") {
    throw new GovernanceRuleError(
      "EVIDENCE_ARCHIVED",
      "Evidence is already archived",
    );
  }
  if (!isEvidenceArchiveAllowed(status)) {
    throw new GovernanceRuleError(
      "EVIDENCE_INVALID_STATE",
      `Evidence cannot be archived while ${status}`,
    );
  }
};

export const isEvidenceSupersedeTargetAllowed = (
  status: EvidenceLifecycleStatus,
): boolean => status === "REJECTED" || status === "ARCHIVED";

export const assertEvidenceSupersedeTargetAllowed = (
  status: EvidenceLifecycleStatus,
) => {
  if (!isEvidenceSupersedeTargetAllowed(status)) {
    throw new GovernanceRuleError(
      "EVIDENCE_SUPERSEDE_INVALID",
      "Only REJECTED or ARCHIVED Evidence can be superseded",
    );
  }
};

export type EvidenceFilePresence = {
  storageKey: string | null | undefined;
  contentSha256: string | null | undefined;
  byteSize: number | null | undefined;
};

export const hasEvidenceFile = (input: EvidenceFilePresence): boolean =>
  typeof input.storageKey === "string" &&
  input.storageKey.length > 0 &&
  typeof input.contentSha256 === "string" &&
  input.contentSha256.length > 0 &&
  typeof input.byteSize === "number" &&
  Number.isInteger(input.byteSize) &&
  input.byteSize > 0;

export const assertEvidenceSubmitAllowed = (input: {
  lifecycleStatus: EvidenceLifecycleStatus;
  file: EvidenceFilePresence;
}) => {
  if (input.lifecycleStatus === "ARCHIVED") {
    throw new GovernanceRuleError(
      "EVIDENCE_ARCHIVED",
      "Archived Evidence cannot be submitted",
    );
  }
  if (input.lifecycleStatus !== "DRAFT") {
    throw new GovernanceRuleError(
      "EVIDENCE_INVALID_STATE",
      "Only DRAFT Evidence can be submitted",
    );
  }
  if (!hasEvidenceFile(input.file)) {
    throw new GovernanceRuleError(
      "EVIDENCE_FILE_REQUIRED",
      "Evidence cannot be submitted until a file has been uploaded",
    );
  }
};

export const assertEvidenceSelfReviewAllowed = (input: {
  actorId: string;
  createdById: string;
  uploadedById: string | null | undefined;
  submittedById?: string | null | undefined;
}) => {
  if (input.actorId === input.createdById) {
    throw new GovernanceRuleError(
      "EVIDENCE_SELF_REVIEW_FORBIDDEN",
      "Evidence creator cannot review their own Evidence",
    );
  }
  if (
    input.uploadedById != null &&
    input.uploadedById.length > 0 &&
    input.actorId === input.uploadedById
  ) {
    throw new GovernanceRuleError(
      "EVIDENCE_SELF_REVIEW_FORBIDDEN",
      "Evidence uploader cannot review their own Evidence",
    );
  }
  if (
    input.submittedById != null &&
    input.submittedById.length > 0 &&
    input.actorId === input.submittedById
  ) {
    throw new GovernanceRuleError(
      "EVIDENCE_SELF_REVIEW_FORBIDDEN",
      "Evidence submitter cannot review their own Evidence",
    );
  }
};

export const assertEvidenceReviewDecision = (input: {
  lifecycleStatus: EvidenceLifecycleStatus;
  actorId: string;
  createdById: string;
  uploadedById: string | null | undefined;
  submittedById?: string | null | undefined;
  decision: EvidenceDecisionOutcome;
  reason: string | null | undefined;
}) => {
  if (input.lifecycleStatus !== "SUBMITTED") {
    throw new GovernanceRuleError(
      "EVIDENCE_INVALID_STATE",
      "Only SUBMITTED Evidence can be reviewed",
    );
  }
  assertEvidenceSelfReviewAllowed({
    actorId: input.actorId,
    createdById: input.createdById,
    uploadedById: input.uploadedById,
    submittedById: input.submittedById,
  });
  if (input.decision === "REJECTED") {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 2 || reason.length > 2000) {
      throw new GovernanceRuleError(
        "EVIDENCE_REJECT_REASON_REQUIRED",
        "Rejection requires a reason between 2 and 2000 characters",
      );
    }
  }
  if (input.decision === "APPROVED" && input.reason != null) {
    const comment = input.reason.trim();
    if (comment.length > 0 && (comment.length < 2 || comment.length > 2000)) {
      throw new GovernanceRuleError(
        "VALIDATION_ERROR",
        "Approval comment must be between 2 and 2000 characters when provided",
      );
    }
  }
};

/** Optional approval comment / rejection reason free-text length (aligned with Policy). */
export const EVIDENCE_REVIEW_TEXT_MIN = 2;
export const EVIDENCE_REVIEW_TEXT_MAX = 2000;

/** Link and unlink mutations are allowed only while Evidence is DRAFT. */
export const isEvidenceLinkMutable = (
  status: EvidenceLifecycleStatus,
): boolean => status === "DRAFT";

export const assertEvidenceLinkMutable = (status: EvidenceLifecycleStatus) => {
  if (!isEvidenceLinkMutable(status)) {
    throw new GovernanceRuleError(
      status === "ARCHIVED" ? "EVIDENCE_ARCHIVED" : "EVIDENCE_INVALID_STATE",
      status === "ARCHIVED"
        ? "Archived Evidence cannot change Control or Checkpoint links"
        : "Only DRAFT Evidence can change Control or Checkpoint links",
    );
  }
};

/** New and reactivated links require an ACTIVE Control or Checkpoint target. */
export const isLinkTargetActive = (
  lifecycleStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED",
): boolean => lifecycleStatus === "ACTIVE";

export const assertControlLinkTargetActive = (
  lifecycleStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED",
) => {
  if (!isLinkTargetActive(lifecycleStatus)) {
    throw new GovernanceRuleError(
      "CONTROL_INVALID_STATE",
      "Only ACTIVE Controls can receive Evidence links",
    );
  }
};

export const assertCheckpointLinkTargetActive = (
  lifecycleStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED",
) => {
  if (!isLinkTargetActive(lifecycleStatus)) {
    throw new GovernanceRuleError(
      "CHECKPOINT_INVALID_STATE",
      "Only ACTIVE Checkpoints can receive Evidence links",
    );
  }
};

const safeEvidenceAuditFields = new Set([
  "title",
  "ownerId",
  "departmentId",
  "issueDate",
  "expiresAt",
  "lifecycleStatus",
]);

export const safeEvidenceAuditMetadata = (input: {
  code: string;
  lifecycleStatus?: EvidenceLifecycleStatus;
  fromStatus?: EvidenceLifecycleStatus;
  toStatus?: EvidenceLifecycleStatus;
  changedFields?: readonly string[];
  ownerId?: string | null;
  departmentId?: string | null;
  issueDate?: string | null;
  expiresAt?: string | null;
  supersedesEvidenceId?: string | null;
  supersedesCode?: string | null;
  hasFile?: boolean;
  linkId?: string;
  controlId?: string;
  controlCode?: string;
  checkpointId?: string;
  checkpointCode?: string;
  isActive?: boolean;
  reactivated?: boolean;
  reviewDecisionId?: string;
  decision?: EvidenceDecisionOutcome;
  hasComment?: boolean;
}) => ({
  code: input.code,
  ...(input.lifecycleStatus
    ? { lifecycleStatus: input.lifecycleStatus }
    : {}),
  ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
  ...(input.toStatus ? { toStatus: input.toStatus } : {}),
  ...(input.changedFields
    ? {
        changedFields: [...new Set(input.changedFields)]
          .filter((field) => safeEvidenceAuditFields.has(field))
          .sort(),
      }
    : {}),
  ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
  ...(input.departmentId !== undefined
    ? { departmentId: input.departmentId }
    : {}),
  ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
  ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  ...(input.supersedesEvidenceId
    ? { supersedesEvidenceId: input.supersedesEvidenceId }
    : {}),
  ...(input.supersedesCode ? { supersedesCode: input.supersedesCode } : {}),
  ...(input.hasFile !== undefined ? { hasFile: input.hasFile } : {}),
  ...(input.linkId ? { linkId: input.linkId } : {}),
  ...(input.controlId ? { controlId: input.controlId } : {}),
  ...(input.controlCode ? { controlCode: input.controlCode } : {}),
  ...(input.checkpointId ? { checkpointId: input.checkpointId } : {}),
  ...(input.checkpointCode ? { checkpointCode: input.checkpointCode } : {}),
  ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  ...(input.reactivated !== undefined
    ? { reactivated: input.reactivated }
    : {}),
  ...(input.reviewDecisionId ? { reviewDecisionId: input.reviewDecisionId } : {}),
  ...(input.decision ? { decision: input.decision } : {}),
  ...(input.hasComment !== undefined ? { hasComment: input.hasComment } : {}),
});
