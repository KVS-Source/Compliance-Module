import { describe, expect, it } from "vitest";
import {
  assertCheckpointLinkTargetActive,
  assertControlLinkTargetActive,
  assertEvidenceArchiveAllowed,
  assertEvidenceLinkMutable,
  assertEvidenceMetadataMutable,
  assertEvidenceReviewDecision,
  assertEvidenceSelfReviewAllowed,
  assertEvidenceSubmitAllowed,
  assertEvidenceSupersedeTargetAllowed,
  assertEvidenceTransition,
  hasEvidenceFile,
  isEvidenceArchiveAllowed,
  isEvidenceLinkMutable,
  isEvidenceMetadataMutable,
  isEvidenceTransitionAllowed,
  isLinkTargetActive,
  safeEvidenceAuditMetadata,
} from "../src/modules/evidence/domain.js";
import {
  checkpointLinkDto,
  controlLinkDto,
} from "../src/modules/evidence/service.js";
import {
  createEvidenceSchema,
  emptyBodySchema,
  evidenceCheckpointLinkParamsSchema,
  evidenceControlLinkParamsSchema,
  evidenceLinkListSchema,
  evidenceListSchema,
  updateEvidenceSchema,
} from "../src/modules/evidence/validators.js";
import {
  formatEvidenceCode,
  formatPolicyCode,
} from "../src/modules/governance/code-generation.js";
import {
  buildContentDisposition,
  sanitizeEvidenceFilename,
} from "../src/modules/evidence/file-types.js";

describe("Evidence domain and validators", () => {
  it("allows only approved lifecycle transitions", () => {
    expect(isEvidenceTransitionAllowed("DRAFT", "SUBMITTED")).toBe(true);
    expect(isEvidenceTransitionAllowed("DRAFT", "ARCHIVED")).toBe(true);
    expect(isEvidenceTransitionAllowed("SUBMITTED", "APPROVED")).toBe(true);
    expect(isEvidenceTransitionAllowed("SUBMITTED", "REJECTED")).toBe(true);
    expect(isEvidenceTransitionAllowed("APPROVED", "ARCHIVED")).toBe(true);
    expect(isEvidenceTransitionAllowed("REJECTED", "ARCHIVED")).toBe(true);
    expect(isEvidenceTransitionAllowed("REJECTED", "SUBMITTED")).toBe(false);
    expect(isEvidenceTransitionAllowed("ARCHIVED", "DRAFT")).toBe(false);
    expect(() => assertEvidenceTransition("SUBMITTED", "ARCHIVED")).toThrow(
      /cannot transition/,
    );
  });

  it("restricts metadata mutation to DRAFT and REJECTED", () => {
    expect(isEvidenceMetadataMutable("DRAFT")).toBe(true);
    expect(isEvidenceMetadataMutable("REJECTED")).toBe(true);
    expect(isEvidenceMetadataMutable("SUBMITTED")).toBe(false);
    expect(isEvidenceMetadataMutable("APPROVED")).toBe(false);
    expect(isEvidenceMetadataMutable("ARCHIVED")).toBe(false);
    expect(() => assertEvidenceMetadataMutable("ARCHIVED")).toThrow(
      /Archived/,
    );
    expect(() => assertEvidenceMetadataMutable("SUBMITTED")).toThrow(
      /cannot be modified/,
    );
  });

  it("allows archive from DRAFT, REJECTED and APPROVED only", () => {
    expect(isEvidenceArchiveAllowed("DRAFT")).toBe(true);
    expect(isEvidenceArchiveAllowed("REJECTED")).toBe(true);
    expect(isEvidenceArchiveAllowed("APPROVED")).toBe(true);
    expect(isEvidenceArchiveAllowed("SUBMITTED")).toBe(false);
    expect(() => assertEvidenceArchiveAllowed("SUBMITTED")).toThrow(
      /cannot be archived/,
    );
    expect(() => assertEvidenceArchiveAllowed("ARCHIVED")).toThrow(
      /already archived/,
    );
  });

  it("allows superseding only REJECTED or ARCHIVED prior Evidence", () => {
    expect(() =>
      assertEvidenceSupersedeTargetAllowed("REJECTED"),
    ).not.toThrow();
    expect(() =>
      assertEvidenceSupersedeTargetAllowed("ARCHIVED"),
    ).not.toThrow();
    expect(() => assertEvidenceSupersedeTargetAllowed("DRAFT")).toThrow(
      /superseded/,
    );
    expect(() => assertEvidenceSupersedeTargetAllowed("APPROVED")).toThrow(
      /superseded/,
    );
  });

  it("requires storageKey, contentSha256 and positive byteSize for hasFile", () => {
    expect(
      hasEvidenceFile({
        storageKey: "t/e/file",
        contentSha256: "a".repeat(64),
        byteSize: 12,
      }),
    ).toBe(true);
    expect(
      hasEvidenceFile({
        storageKey: null,
        contentSha256: "a".repeat(64),
        byteSize: 12,
      }),
    ).toBe(false);
    expect(
      hasEvidenceFile({
        storageKey: "t/e/file",
        contentSha256: null,
        byteSize: 12,
      }),
    ).toBe(false);
    expect(
      hasEvidenceFile({
        storageKey: "t/e/file",
        contentSha256: "a".repeat(64),
        byteSize: 0,
      }),
    ).toBe(false);
  });

  it("fails closed on submit without a file", () => {
    expect(() =>
      assertEvidenceSubmitAllowed({
        lifecycleStatus: "DRAFT",
        file: {
          storageKey: null,
          contentSha256: null,
          byteSize: null,
        },
      }),
    ).toThrow(/file has been uploaded/);
    expect(() =>
      assertEvidenceSubmitAllowed({
        lifecycleStatus: "REJECTED",
        file: {
          storageKey: "k",
          contentSha256: "a".repeat(64),
          byteSize: 1,
        },
      }),
    ).toThrow(/Only DRAFT/);
  });

  it("enforces self-review and reject reason rules", () => {
    expect(() =>
      assertEvidenceSelfReviewAllowed({
        actorId: "u1",
        createdById: "u1",
        uploadedById: null,
      }),
    ).toThrow(/creator/);
    expect(() =>
      assertEvidenceSelfReviewAllowed({
        actorId: "u2",
        createdById: "u1",
        uploadedById: "u2",
      }),
    ).toThrow(/uploader/);
    expect(() =>
      assertEvidenceReviewDecision({
        lifecycleStatus: "SUBMITTED",
        actorId: "reviewer",
        createdById: "creator",
        uploadedById: null,
        decision: "REJECTED",
        reason: "x",
      }),
    ).toThrow(/reason/);
    expect(() =>
      assertEvidenceReviewDecision({
        lifecycleStatus: "SUBMITTED",
        actorId: "reviewer",
        createdById: "creator",
        uploadedById: null,
        decision: "APPROVED",
        reason: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertEvidenceReviewDecision({
        lifecycleStatus: "DRAFT",
        actorId: "reviewer",
        createdById: "creator",
        uploadedById: null,
        decision: "APPROVED",
        reason: null,
      }),
    ).toThrow(/SUBMITTED/);
  });

  it("allows Control and Checkpoint link mutations only for DRAFT Evidence", () => {
    expect(isEvidenceLinkMutable("DRAFT")).toBe(true);
    expect(isEvidenceLinkMutable("SUBMITTED")).toBe(false);
    expect(isEvidenceLinkMutable("APPROVED")).toBe(false);
    expect(isEvidenceLinkMutable("REJECTED")).toBe(false);
    expect(isEvidenceLinkMutable("ARCHIVED")).toBe(false);
    expect(() => assertEvidenceLinkMutable("DRAFT")).not.toThrow();
    expect(() => assertEvidenceLinkMutable("SUBMITTED")).toThrow(/Only DRAFT/);
    expect(() => assertEvidenceLinkMutable("APPROVED")).toThrow(/Only DRAFT/);
    expect(() => assertEvidenceLinkMutable("REJECTED")).toThrow(/Only DRAFT/);
    expect(() => assertEvidenceLinkMutable("ARCHIVED")).toThrow(/Archived/);
  });

  it("accepts only ACTIVE Control and Checkpoint link targets", () => {
    expect(isLinkTargetActive("ACTIVE")).toBe(true);
    expect(isLinkTargetActive("INACTIVE")).toBe(false);
    expect(isLinkTargetActive("ARCHIVED")).toBe(false);
    expect(() => assertControlLinkTargetActive("ACTIVE")).not.toThrow();
    expect(() => assertControlLinkTargetActive("INACTIVE")).toThrow(
      /Only ACTIVE Controls/,
    );
    expect(() => assertControlLinkTargetActive("ARCHIVED")).toThrow(
      /Only ACTIVE Controls/,
    );
    expect(() => assertCheckpointLinkTargetActive("ACTIVE")).not.toThrow();
    expect(() => assertCheckpointLinkTargetActive("INACTIVE")).toThrow(
      /Only ACTIVE Checkpoints/,
    );
    expect(() => assertCheckpointLinkTargetActive("ARCHIVED")).toThrow(
      /Only ACTIVE Checkpoints/,
    );
  });

  it("validates empty link bodies and UUID path params", () => {
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ reason: "no" })).toThrow();
    expect(
      evidenceControlLinkParamsSchema.parse({
        evidenceId: "11111111-1111-4111-8111-111111111111",
        controlId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      evidenceId: "11111111-1111-4111-8111-111111111111",
      controlId: "22222222-2222-4222-8222-222222222222",
    });
    expect(() =>
      evidenceControlLinkParamsSchema.parse({
        evidenceId: "not-a-uuid",
        controlId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow();
    expect(
      evidenceCheckpointLinkParamsSchema.parse({
        evidenceId: "11111111-1111-4111-8111-111111111111",
        checkpointId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toMatchObject({
      checkpointId: "33333333-3333-4333-8333-333333333333",
    });
    expect(evidenceLinkListSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("maps link DTOs without storage or description leakage", () => {
    const linkedAt = new Date("2026-08-01T12:00:00.000Z");
    const updatedAt = new Date("2026-08-01T13:00:00.000Z");
    const controlDto = controlLinkDto({
      id: "link-1",
      tenantId: "t1",
      evidenceId: "e1",
      controlId: "c1",
      isActive: true,
      linkReason: "must-not-appear",
      createdById: "u1",
      updatedById: "u1",
      createdAt: linkedAt,
      updatedAt,
      control: {
        id: "c1",
        code: "CTL-001",
        title: "Control title",
        lifecycleStatus: "ACTIVE",
      },
      createdBy: { id: "u1", code: "USR-001", fullName: "Actor One" },
      updatedBy: { id: "u1", code: "USR-001", fullName: "Actor One" },
    } as never);
    expect(controlDto).toEqual({
      id: "link-1",
      isActive: true,
      control: {
        id: "c1",
        code: "CTL-001",
        title: "Control title",
        lifecycleStatus: "ACTIVE",
      },
      linkedAt,
      linkedBy: { id: "u1", code: "USR-001", name: "Actor One" },
      updatedAt,
      updatedBy: { id: "u1", code: "USR-001", name: "Actor One" },
    });
    expect(controlDto).not.toHaveProperty("storageKey");
    expect(controlDto).not.toHaveProperty("linkReason");
    expect(controlDto).not.toHaveProperty("description");

    const checkpointDto = checkpointLinkDto({
      id: "link-2",
      tenantId: "t1",
      evidenceId: "e1",
      checkpointId: "cp1",
      isActive: true,
      linkReason: null,
      createdById: "u1",
      updatedById: "u1",
      createdAt: linkedAt,
      updatedAt,
      checkpoint: {
        id: "cp1",
        code: "CP-001",
        title: "Checkpoint title",
        lifecycleStatus: "ACTIVE",
        controlId: "c1",
      },
      createdBy: { id: "u1", code: "USR-001", fullName: "Actor One" },
      updatedBy: { id: "u1", code: "USR-001", fullName: "Actor One" },
    } as never);
    expect(checkpointDto.checkpoint).toMatchObject({
      id: "cp1",
      controlId: "c1",
      lifecycleStatus: "ACTIVE",
    });
    expect(checkpointDto).not.toHaveProperty("storageKey");
  });

  it("allowlists safe audit metadata fields", () => {
    const metadata = safeEvidenceAuditMetadata({
      code: "EVD-001",
      lifecycleStatus: "DRAFT",
      changedFields: ["title", "description", "ownerId", "storageKey"],
      hasFile: false,
      linkId: "link-1",
      controlId: "c1",
      controlCode: "CTL-001",
      isActive: true,
      reactivated: true,
    });
    expect(metadata).toEqual({
      code: "EVD-001",
      lifecycleStatus: "DRAFT",
      changedFields: ["ownerId", "title"],
      hasFile: false,
      linkId: "link-1",
      controlId: "c1",
      controlCode: "CTL-001",
      isActive: true,
      reactivated: true,
    });
    expect(metadata).not.toHaveProperty("description");
    expect(metadata).not.toHaveProperty("storageKey");
    expect(metadata).not.toHaveProperty("linkReason");
    const base = safeEvidenceAuditMetadata({
      code: "EVD-001",
      lifecycleStatus: "DRAFT",
      changedFields: ["title", "description", "ownerId", "storageKey"],
      hasFile: false,
    });
    expect(base).toEqual({
      code: "EVD-001",
      lifecycleStatus: "DRAFT",
      changedFields: ["ownerId", "title"],
      hasFile: false,
    });
  });

  it("formats evidence codes like other governance codes", () => {
    expect(formatEvidenceCode(1)).toBe("EVD-001");
    expect(formatEvidenceCode(12)).toBe("EVD-012");
    expect(formatEvidenceCode(1000)).toBe("EVD-1000");
    expect(formatPolicyCode(1)).toBe("POL-001");
  });

  it("rejects forbidden create and patch fields", () => {
    expect(() =>
      createEvidenceSchema.parse({
        title: "Proof title",
        tenantId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      createEvidenceSchema.parse({
        title: "Proof title",
        code: "EVD-001",
      }),
    ).toThrow();
    expect(() =>
      createEvidenceSchema.parse({
        title: "Proof title",
        storageKey: "secret",
      }),
    ).toThrow();
    expect(() =>
      createEvidenceSchema.parse({
        title: "Proof title",
        lifecycleStatus: "APPROVED",
      }),
    ).toThrow();
    expect(() =>
      updateEvidenceSchema.parse({
        supersedesEvidenceId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toThrow();
    expect(() => updateEvidenceSchema.parse({})).toThrow();
  });

  it("validates date ordering and empty submit/archive bodies", () => {
    expect(() =>
      createEvidenceSchema.parse({
        title: "Proof title",
        issueDate: "2026-08-10",
        expiresAt: "2026-08-01",
      }),
    ).toThrow(/expiresAt/);
    expect(
      createEvidenceSchema.parse({
        title: "Proof title",
        issueDate: "2026-08-01",
        expiresAt: "2026-08-10",
      }),
    ).toMatchObject({ title: "Proof title" });
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ note: "x" })).toThrow();
    expect(
      evidenceListSchema.parse({
        page: "1",
        pageSize: "10",
        lifecycleStatus: "DRAFT",
      }),
    ).toMatchObject({ page: 1, pageSize: 10, lifecycleStatus: "DRAFT" });
  });

  it("sanitizes download filenames and Content-Disposition", () => {
    expect(sanitizeEvidenceFilename("../../etc/passwd.pdf", ".pdf")).toBe(
      "passwd.pdf",
    );
    expect(sanitizeEvidenceFilename('a"b\r\n;c.txt', ".txt")).toMatch(/\.txt$/);
    const header = buildContentDisposition("report.pdf");
    expect(header).toContain("attachment;");
    expect(header).toContain('filename="report.pdf"');
    expect(header).toContain("filename*=UTF-8''report.pdf");
    expect(header).not.toMatch(/[\r\n]/);
  });
});
