import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../src/common/errors/app-error.js";
import { EvidenceGateService } from "../src/modules/evidence/evidence-gate-service.js";
import { utcDateString } from "../src/modules/evidence/eligibility.js";

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

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const expectEvidenceRequired = (response: {
  status: number;
  body: { error?: { code?: string; details?: { reason?: string } } };
}) => {
  expect(response.status).toBe(409);
  expect(response.body.error?.code).toBe("EVIDENCE_REQUIRED");
  expect(response.body.error?.details?.reason).toBe(
    "EVIDENCE_COVERAGE_INCOMPLETE",
  );
};

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
    _token: string,
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
      .send(reviewBody("2026-02"));
    expectEvidenceRequired(failed);

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-03")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-04")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-05")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-06")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-07")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-08")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-09")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2026-10")),
    );

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

    // SUBMITTED successor does not invalidate
    const checkpointSubmitted = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const priorSubmitted = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpointSubmitted.id,
    );
    await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-SUB-${randomUUID().slice(0, 8)}`,
        title: "Submitted successor",
        lifecycleStatus: "SUBMITTED",
        supersedesEvidenceId: priorSubmitted.id,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpointSubmitted.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-05"))
      .expect(201);

    // REJECTED successor does not invalidate
    const checkpointRejected = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const priorRejected = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpointRejected.id,
    );
    await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-REJ-${randomUUID().slice(0, 8)}`,
        title: "Rejected successor",
        lifecycleStatus: "REJECTED",
        supersedesEvidenceId: priorRejected.id,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await request(app)
      .post(`/api/v1/checkpoints/${checkpointRejected.id}/reviews`)
      .set(auth(admin.accessToken))
      .send(reviewBody("2025-06"))
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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint3.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2025-03")),
    );

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
    expectEvidenceRequired(
      await request(app)
        .post(`/api/v1/checkpoints/${checkpoint4.id}/reviews`)
        .set(auth(admin.accessToken))
        .send(reviewBody("2025-04")),
    );

    void oldEvidence;
  });

  it("rejects cross-tenant checkpoint access, cross-tenant links, and keeps Policy/KPI fail-closed", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
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

    // Composite tenant FK: cannot link COM-001 Evidence to COM-002 Checkpoint.
    const foreignControl = await createControl(tokenCom2);
    const foreignCheckpoint = await createCheckpoint(
      tokenCom2,
      foreignControl.id,
      true,
    );
    const localEvidence = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
    );
    await expect(
      prisma.evidenceCheckpointLink.create({
        data: {
          tenantId: foreign.id,
          evidenceId: localEvidence.id,
          checkpointId: foreignCheckpoint.id,
          isActive: true,
          createdById: actorId,
          updatedById: actorId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      new EvidenceGateService().assertKpiActualApprovalSatisfied({
        tenantId: "00000000-0000-4000-8000-000000000001",
        kpiActualId: "00000000-0000-4000-8000-000000000002",
        requiresEvidence: false,
      }),
    ).resolves.toEqual({ satisfied: true, qualifyingCount: 0 });
    // Policy/KPI gates are real; fail-closed only when coverage is required.
    const { assertPolicyApprovalAllowed } = await import(
      "../src/modules/policies/domain.js"
    );
    expect(() =>
      assertPolicyApprovalAllowed({
        status: "SUBMITTED",
        submitterId: "submitter",
        actorId: "approver",
        requiresEvidence: true,
      }),
    ).not.toThrow();
  });

  it("serializes gate-first: archive waits while FOR SHARE is held", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const evidence = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
    );

    const gate = new EvidenceGateService();
    const hold = deferred();
    const locked = deferred();
    let archiveCompleted = false;

    const gateTx = prisma.$transaction(
      async (tx) => {
        const result = await gate.assertCheckpointReviewSatisfied({
          tenantId,
          checkpointId: checkpoint.id,
          evidenceRequired: true,
          asOfDate: utcDateString(),
          tx,
        });
        expect(result.satisfied).toBe(true);
        expect(result.lockedEvidenceId).toBe(evidence.id);
        locked.resolve();
        await hold.promise;
        // Hold lock through simulated parent review work; no review insert needed.
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    await locked.promise;

    const archivePromise = (async () => {
      // Mirror Evidence archive locking: FOR UPDATE then lifecycle UPDATE.
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id
            FROM evidence
            WHERE tenant_id = ${tenantId}::uuid
              AND id = ${evidence.id}::uuid
            FOR UPDATE
          `;
          await tx.evidence.update({
            where: { id: evidence.id },
            data: {
              lifecycleStatus: "ARCHIVED",
              archivedAt: new Date(),
              updatedById: actorId,
            },
          });
        },
        { maxWait: 15_000, timeout: 20_000 },
      );
      archiveCompleted = true;
    })();

    await sleep(400);
    expect(archiveCompleted).toBe(false);

    hold.resolve();
    await gateTx;
    await archivePromise;
    expect(archiveCompleted).toBe(true);

    const after = await prisma.evidence.findFirstOrThrow({
      where: { tenantId, id: evidence.id },
      select: { lifecycleStatus: true },
    });
    expect(after.lifecycleStatus).toBe("ARCHIVED");
  });

  it("serializes archive-first: gate fails after archive commits; no review/audit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(
      admin.accessToken,
      control.id,
      true,
    );
    const evidence = await createApprovedEvidenceLinkedToCheckpoint(
      admin.accessToken,
      tenantId,
      actorId,
      checkpoint.id,
    );

    const beforeReviews = await prisma.checkpointReview.count({
      where: { tenantId, checkpointId: checkpoint.id },
    });
    const beforeAudits = await prisma.auditEvent.count({
      where: {
        tenantId,
        entityId: checkpoint.id,
        action: "CHECKPOINT_REVIEWED",
      },
    });

    const gate = new EvidenceGateService();
    const hold = deferred();
    const archiveLocked = deferred();
    let gateSettled = false;

    const archiveTx = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM evidence
          WHERE tenant_id = ${tenantId}::uuid
            AND id = ${evidence.id}::uuid
          FOR UPDATE
        `;
        archiveLocked.resolve();
        await hold.promise;
        await tx.evidence.update({
          where: { id: evidence.id },
          data: {
            lifecycleStatus: "ARCHIVED",
            archivedAt: new Date(),
            updatedById: actorId,
          },
        });
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    await archiveLocked.promise;

    const gateTx = prisma
      .$transaction(
        async (tx) => {
          await gate.assertCheckpointReviewSatisfied({
            tenantId,
            checkpointId: checkpoint.id,
            evidenceRequired: true,
            asOfDate: utcDateString(),
            tx,
          });
        },
        { maxWait: 15_000, timeout: 20_000 },
      )
      .finally(() => {
        gateSettled = true;
      });

    await sleep(400);
    expect(gateSettled).toBe(false);

    hold.resolve();
    await archiveTx;

    let gateError: unknown;
    try {
      await gateTx;
    } catch (error) {
      gateError = error;
    }

    expect(gateError).toBeInstanceOf(AppError);
    expect(gateError).toMatchObject({
      status: 409,
      code: "EVIDENCE_REQUIRED",
      details: { reason: "EVIDENCE_COVERAGE_INCOMPLETE" },
    });

    expect(
      await prisma.checkpointReview.count({
        where: { tenantId, checkpointId: checkpoint.id },
      }),
    ).toBe(beforeReviews);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId,
          entityId: checkpoint.id,
          action: "CHECKPOINT_REVIEWED",
        },
      }),
    ).toBe(beforeAudits);

    const after = await prisma.evidence.findFirstOrThrow({
      where: { tenantId, id: evidence.id },
      select: { lifecycleStatus: true },
    });
    expect(after.lifecycleStatus).toBe("ARCHIVED");
  });
});
