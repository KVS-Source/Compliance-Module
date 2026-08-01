import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

describe("Checkpoint Evidence gate Slice 5.5A+B", () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: { id: string; activeCompany: { id: string } };
    };
  };

  const switchCompany = async (token: string, companyId: string) => {
    const response = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createControl = async (token: string) => {
    const response = await request(app)
      .post("/api/v1/controls")
      .set(auth(token))
      .send({
        title: `Gate control ${randomUUID()}`,
        objective: "Synthetic control for Evidence gate tests",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification",
      })
      .expect(201);
    return response.body.data as { id: string; code: string };
  };

  const createCheckpoint = async (
    token: string,
    controlId: string,
    evidenceRequired: boolean,
  ) => {
    const response = await request(app)
      .post("/api/v1/checkpoints")
      .set(auth(token))
      .send({
        controlId,
        title: `Gate checkpoint ${randomUUID()}`,
        expectedResult: "Synthetic expected result remains true",
        verificationFrequency: "MONTHLY",
        evidenceRequired,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      evidenceRequired: boolean;
    };
  };

  const createApprovedEvidenceLinkedToCheckpoint = async (
    token: string,
    tenantId: string,
    actorId: string,
    checkpointId: string,
    overrides: {
      issueDate?: string | null;
      expiresAt?: string | null;
      lifecycleStatus?: "APPROVED" | "DRAFT" | "SUBMITTED" | "REJECTED";
      isActive?: boolean;
      byteSize?: number | null;
      storageKey?: string | null;
      contentSha256?: string | null;
    } = {},
  ) => {
    const evidence = await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-GATE-${randomUUID().slice(0, 8)}`,
        title: `Gate evidence ${randomUUID()}`,
        lifecycleStatus: overrides.lifecycleStatus ?? "APPROVED",
        issueDate:
          overrides.issueDate === undefined
            ? new Date("2026-01-01T00:00:00.000Z")
            : overrides.issueDate == null
              ? null
              : new Date(`${overrides.issueDate}T00:00:00.000Z`),
        expiresAt:
          overrides.expiresAt === undefined
            ? new Date("2099-12-31T00:00:00.000Z")
            : overrides.expiresAt == null
              ? null
              : new Date(`${overrides.expiresAt}T00:00:00.000Z`),
        storageKey:
          overrides.storageKey === undefined
            ? `${tenantId}/evidence/${randomUUID()}`
            : overrides.storageKey,
        contentSha256:
          overrides.contentSha256 === undefined
            ? (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64)
            : overrides.contentSha256,
        byteSize: overrides.byteSize === undefined ? 128 : overrides.byteSize,
        mimeType: "application/pdf",
        detectedMimeType: "application/pdf",
        originalFileName: "gate.pdf",
        createdById: actorId,
        updatedById: actorId,
        uploadedById: actorId,
        uploadedAt: new Date(),
        submittedById: actorId,
        submittedAt: new Date(),
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });

    await prisma.evidenceCheckpointLink.create({
      data: {
        tenantId,
        evidenceId: evidence.id,
        checkpointId,
        isActive: overrides.isActive ?? true,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    return evidence;
  };

  let periodSeq = 0;
  const nextPeriod = () => {
    periodSeq += 1;
    const month = ((periodSeq - 1) % 12) + 1;
    const year = 1990 + Math.floor((periodSeq - 1) / 12);
    return `${year}-${String(month).padStart(2, "0")}`;
  };
  const reviewBody = (period?: string) => ({
    reviewPeriod: period ?? nextPeriod(),
    reviewDate: "2026-08-01",
    outcome: "PASS" as const,
    observation: "Synthetic observation for gate tests",
    recommendation: "Continue monitoring",
    nextReviewDate: "2026-09-01",
  });

  it("allows review when evidenceRequired is false without Evidence", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      false,
    );
    const before = await prisma.checkpointReview.count({
      where: {
        tenantId: admin.user.activeCompany.id,
        checkpointId: checkpoint.id,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-01"))
      .expect(201);
    const after = await prisma.checkpointReview.count({
      where: {
        tenantId: admin.user.activeCompany.id,
        checkpointId: checkpoint.id,
      },
    });
    expect(after).toBe(before + 1);
  });

  it("rejects review when evidenceRequired and no qualifying Evidence", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const beforeReviews = await prisma.checkpointReview.count({
      where: {
        tenantId: admin.user.activeCompany.id,
        checkpointId: checkpoint.id,
      },
    });
    const beforeAudits = await prisma.auditEvent.count({
      where: {
        tenantId: admin.user.activeCompany.id,
        entityId: checkpoint.id,
        action: "CHECKPOINT_REVIEWED",
      },
    });

    const failed = await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-02"))
      .expect(409);
    expect(failed.body.error.code).toBe("EVIDENCE_REQUIRED");
    expect(failed.body.error.details?.reason).toBe(
      "EVIDENCE_COVERAGE_INCOMPLETE",
    );

    expect(
      await prisma.checkpointReview.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          checkpointId: checkpoint.id,
        },
      }),
    ).toBe(beforeReviews);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          entityId: checkpoint.id,
          action: "CHECKPOINT_REVIEWED",
        },
      }),
    ).toBe(beforeAudits);
  });

  it("accepts review with APPROVED active linked Evidence and rejects invalid cases", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const otherCheckpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );

    // DRAFT linked — fail
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { lifecycleStatus: "DRAFT" },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-03"))
      .expect(409);

    // SUBMITTED — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { lifecycleStatus: "SUBMITTED" },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-04"))
      .expect(409);

    // REJECTED — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { lifecycleStatus: "REJECTED" },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-05"))
      .expect(409);

    // Inactive link — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { isActive: false },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-06"))
      .expect(409);

    // Linked to other checkpoint only — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      otherCheckpoint.id,
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-07"))
      .expect(409);

    // Incomplete file — fail (null storage/hash/size; DB forbids byteSize=0)
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { storageKey: null, contentSha256: null, byteSize: null },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-08"))
      .expect(409);

    // Expired — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { issueDate: "2019-01-01", expiresAt: "2020-01-01" },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-09"))
      .expect(409);

    // Future issue — fail
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { issueDate: "2099-01-01" },
    );
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-10"))
      .expect(409);

    // Qualifying APPROVED — pass
    await prisma.evidenceCheckpointLink.deleteMany({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { expiresAt: null, issueDate: null },
    );
    const ok = await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2026-11"))
      .expect(201);
    expect(ok.body.data.outcome).toBe("PASS");

    const audits = await prisma.auditEvent.findMany({
      where: {
        tenantId,
        entityId: checkpoint.id,
        action: "CHECKPOINT_REVIEWED",
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    // No dedicated gate audit events
    const gateAudits = await prisma.auditEvent.count({
      where: {
        tenantId,
        action: { in: ["EVIDENCE_GATE_PASSED", "EVIDENCE_GATE_FAILED"] },
      },
    });
    expect(gateAudits).toBe(0);
  });

  it("applies supersession and expires-today rules", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );

    const today = new Date().toISOString().slice(0, 10);
    const oldEvidence = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
      { expiresAt: today },
    );

    // expires today → valid
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-01"))
      .expect(201);

    // Create second checkpoint for supersession isolation on same evidence chain
    const checkpoint2 = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const prior = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint2.id,
    );

    // DRAFT successor does not invalidate
    await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-SUCC-${randomUUID().slice(0, 8)}`,
        title: "Draft successor",
        lifecycleStatus: "DRAFT",
        supersedesEvidenceId: prior.id,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint2.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-02"))
      .expect(201);

    // APPROVED successor invalidates prior
    const checkpoint3 = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const prior3 = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint3.id,
    );
    await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-APP-${randomUUID().slice(0, 8)}`,
        title: "Approved successor",
        lifecycleStatus: "APPROVED",
        supersedesEvidenceId: prior3.id,
        storageKey: `${tenantId}/evidence/${randomUUID()}`,
        contentSha256: (randomUUID() + randomUUID())
          .replace(/-/g, "")
          .slice(0, 64),
        byteSize: 10,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint3.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-03"))
      .expect(409);

    // ARCHIVED successor keeps old invalid
    const checkpoint4 = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const prior4 = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint4.id,
    );
    await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-ARC-${randomUUID().slice(0, 8)}`,
        title: "Archived successor",
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        supersedesEvidenceId: prior4.id,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint4.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-04"))
      .expect(409);

    void oldEvidence;
  });

  it("rejects cross-tenant checkpoint access and keeps Policy/KPI gates fail-closed", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );

    const foreign = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const tokenCom2 = await switchCompany(admin.accessToken, foreign.id);
    await request(app)
      .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
      .set(auth(tokenCom2))
      .send(reviewBody())
      .expect(404);

    const { EvidenceGateService } = await import(
      "../src/modules/evidence/evidence-gate-service.js"
    );
    const { assertPolicyApprovalAllowed } = await import(
      "../src/modules/policies/domain.js"
    );
    expect(() => new EvidenceGateService().assertSatisfied(true)).toThrowError(
      expect.objectContaining({
        status: 501,
        code: "EVIDENCE_GATE_NOT_IMPLEMENTED",
      }),
    );
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "submitter",
        actorId: "approver",
        requiresEvidence: true,
      }),
    ).toThrow(/EVIDENCE_GATE_NOT_IMPLEMENTED|Evidence/i);
  });
});
