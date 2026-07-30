import { describe, expect, it } from "vitest";
import {
  assertCheckpointReview,
  isReviewPeriodValid,
} from "../src/modules/checkpoints/domain.js";
import {
  assertControlImplementation,
  assertGovernanceLifecycleTransition,
  assertUniqueMappingIds,
} from "../src/modules/controls/domain.js";
import {
  formatCheckpointCode,
  formatControlCode,
  formatPolicyCode,
} from "../src/modules/governance/code-generation.js";
import {
  allocatePolicyVersion,
  assertPolicyApprovalAllowed,
  assertPolicyContent,
  assertPolicyVersionTransition,
  isPolicyVersionTransitionAllowed,
  safePolicyAuditMetadata,
} from "../src/modules/policies/domain.js";

describe("Policy lifecycle and semantic versions", () => {
  it("allows only the approved Policy Version transitions", () => {
    expect(isPolicyVersionTransitionAllowed("DRAFT", "SUBMITTED")).toBe(true);
    expect(isPolicyVersionTransitionAllowed("SUBMITTED", "APPROVED")).toBe(
      true,
    );
    expect(isPolicyVersionTransitionAllowed("SUBMITTED", "REJECTED")).toBe(
      true,
    );
    expect(isPolicyVersionTransitionAllowed("REJECTED", "SUBMITTED")).toBe(
      true,
    );
    expect(isPolicyVersionTransitionAllowed("APPROVED", "SUPERSEDED")).toBe(
      true,
    );
    expect(isPolicyVersionTransitionAllowed("APPROVED", "OBSOLETE")).toBe(true);
    expect(() =>
      assertPolicyVersionTransition("SUPERSEDED", "DRAFT"),
    ).toThrowError(/cannot transition/);
    expect(() =>
      assertPolicyVersionTransition("DRAFT", "APPROVED"),
    ).toThrowError(/cannot transition/);
  });

  it("allocates 1.0 first and server-controlled major or minor bumps", () => {
    expect(allocatePolicyVersion(1, null, "MINOR")).toEqual({
      sequence: 1,
      major: 1,
      minor: 0,
      label: "1.0",
    });
    expect(allocatePolicyVersion(2, { major: 1, minor: 0 }, "MINOR")).toEqual({
      sequence: 2,
      major: 1,
      minor: 1,
      label: "1.1",
    });
    expect(allocatePolicyVersion(3, { major: 1, minor: 1 }, "MAJOR")).toEqual({
      sequence: 3,
      major: 2,
      minor: 0,
      label: "2.0",
    });
  });

  it("prohibits self-approval and fails closed when Evidence is required", () => {
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "user-1",
        actorId: "user-1",
        requiresEvidence: false,
      }),
    ).toThrowError(/self-approval/);
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "user-1",
        actorId: "user-2",
        requiresEvidence: true,
      }),
    ).toThrowError(/Evidence milestone/);
  });

  it("accepts bounded Markdown and prohibits raw HTML", () => {
    expect(() =>
      assertPolicyContent("# Policy\n\nSafe **Markdown**."),
    ).not.toThrow();
    expect(() => assertPolicyContent("<section>unsafe</section>")).toThrowError(
      /Raw HTML/,
    );
    expect(() => assertPolicyContent("<!-- unsafe comment -->")).toThrowError(
      /Raw HTML/,
    );
  });

  it("builds audit metadata without Policy content or free text", () => {
    const metadata = safePolicyAuditMetadata({
      code: "POL-001",
      version: "1.0",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      changedFields: ["content", "purpose", "ownerId", "ownerId", "status"],
    });
    expect(metadata).toEqual({
      code: "POL-001",
      version: "1.0",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      changedFields: ["ownerId", "status"],
    });
    expect(JSON.stringify(metadata)).not.toContain("content");
    expect(JSON.stringify(metadata)).not.toContain("purpose");
  });
});

describe("Control lifecycle and mappings", () => {
  it("keeps archive terminal while allowing active/inactive transitions", () => {
    expect(() =>
      assertGovernanceLifecycleTransition("ACTIVE", "INACTIVE"),
    ).not.toThrow();
    expect(() =>
      assertGovernanceLifecycleTransition("INACTIVE", "ACTIVE"),
    ).not.toThrow();
    expect(() =>
      assertGovernanceLifecycleTransition("ARCHIVED", "ACTIVE"),
    ).toThrowError(/cannot transition/);
  });

  it("requires notes for NOT_APPLICABLE implementation state", () => {
    expect(() =>
      assertControlImplementation("NOT_APPLICABLE", " "),
    ).toThrowError(/require implementation notes/);
    expect(() =>
      assertControlImplementation("NOT_APPLICABLE", "Outside the scope."),
    ).not.toThrow();
  });

  it("rejects duplicate mapping identifiers", () => {
    expect(() =>
      assertUniqueMappingIds(["one", "two", "one"], "frameworkIds"),
    ).toThrowError(/duplicate mapping/);
  });
});

describe("Checkpoint review validation", () => {
  it.each([
    ["DAILY", "2026-07-30"],
    ["WEEKLY", "2026-W31"],
    ["MONTHLY", "2026-07"],
    ["QUARTERLY", "2026-Q3"],
    ["HALF_YEARLY", "2026-H2"],
    ["ANNUAL", "2026"],
    ["CONTINUOUS", "2026-07-30#OBS-001"],
    ["PER_EVENT", "2026-07-30#EVENT-001"],
    ["ONE_TIME", "ONE-TIME"],
  ] as const)("accepts the %s canonical review period", (frequency, period) => {
    expect(isReviewPeriodValid(frequency, period)).toBe(true);
  });

  it("rejects impossible dates and frequency-mismatched periods", () => {
    expect(isReviewPeriodValid("DAILY", "2026-02-30")).toBe(false);
    expect(isReviewPeriodValid("WEEKLY", "2021-W53")).toBe(false);
    expect(isReviewPeriodValid("MONTHLY", "2026-Q3")).toBe(false);
    expect(isReviewPeriodValid("PER_EVENT", "2026-07-30#lowercase")).toBe(
      false,
    );
  });

  it("requires observations for PARTIAL and FAIL", () => {
    expect(() =>
      assertCheckpointReview({
        frequency: "MONTHLY",
        reviewPeriod: "2026-07",
        outcome: "FAIL",
        observation: "",
        reviewDate: "2026-07-30",
      }),
    ).toThrowError(/require an observation/);
  });

  it("requires the next review date to follow the review date", () => {
    expect(() =>
      assertCheckpointReview({
        frequency: "MONTHLY",
        reviewPeriod: "2026-07",
        outcome: "PASS",
        reviewDate: "2026-07-30",
        nextReviewDate: "2026-07-01",
      }),
    ).toThrowError(/after reviewDate/);
  });
});

describe("governance code formatting", () => {
  it("reuses the existing positive tenant-counter pattern", () => {
    expect(formatPolicyCode(1)).toBe("POL-001");
    expect(formatControlCode(12)).toBe("CTL-012");
    expect(formatCheckpointCode(1234)).toBe("CHK-1234");
    expect(() => formatPolicyCode(0)).toThrowError(/positive safe integer/);
  });
});
