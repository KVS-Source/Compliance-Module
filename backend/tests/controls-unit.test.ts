import { describe, expect, it } from "vitest";
import { GovernanceRuleError } from "../src/modules/governance/domain-error.js";
import { AppError } from "../src/common/errors/app-error.js";
import {
  assertControlArchiveAllowed,
  assertControlImplementation,
  assertGovernanceLifecycleTransition,
  assertSameStateLifecycleForbidden,
  assertUniqueActiveControlPolicyMappings,
  assertUniqueMappingIds,
  mappingIdSetsEqual,
  safeControlAuditMetadata,
} from "../src/modules/controls/domain.js";
import {
  controlListSchema,
  createControlSchema,
  emptyBodySchema,
  replaceControlFrameworkRulesSchema,
  replaceControlFrameworksSchema,
  replaceControlPolicyVersionsSchema,
  updateControlSchema,
} from "../src/modules/controls/validators.js";
import { mapControlGovernanceErrorForTest } from "../src/modules/controls/service.js";

describe("Control domain and validators", () => {
  it("rejects tenantId, code, lifecycle and unknown create fields", () => {
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
        tenantId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
        code: "CTL-001",
      }),
    ).toThrow();
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
        lifecycleStatus: "ACTIVE",
      }),
    ).toThrow();
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
        unexpected: true,
      }),
    ).toThrow();
  });

  it("requires objective and verificationMethod on create", () => {
    expect(() =>
      createControlSchema.parse({
        title: "A",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
      }),
    ).toThrow();
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
      }),
    ).toThrow();
  });

  it("rejects actor fields and empty update bodies", () => {
    expect(() =>
      updateControlSchema.parse({
        title: "Updated",
        createdById: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() => updateControlSchema.parse({})).toThrow();
  });

  it("requires strict empty lifecycle bodies", () => {
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ reason: "x" })).toThrow();
  });

  it("enforces NOT_APPLICABLE notes and review-date ordering", () => {
    expect(() =>
      assertControlImplementation("NOT_APPLICABLE", "x"),
    ).toThrowError(GovernanceRuleError);
    expect(() =>
      assertControlImplementation("NOT_APPLICABLE", "ok"),
    ).not.toThrow();
    expect(() =>
      createControlSchema.parse({
        title: "A",
        objective: "Objective text",
        implementationStatus: "IMPLEMENTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Inspect records",
        lastReviewDate: "2026-08-01",
        nextReviewDate: "2026-07-01",
      }),
    ).toThrow(/nextReviewDate/);
  });

  it("blocks same-state lifecycle and archived transitions", () => {
    expect(() =>
      assertSameStateLifecycleForbidden("ACTIVE", "ACTIVE"),
    ).toThrowError(/already ACTIVE/);
    expect(() =>
      assertSameStateLifecycleForbidden("ARCHIVED", "ACTIVE"),
    ).toThrowError(/Archived/);
    expect(() =>
      assertGovernanceLifecycleTransition("ARCHIVED", "ACTIVE"),
    ).toThrowError(GovernanceRuleError);
    expect(() =>
      assertGovernanceLifecycleTransition("INACTIVE", "ACTIVE"),
    ).not.toThrow();
  });

  it("blocks archive while active Checkpoints exist", () => {
    expect(() => assertControlArchiveAllowed("ARCHIVED", 1)).toThrowError(
      /active Checkpoints/,
    );
    expect(() => assertControlArchiveAllowed("ARCHIVED", 0)).not.toThrow();
  });

  it("deduplicates mapping IDs and rejects stable-Policy duplicates", () => {
    expect(() =>
      assertUniqueMappingIds(["a", "a"], "policyVersionIds"),
    ).toThrowError(GovernanceRuleError);
    expect(() =>
      assertUniqueActiveControlPolicyMappings([
        { controlId: "c1", policyId: "p1", isActive: true },
        { controlId: "c1", policyId: "p1", isActive: true },
      ]),
    ).toThrowError(GovernanceRuleError);
    expect(mappingIdSetsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(mappingIdSetsEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("keeps only safe audit metadata fields", () => {
    expect(
      safeControlAuditMetadata({
        code: "CTL-001",
        changedFields: ["title", "objective", "secret", "ownerId"],
        mappingType: "POLICY_VERSION",
        addedIds: ["b", "a"],
        removedIds: ["c"],
        activeCount: 2,
      }),
    ).toEqual({
      code: "CTL-001",
      changedFields: ["objective", "ownerId", "title"],
      mappingType: "POLICY_VERSION",
      addedIds: ["a", "b"],
      removedIds: ["c"],
      activeCount: 2,
    });
  });

  it("parses list filters and mapping replacement bodies", () => {
    const parsed = controlListSchema.parse({
      page: "2",
      pageSize: "10",
      q: " ctl ",
      lifecycleStatus: "ACTIVE",
      requiresEvidence: "true",
      policyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.q).toBe("ctl");
    expect(parsed.requiresEvidence).toBe(true);
    expect(
      replaceControlPolicyVersionsSchema.parse({
        policyVersionIds: ["00000000-0000-4000-8000-000000000001"],
      }).policyVersionIds,
    ).toHaveLength(1);
    expect(
      replaceControlFrameworksSchema.parse({ frameworkIds: [] }).frameworkIds,
    ).toEqual([]);
    expect(
      replaceControlFrameworkRulesSchema.parse({ frameworkRuleIds: [] })
        .frameworkRuleIds,
    ).toEqual([]);
  });

  it("maps domain errors to safe AppError codes", () => {
    const archive = mapControlGovernanceErrorForTest(
      new GovernanceRuleError(
        "CONTROL_ACTIVE_CHECKPOINTS_EXIST",
        "blocked",
      ),
    );
    expect(archive).toBeInstanceOf(AppError);
    expect((archive as AppError).code).toBe("CONTROL_HAS_ACTIVE_CHECKPOINTS");
    expect((archive as AppError).status).toBe(409);

    const sameState = mapControlGovernanceErrorForTest(
      new GovernanceRuleError("CONTROL_INVALID_STATE", "already ACTIVE"),
    );
    expect((sameState as AppError).code).toBe("CONTROL_INVALID_STATE");

    const mapping = mapControlGovernanceErrorForTest(
      new GovernanceRuleError("CONTROL_MAPPING_DUPLICATE", "dup"),
    );
    expect((mapping as AppError).code).toBe("CONTROL_MAPPING_INVALID");
    expect((mapping as AppError).status).toBe(400);
  });
});
