import { describe, expect, it } from "vitest";
import {
  evaluateEvidenceEligibility,
  isExpiryValid,
  isIssueDateValid,
  isInvalidatedBySuccessorLifecycle,
  isApprovedLifecycle,
  utcDateString,
  coverageIncompleteReason,
} from "../src/modules/evidence/eligibility.js";
import { EvidenceGateService } from "../src/modules/evidence/evidence-gate-service.js";
import { hasEvidenceFile } from "../src/modules/evidence/domain.js";

const asOf = "2026-08-01";
const completeFile = {
  storageKey: "t/e/file",
  contentSha256: "a".repeat(64),
  byteSize: 12,
};

describe("Evidence gate eligibility", () => {
  it("accepts APPROVED lifecycle only", () => {
    expect(isApprovedLifecycle("APPROVED")).toBe(true);
    for (const status of [
      "DRAFT",
      "SUBMITTED",
      "REJECTED",
      "ARCHIVED",
    ] as const) {
      expect(isApprovedLifecycle(status)).toBe(false);
      expect(
        evaluateEvidenceEligibility(
          {
            lifecycleStatus: status,
            file: completeFile,
            linkIsActive: true,
          },
          asOf,
        ).eligible,
      ).toBe(false);
    }
  });

  it("requires complete file metadata", () => {
    expect(hasEvidenceFile(completeFile)).toBe(true);
    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: { storageKey: null, contentSha256: "a".repeat(64), byteSize: 1 },
          linkIsActive: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_FILE_REQUIRED");
    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: {
            storageKey: "k",
            contentSha256: null,
            byteSize: 1,
          },
          linkIsActive: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_FILE_REQUIRED");
    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: {
            storageKey: "k",
            contentSha256: "a".repeat(64),
            byteSize: 0,
          },
          linkIsActive: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_FILE_REQUIRED");
  });

  it("applies UTC issue and expiry boundaries", () => {
    expect(isIssueDateValid(null, asOf)).toBe(true);
    expect(isIssueDateValid("2026-08-01", asOf)).toBe(true);
    expect(isIssueDateValid("2026-07-31", asOf)).toBe(true);
    expect(isIssueDateValid("2026-08-02", asOf)).toBe(false);

    expect(isExpiryValid(null, asOf)).toBe(true);
    expect(isExpiryValid("2026-08-01", asOf)).toBe(true);
    expect(isExpiryValid("2026-08-02", asOf)).toBe(true);
    expect(isExpiryValid("2026-07-31", asOf)).toBe(false);

    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: completeFile,
          issueDate: "2026-08-02",
          linkIsActive: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_NOT_YET_VALID");
    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: completeFile,
          expiresAt: "2026-07-31",
          linkIsActive: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_EXPIRED");
  });

  it("requires an active link and invalidating supersession rules", () => {
    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: completeFile,
          linkIsActive: false,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_LINK_REQUIRED");

    expect(isInvalidatedBySuccessorLifecycle("DRAFT")).toBe(false);
    expect(isInvalidatedBySuccessorLifecycle("SUBMITTED")).toBe(false);
    expect(isInvalidatedBySuccessorLifecycle("REJECTED")).toBe(false);
    expect(isInvalidatedBySuccessorLifecycle("APPROVED")).toBe(true);
    expect(isInvalidatedBySuccessorLifecycle("ARCHIVED")).toBe(true);

    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: completeFile,
          linkIsActive: true,
          hasInvalidatingSuccessor: true,
        },
        asOf,
      ).reason,
    ).toBe("EVIDENCE_SUPERSEDED");

    expect(
      evaluateEvidenceEligibility(
        {
          lifecycleStatus: "APPROVED",
          file: completeFile,
          linkIsActive: true,
          hasInvalidatingSuccessor: false,
          issueDate: null,
          expiresAt: null,
        },
        asOf,
      ).eligible,
    ).toBe(true);
  });

  it("short-circuits boolean KPI gate and maps coverage reason", () => {
    const gate = new EvidenceGateService();
    expect(gate.assertSatisfied(false)).toBe(true);
    expect(() => gate.assertSatisfied(true)).toThrowError(
      expect.objectContaining({
        status: 501,
        code: "EVIDENCE_GATE_NOT_IMPLEMENTED",
      }),
    );
    expect(coverageIncompleteReason()).toBe("EVIDENCE_COVERAGE_INCOMPLETE");
    expect(utcDateString(new Date("2026-08-01T15:00:00.000Z"))).toBe(
      "2026-08-01",
    );
  });

  it("checkpoint gate short-circuits when evidence not required", async () => {
    const gate = new EvidenceGateService();
    const result = await gate.assertCheckpointReviewSatisfied({
      tenantId: "00000000-0000-4000-8000-000000000001",
      checkpointId: "00000000-0000-4000-8000-000000000002",
      evidenceRequired: false,
    });
    expect(result).toEqual({ satisfied: true, qualifyingCount: 0 });
  });
});
