import { describe, expect, it } from "vitest";
import {
  allocatePolicyVersion,
  assertPolicyApprovalAllowed,
  assertPolicyContent,
  assertPolicyVersionTransition,
  isPolicyVersionTransitionAllowed,
  safePolicyAuditMetadata,
} from "../src/modules/policies/domain.js";
import { GovernanceRuleError } from "../src/modules/governance/domain-error.js";
import {
  createPolicySchema,
  createPolicyVersionSchema,
  emptyBodySchema,
  policyListSchema,
  rejectPolicyVersionSchema,
  updatePolicyVersionSchema,
} from "../src/modules/policies/validators.js";

describe("Policy domain and validators", () => {
  it("allocates first version as 1.0 and applies MAJOR/MINOR bumps", () => {
    expect(allocatePolicyVersion(1, null, "MINOR")).toEqual({
      sequence: 1,
      major: 1,
      minor: 0,
      label: "1.0",
    });
    expect(
      allocatePolicyVersion(2, { major: 1, minor: 0 }, "MINOR"),
    ).toMatchObject({ major: 1, minor: 1, label: "1.1" });
    expect(
      allocatePolicyVersion(3, { major: 1, minor: 1 }, "MAJOR"),
    ).toMatchObject({ major: 2, minor: 0, label: "2.0" });
  });

  it("allows DRAFT/REJECTED transitions and blocks immutable states", () => {
    expect(isPolicyVersionTransitionAllowed("DRAFT", "SUBMITTED")).toBe(true);
    expect(isPolicyVersionTransitionAllowed("REJECTED", "SUBMITTED")).toBe(
      true,
    );
    expect(isPolicyVersionTransitionAllowed("APPROVED", "DRAFT")).toBe(false);
    expect(() =>
      assertPolicyVersionTransition("SUBMITTED", "DRAFT"),
    ).toThrowError(GovernanceRuleError);
  });

  it("rejects self-approval and Evidence-required approval", () => {
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "user-a",
        actorId: "user-a",
        requiresEvidence: false,
      }),
    ).toThrowError(/self-approval/i);
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "user-a",
        actorId: "user-b",
        requiresEvidence: true,
      }),
    ).toThrowError(/EVIDENCE_GATE_NOT_IMPLEMENTED|Evidence/i);
  });

  it("rejects blank content and raw HTML", () => {
    expect(() => assertPolicyContent("   ")).toThrowError(GovernanceRuleError);
    expect(() => assertPolicyContent("<script>x</script>")).toThrowError(
      GovernanceRuleError,
    );
    expect(() => assertPolicyContent("Safe markdown content")).not.toThrow();
  });

  it("keeps only safe audit metadata fields", () => {
    expect(
      safePolicyAuditMetadata({
        code: "POL-001",
        version: "1.0",
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        changedFields: ["title", "content", "status", "secret"],
      }),
    ).toEqual({
      code: "POL-001",
      version: "1.0",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      changedFields: ["status", "title"],
    });
  });

  it("rejects tenantId, unknown fields and arbitrary version strings", () => {
    expect(() =>
      createPolicySchema.parse({
        title: "A",
        content: "Body",
        tenantId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createPolicyVersionSchema.parse({
        bump: "MINOR",
        content: "Body",
        version: "9.9",
      }),
    ).toThrow();
    expect(() =>
      updatePolicyVersionSchema.parse({
        content: "Body",
        status: "APPROVED",
      }),
    ).toThrow();
  });

  it("requires rejection comments and empty archive/submit bodies", () => {
    expect(() => rejectPolicyVersionSchema.parse({})).toThrow();
    expect(rejectPolicyVersionSchema.parse({ comments: "Needs work" })).toEqual(
      { comments: "Needs work" },
    );
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ reason: "nope" })).toThrow();
  });

  it("parses list filters with approved semantics fields", () => {
    const parsed = policyListSchema.parse({
      page: "1",
      pageSize: "20",
      versionStatus: "DRAFT",
      lifecycleStatus: "ACTIVE",
    });
    expect(parsed.versionStatus).toBe("DRAFT");
    expect(parsed.lifecycleStatus).toBe("ACTIVE");
  });

  it("rejects reviewDate on or before effectiveDate", () => {
    expect(() =>
      createPolicySchema.parse({
        title: "Policy",
        content: "Body text",
        effectiveDate: "2026-08-10",
        reviewDate: "2026-08-10",
      }),
    ).toThrow();
  });
});
