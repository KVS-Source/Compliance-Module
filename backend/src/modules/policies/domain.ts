import type { PolicyVersionStatus } from "@prisma/client";
import { GovernanceRuleError } from "../governance/domain-error.js";

export type PolicyVersionBump = "MAJOR" | "MINOR";

const transitions = {
  DRAFT: ["DRAFT", "SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["SUPERSEDED", "OBSOLETE"],
  REJECTED: ["REJECTED", "SUBMITTED"],
  SUPERSEDED: [],
  OBSOLETE: [],
} as const satisfies Readonly<
  Record<PolicyVersionStatus, readonly PolicyVersionStatus[]>
>;

export const isPolicyVersionTransitionAllowed = (
  from: PolicyVersionStatus,
  to: PolicyVersionStatus,
) => {
  const allowed: readonly PolicyVersionStatus[] = transitions[from];
  return allowed.includes(to);
};

export const assertPolicyVersionTransition = (
  from: PolicyVersionStatus,
  to: PolicyVersionStatus,
) => {
  if (!isPolicyVersionTransitionAllowed(from, to)) {
    throw new GovernanceRuleError(
      "POLICY_VERSION_INVALID_STATE",
      `A Policy Version cannot transition from ${from} to ${to}`,
    );
  }
};

export interface PolicyVersionNumber {
  sequence: number;
  major: number;
  minor: number;
  label: string;
}

export const allocatePolicyVersion = (
  nextSequence: number,
  latest: Readonly<{ major: number; minor: number }> | null,
  bump: PolicyVersionBump,
): PolicyVersionNumber => {
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) {
    throw new GovernanceRuleError(
      "POLICY_VERSION_SEQUENCE_INVALID",
      "Policy Version sequence must be a positive safe integer",
    );
  }
  if (!latest) {
    return { sequence: nextSequence, major: 1, minor: 0, label: "1.0" };
  }
  if (
    !Number.isSafeInteger(latest.major) ||
    latest.major < 1 ||
    !Number.isSafeInteger(latest.minor) ||
    latest.minor < 0
  ) {
    throw new GovernanceRuleError(
      "POLICY_VERSION_NUMBER_INVALID",
      "Current Policy Version number is invalid",
    );
  }
  const major = bump === "MAJOR" ? latest.major + 1 : latest.major;
  const minor = bump === "MAJOR" ? 0 : latest.minor + 1;
  return {
    sequence: nextSequence,
    major,
    minor,
    label: `${major}.${minor}`,
  };
};

const rawHtmlPattern = /<\s*\/?\s*[a-z][^>]*>|<\s*[!?][^>]*>/i;

export const assertPolicyContent = (content: string) => {
  const length = content.trim().length;
  if (length < 1 || length > 100_000) {
    throw new GovernanceRuleError(
      "POLICY_CONTENT_INVALID",
      "Policy content must contain between 1 and 100000 characters",
    );
  }
  if (rawHtmlPattern.test(content)) {
    throw new GovernanceRuleError(
      "POLICY_CONTENT_HTML_FORBIDDEN",
      "Raw HTML is not permitted in Policy content",
    );
  }
};

export const assertPolicyApprovalAllowed = (input: {
  status: PolicyVersionStatus;
  submitterId: string | null;
  actorId: string;
  /**
   * Evidence coverage is enforced by EvidenceGateService in the approve
   * transaction (Slice 5.5C). Kept for call-site compatibility; not used for 501.
   */
  requiresEvidence?: boolean;
}) => {
  if (input.status !== "SUBMITTED") {
    throw new GovernanceRuleError(
      "POLICY_VERSION_INVALID_STATE",
      "Only a submitted Policy Version can be approved",
    );
  }
  if (input.submitterId === input.actorId) {
    throw new GovernanceRuleError(
      "POLICY_SELF_APPROVAL_FORBIDDEN",
      "Policy Version self-approval is prohibited",
    );
  }
  // Policy Evidence gate (when requiresEvidence) is evaluated by
  // EvidenceGateService.assertPolicyVersionApprovalSatisfied — not here.
  void input.requiresEvidence;
};

const safePolicyAuditFields = new Set([
  "title",
  "ownerId",
  "departmentId",
  "lifecycleStatus",
  "effectiveDate",
  "reviewDate",
  "requiresEvidence",
  "requestedApproverId",
  "status",
]);

export const safePolicyAuditMetadata = (input: {
  code: string;
  version?: string;
  fromStatus?: PolicyVersionStatus;
  toStatus?: PolicyVersionStatus;
  changedFields?: readonly string[];
}) => ({
  code: input.code,
  ...(input.version ? { version: input.version } : {}),
  ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
  ...(input.toStatus ? { toStatus: input.toStatus } : {}),
  ...(input.changedFields
    ? {
        changedFields: [...new Set(input.changedFields)]
          .filter((field) => safePolicyAuditFields.has(field))
          .sort(),
      }
    : {}),
});
