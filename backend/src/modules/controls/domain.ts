import type {
  ControlImplementationStatus,
  GovernanceRecordStatus,
} from "@prisma/client";
import { GovernanceRuleError } from "../governance/domain-error.js";

export const assertGovernanceLifecycleTransition = (
  from: GovernanceRecordStatus,
  to: GovernanceRecordStatus,
) => {
  const allowed =
    from === "ARCHIVED"
      ? []
      : from === "ACTIVE"
        ? ["ACTIVE", "INACTIVE", "ARCHIVED"]
        : ["INACTIVE", "ACTIVE", "ARCHIVED"];
  if (!allowed.includes(to)) {
    throw new GovernanceRuleError(
      "GOVERNANCE_ARCHIVE_TERMINAL",
      `A ${from} record cannot transition to ${to}`,
    );
  }
};

export const assertControlImplementation = (
  status: ControlImplementationStatus,
  notes: string | null | undefined,
) => {
  if (status === "NOT_APPLICABLE" && (notes?.trim().length ?? 0) < 2) {
    throw new GovernanceRuleError(
      "CONTROL_IMPLEMENTATION_NOTES_REQUIRED",
      "NOT_APPLICABLE Controls require implementation notes",
    );
  }
};

export const assertUniqueMappingIds = (
  mappingIds: readonly string[],
  label: string,
) => {
  if (new Set(mappingIds).size !== mappingIds.length) {
    throw new GovernanceRuleError(
      "CONTROL_MAPPING_DUPLICATE",
      `${label} contains a duplicate mapping`,
    );
  }
};

export const assertUniqueActiveControlPolicyMappings = (
  mappings: readonly {
    controlId: string;
    policyId: string;
    isActive: boolean;
  }[],
) => {
  const activeIdentities = mappings
    .filter(({ isActive }) => isActive)
    .map(({ controlId, policyId }) => `${controlId}\u0000${policyId}`);
  if (new Set(activeIdentities).size !== activeIdentities.length) {
    throw new GovernanceRuleError(
      "CONTROL_POLICY_ACTIVE_MAPPING_DUPLICATE",
      "A Control may have only one active mapping to a stable Policy identity",
    );
  }
};

export const assertControlArchiveAllowed = (
  targetStatus: GovernanceRecordStatus,
  activeCheckpointCount: number,
) => {
  if (targetStatus === "ARCHIVED" && activeCheckpointCount > 0) {
    throw new GovernanceRuleError(
      "CONTROL_ACTIVE_CHECKPOINTS_EXIST",
      "A Control cannot be archived while active Checkpoints exist",
    );
  }
};
