import { describe, expect, it } from "vitest";
import { GovernanceRuleError } from "../src/modules/governance/domain-error.js";
import { AppError } from "../src/common/errors/app-error.js";
import {
  assertCheckpointReview,
  assertCheckpointTextContent,
  assertGovernanceLifecycleTransition,
  assertSameStateCheckpointLifecycleForbidden,
  compareCheckpointReviewOrder,
  isReviewPeriodValid,
  safeCheckpointAuditMetadata,
} from "../src/modules/checkpoints/domain.js";
import {
  checkpointListSchema,
  createCheckpointReviewSchema,
  createCheckpointSchema,
  emptyBodySchema,
  updateCheckpointSchema,
} from "../src/modules/checkpoints/validators.js";
import { mapCheckpointGovernanceErrorForTest } from "../src/modules/checkpoints/service.js";

describe("Checkpoint domain and validators", () => {
  it("rejects tenantId, code, lifecycle and unknown create fields", () => {
    const base = {
      controlId: "00000000-0000-4000-8000-000000000001",
      title: "Checkpoint A",
      expectedResult: "Pass condition",
      verificationFrequency: "MONTHLY" as const,
    };
    expect(() =>
      createCheckpointSchema.parse({ ...base, tenantId: base.controlId }),
    ).toThrow();
    expect(() =>
      createCheckpointSchema.parse({ ...base, code: "CHK-001" }),
    ).toThrow();
    expect(() =>
      createCheckpointSchema.parse({ ...base, lifecycleStatus: "ACTIVE" }),
    ).toThrow();
    expect(() =>
      createCheckpointSchema.parse({ ...base, unexpected: true }),
    ).toThrow();
    expect(() =>
      createCheckpointSchema.parse({
        ...base,
        latestReviewId: base.controlId,
      }),
    ).toThrow();
  });

  it("requires controlId, title, expectedResult and verificationFrequency", () => {
    expect(() =>
      createCheckpointSchema.parse({
        title: "A",
        expectedResult: "Pass",
        verificationFrequency: "MONTHLY",
      }),
    ).toThrow();
    expect(() =>
      createCheckpointSchema.parse({
        controlId: "00000000-0000-4000-8000-000000000001",
        expectedResult: "Pass",
        verificationFrequency: "MONTHLY",
      }),
    ).toThrow();
    expect(
      createCheckpointSchema.parse({
        controlId: "00000000-0000-4000-8000-000000000001",
        title: "Checkpoint A",
        expectedResult: "Pass condition",
        verificationFrequency: "MONTHLY",
      }),
    ).toMatchObject({ evidenceRequired: false });
  });

  it("rejects actor fields, reviewer fields and empty update bodies", () => {
    expect(() =>
      updateCheckpointSchema.parse({
        title: "Updated",
        createdById: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      updateCheckpointSchema.parse({
        title: "Updated",
        controlId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() => updateCheckpointSchema.parse({})).toThrow();
  });

  it("requires strict empty lifecycle bodies", () => {
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ reason: "x" })).toThrow();
  });

  it("rejects reviewer override fields on Review create", () => {
    const base = {
      reviewPeriod: "2026-07",
      reviewDate: "2026-07-15",
      outcome: "PASS" as const,
    };
    expect(createCheckpointReviewSchema.parse(base)).toMatchObject(base);
    expect(() =>
      createCheckpointReviewSchema.parse({
        ...base,
        reviewerId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createCheckpointReviewSchema.parse({
        ...base,
        reviewedById: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createCheckpointReviewSchema.parse({
        ...base,
        actorId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createCheckpointReviewSchema.parse({
        ...base,
        submittedById: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
  });

  it("enforces observation and recommendation limits", () => {
    expect(() =>
      createCheckpointReviewSchema.parse({
        reviewPeriod: "2026-07",
        reviewDate: "2026-07-15",
        outcome: "PASS",
        observation: "x".repeat(10_001),
      }),
    ).toThrow();
    expect(() =>
      createCheckpointReviewSchema.parse({
        reviewPeriod: "2026-07",
        reviewDate: "2026-07-15",
        outcome: "PASS",
        recommendation: "x".repeat(5_001),
      }),
    ).toThrow();
  });

  it("validates review periods for each frequency", () => {
    expect(isReviewPeriodValid("MONTHLY", "2026-07")).toBe(true);
    expect(isReviewPeriodValid("MONTHLY", "2026-13")).toBe(false);
    expect(isReviewPeriodValid("WEEKLY", "2026-W01")).toBe(true);
    expect(isReviewPeriodValid("DAILY", "2026-02-30")).toBe(false);
    expect(isReviewPeriodValid("ONE_TIME", "ONE-TIME")).toBe(true);
    expect(isReviewPeriodValid("CONTINUOUS", "2026-07-01#EVENT1")).toBe(true);
    expect(() =>
      assertCheckpointReview({
        frequency: "MONTHLY",
        reviewPeriod: "bad",
        outcome: "PASS",
        reviewDate: "2026-07-15",
      }),
    ).toThrowError(/reviewPeriod/);
  });

  it("requires observations for PARTIAL and FAIL", () => {
    expect(() =>
      assertCheckpointReview({
        frequency: "MONTHLY",
        reviewPeriod: "2026-07",
        outcome: "FAIL",
        observation: "x",
        reviewDate: "2026-07-15",
      }),
    ).toThrowError(/observation/);
    expect(() =>
      assertCheckpointReview({
        frequency: "MONTHLY",
        reviewPeriod: "2026-07",
        outcome: "PARTIAL",
        observation: "Needs follow-up",
        reviewDate: "2026-07-15",
      }),
    ).not.toThrow();
  });

  it("blocks same-state lifecycle and archived transitions", () => {
    expect(() =>
      assertSameStateCheckpointLifecycleForbidden("ACTIVE", "ACTIVE"),
    ).toThrowError(/already ACTIVE/);
    expect(() =>
      assertSameStateCheckpointLifecycleForbidden("ARCHIVED", "ACTIVE"),
    ).toThrowError(/Archived/);
    expect(() =>
      assertGovernanceLifecycleTransition("ARCHIVED", "ACTIVE"),
    ).toThrowError(GovernanceRuleError);
    expect(() =>
      assertGovernanceLifecycleTransition("INACTIVE", "ACTIVE"),
    ).not.toThrow();
  });

  it("orders latest reviews by submittedAt then UUID text", () => {
    const earlier = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      submittedAt: new Date("2026-07-01T10:00:00.000Z"),
    };
    const later = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submittedAt: new Date("2026-07-01T11:00:00.000Z"),
    };
    expect(compareCheckpointReviewOrder(earlier, later)).toBe(-1);
    const tieLow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submittedAt: new Date("2026-07-01T10:00:00.000Z"),
    };
    const tieHigh = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      submittedAt: new Date("2026-07-01T10:00:00.000Z"),
    };
    expect(compareCheckpointReviewOrder(tieLow, tieHigh)).toBe(-1);
    expect(compareCheckpointReviewOrder(tieHigh, tieLow)).toBe(1);
  });

  it("forbids raw HTML in Checkpoint text fields", () => {
    expect(() =>
      assertCheckpointTextContent("description", "<script>x</script>"),
    ).toThrowError(/HTML/);
    expect(() =>
      assertCheckpointTextContent("expectedResult", "Plain text result"),
    ).not.toThrow();
  });

  it("keeps audit metadata free of observation and recommendation", () => {
    const metadata = safeCheckpointAuditMetadata({
      code: "CHK-001",
      reviewId: "00000000-0000-4000-8000-000000000099",
      reviewPeriod: "2026-07",
      outcome: "PASS",
      previousLatestReviewId: null,
      latestReviewId: "00000000-0000-4000-8000-000000000099",
      changedFields: ["title", "description", "hacked"],
    });
    expect(metadata).toEqual({
      code: "CHK-001",
      changedFields: ["description", "title"],
      reviewId: "00000000-0000-4000-8000-000000000099",
      reviewPeriod: "2026-07",
      outcome: "PASS",
      previousLatestReviewId: null,
      latestReviewId: "00000000-0000-4000-8000-000000000099",
    });
    expect(JSON.stringify(metadata)).not.toMatch(/observation|recommendation/i);
  });

  it("parses list filters and rejects unknown query keys", () => {
    expect(
      checkpointListSchema.parse({
        controlId: "00000000-0000-4000-8000-000000000001",
        hasReviews: "true",
        evidenceRequired: "false",
        latestOutcome: "PASS",
        page: "1",
        pageSize: "10",
      }),
    ).toMatchObject({
      hasReviews: true,
      evidenceRequired: false,
      latestOutcome: "PASS",
      page: 1,
      pageSize: 10,
    });
    expect(() =>
      checkpointListSchema.parse({ unknownFilter: "x" }),
    ).toThrow();
  });

  it("maps domain errors to AppError codes", () => {
    const invalid = mapCheckpointGovernanceErrorForTest(
      new GovernanceRuleError(
        "CHECKPOINT_INVALID_STATE",
        "Checkpoint is already ACTIVE",
      ),
    );
    expect(invalid).toBeInstanceOf(AppError);
    expect((invalid as AppError).code).toBe("CHECKPOINT_INVALID_STATE");
    expect((invalid as AppError).status).toBe(409);

    const reviewInvalid = mapCheckpointGovernanceErrorForTest(
      new GovernanceRuleError(
        "CHECKPOINT_REVIEW_PERIOD_INVALID",
        "bad period",
      ),
    );
    expect((reviewInvalid as AppError).code).toBe("CHECKPOINT_REVIEW_INVALID");
    expect((reviewInvalid as AppError).status).toBe(400);
  });
});
