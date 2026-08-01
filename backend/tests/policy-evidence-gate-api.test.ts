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

const expectEvidenceRequired = (
  response: {
    status: number;
    body: { error?: { code?: string; details?: { reason?: string } } };
  },
  reason: string,
) => {
  expect(response.status).toBe(409);
  expect(response.body.error?.code).toBe("EVIDENCE_REQUIRED");
  expect(response.body.error?.details?.reason).toBe(reason);
};

describe("Policy Version Evidence gate Slice 5.5C", () => {
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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const grantUserApprove = async () => {
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company.id, code: "COMPANY_USER" },
      },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "policies:approve" },
    });
    const existing = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
    });
    if (existing) return async () => {};
    const assignment = await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    return async () => {
      await prisma.rolePermission.delete({ where: { id: assignment.id } });
    };
  };

  const createSubmittedPolicy = async (
    token: string,
    requiresEvidence: boolean,
  ) => {
    const created = await request(app)
      .post("/api/v1/policies")
      .set(auth(token))
      .send({
        title: `Policy gate ${randomUUID()}`,
        content: "Synthetic policy content for Evidence gate tests",
        requiresEvidence,
      })
      .expect(201);
    const versionId = created.body.data.latestVersion.id as string;
    const policyId = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/policy-versions/${versionId}/submit`)
      .set(auth(token))
      .send({})
      .expect(200);
    return { policyId, versionId };
  };

  const createControl = async (
    token: string,
    overrides: {
      requiresEvidence?: boolean;
      policyVersionIds?: string[];
    } = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/controls")
      .set(auth(token))
      .send({
        title: `Policy gate control ${randomUUID()}`,
        objective: "Synthetic control for Policy Evidence gate",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification",
        requiresEvidence: overrides.requiresEvidence ?? false,
        policyVersionIds: overrides.policyVersionIds ?? [],
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
        title: `Policy gate checkpoint ${randomUUID()}`,
        expectedResult: "Synthetic expected result remains true",
        verificationFrequency: "MONTHLY",
        evidenceRequired,
      })
      .expect(201);
    return response.body.data as { id: string; code: string };
  };

  const seedApprovedEvidence = async (
    tenantId: string,
    actorId: string,
    links: {
      controlId?: string;
      checkpointId?: string;
      isActive?: boolean;
    } = {},
  ) => {
    const evidence = await prisma.evidence.create({
      data: {
        tenantId,
        code: `EVD-POL-${randomUUID().slice(0, 8)}`,
        title: `Policy gate evidence ${randomUUID()}`,
        lifecycleStatus: "APPROVED",
        issueDate: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2099-12-31T00:00:00.000Z"),
        storageKey: `${tenantId}/evidence/${randomUUID()}`,
        contentSha256: (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64),
        byteSize: 128,
        mimeType: "application/pdf",
        detectedMimeType: "application/pdf",
        originalFileName: "policy-gate.pdf",
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
    if (links.controlId) {
      await prisma.evidenceControlLink.create({
        data: {
          tenantId,
          evidenceId: evidence.id,
          controlId: links.controlId,
          isActive: links.isActive ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    }
    if (links.checkpointId) {
      await prisma.evidenceCheckpointLink.create({
        data: {
          tenantId,
          evidenceId: evidence.id,
          checkpointId: links.checkpointId,
          isActive: links.isActive ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    }
    return evidence;
  };

  it("allows approval when requiresEvidence is false without Evidence", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const { versionId } = await createSubmittedPolicy(admin.accessToken, false);
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set(auth(user.accessToken))
        .send({})
        .expect(200);
      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("APPROVED");
    } finally {
      await revoke();
    }
  });

  it("fails empty configuration with EVIDENCE_GATE_NOT_CONFIGURED", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const { versionId } = await createSubmittedPolicy(admin.accessToken, true);
      const beforeAudits = await prisma.auditEvent.count({
        where: {
          entityId: versionId,
          action: "POLICY_VERSION_APPROVED",
        },
      });
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_GATE_NOT_CONFIGURED",
      );
      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("SUBMITTED");
      expect(
        await prisma.auditEvent.count({
          where: {
            entityId: versionId,
            action: "POLICY_VERSION_APPROVED",
          },
        }),
      ).toBe(beforeAudits);
    } finally {
      await revoke();
    }
  });

  it("allows active Control mapping to SUBMITTED and rejects DRAFT/REJECTED", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/policies")
      .set(auth(admin.accessToken))
      .send({
        title: `Mapping lifecycle ${randomUUID()}`,
        content: "Synthetic content for mapping lifecycle",
        requiresEvidence: false,
      })
      .expect(201);
    const draftId = created.body.data.latestVersion.id as string;

    // DRAFT mapping fails (CONTROL_MAPPING_INVALID)
    await request(app)
      .post("/api/v1/controls")
      .set(auth(admin.accessToken))
      .send({
        title: `Draft map control ${randomUUID()}`,
        objective: "Synthetic",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic",
        policyVersionIds: [draftId],
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
      });

    await request(app)
      .post(`/api/v1/policy-versions/${draftId}/submit`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);

    // SUBMITTED mapping succeeds
    const control = await createControl(admin.accessToken, {
      policyVersionIds: [draftId],
    });
    expect(control.id).toBeTruthy();

    const mappings = await prisma.controlPolicyVersion.findMany({
      where: { policyVersionId: draftId, isActive: true },
    });
    expect(mappings.length).toBe(1);

    // REJECTED mapping fails (grant approve then re-login so JWT includes permission)
    const revoke = await grantUserApprove();
    try {
      const rejector = await loginAs("user001@example.test", "User001!Secure");
      const p2 = await createSubmittedPolicy(admin.accessToken, false);
      await request(app)
        .post(`/api/v1/policy-versions/${p2.versionId}/reject`)
        .set(auth(rejector.accessToken))
        .send({ comments: "Reject for mapping lifecycle test" })
        .expect(200);
      await request(app)
        .post("/api/v1/controls")
        .set(auth(admin.accessToken))
        .send({
          title: `Rejected map control ${randomUUID()}`,
          objective: "Synthetic",
          implementationStatus: "NOT_STARTED",
          controlType: "PREVENTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Synthetic",
          policyVersionIds: [p2.versionId],
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
        });
    } finally {
      await revoke();
    }
  });

  it("enforces independent Control and Checkpoint coverage", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const actorId = admin.user.id;

      const { versionId } = await createSubmittedPolicy(admin.accessToken, true);
      const control = await createControl(admin.accessToken, {
        requiresEvidence: true,
        policyVersionIds: [versionId],
      });
      const checkpoint = await createCheckpoint(
        admin.accessToken,
        control.id,
        true,
      );

      // No evidence → both incomplete (control first path may report COVERAGE or CONTROL)
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_COVERAGE_INCOMPLETE",
      );

      // Control only → checkpoint incomplete
      await seedApprovedEvidence(tenantId, actorId, { controlId: control.id });
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE",
      );

      // Add checkpoint evidence → approve succeeds
      await seedApprovedEvidence(tenantId, actorId, {
        checkpointId: checkpoint.id,
      });
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set(auth(user.accessToken))
        .send({})
        .expect(200);
      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("APPROVED");
      expect(version.requiresEvidence).toBe(true);
    } finally {
      await revoke();
    }
  });

  it("Control-only required Evidence path and checkpoint-only path", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const actorId = admin.user.id;

      // Control requires Evidence only
      const p1 = await createSubmittedPolicy(admin.accessToken, true);
      const c1 = await createControl(admin.accessToken, {
        requiresEvidence: true,
        policyVersionIds: [p1.versionId],
      });
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${p1.versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_CONTROL_COVERAGE_INCOMPLETE",
      );
      await seedApprovedEvidence(tenantId, actorId, { controlId: c1.id });
      await request(app)
        .post(`/api/v1/policy-versions/${p1.versionId}/approve`)
        .set(auth(user.accessToken))
        .send({})
        .expect(200);

      // Checkpoint requires Evidence only (Control.requiresEvidence=false)
      const p2 = await createSubmittedPolicy(admin.accessToken, true);
      const c2 = await createControl(admin.accessToken, {
        requiresEvidence: false,
        policyVersionIds: [p2.versionId],
      });
      const ck2 = await createCheckpoint(admin.accessToken, c2.id, true);
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${p2.versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE",
      );
      // Control-linked only must not satisfy checkpoint
      await seedApprovedEvidence(tenantId, actorId, { controlId: c2.id });
      expectEvidenceRequired(
        await request(app)
          .post(`/api/v1/policy-versions/${p2.versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        "EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE",
      );
      await seedApprovedEvidence(tenantId, actorId, {
        checkpointId: ck2.id,
      });
      await request(app)
        .post(`/api/v1/policy-versions/${p2.versionId}/approve`)
        .set(auth(user.accessToken))
        .send({})
        .expect(200);
    } finally {
      await revoke();
    }
  });

  it("serializes gate-first archive against Policy FOR SHARE locks", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const actorId = admin.user.id;
    const { versionId } = await createSubmittedPolicy(admin.accessToken, true);
    const control = await createControl(admin.accessToken, {
      requiresEvidence: true,
      policyVersionIds: [versionId],
    });
    const evidence = await seedApprovedEvidence(tenantId, actorId, {
      controlId: control.id,
    });

    const gate = new EvidenceGateService();
    const hold = deferred();
    const locked = deferred();
    let archiveCompleted = false;

    const gateTx = prisma.$transaction(
      async (tx) => {
        await gate.assertPolicyVersionApprovalSatisfied({
          tenantId,
          policyVersionId: versionId,
          requiresEvidence: true,
          asOfDate: utcDateString(),
          tx,
        });
        locked.resolve();
        await hold.promise;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    await locked.promise;

    const archivePromise = (async () => {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM evidence
            WHERE tenant_id = ${tenantId}::uuid AND id = ${evidence.id}::uuid
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
  });

  it("archive-first fails Policy gate with no approval write", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const actorId = admin.user.id;
      const { versionId } = await createSubmittedPolicy(admin.accessToken, true);
      const control = await createControl(admin.accessToken, {
        requiresEvidence: true,
        policyVersionIds: [versionId],
      });
      const evidence = await seedApprovedEvidence(tenantId, actorId, {
        controlId: control.id,
      });

      const hold = deferred();
      const archiveLocked = deferred();
      let gateSettled = false;

      const archiveTx = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM evidence
            WHERE tenant_id = ${tenantId}::uuid AND id = ${evidence.id}::uuid
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

      const gate = new EvidenceGateService();
      const gateTx = prisma
        .$transaction(
          async (tx) => {
            await gate.assertPolicyVersionApprovalSatisfied({
              tenantId,
              policyVersionId: versionId,
              requiresEvidence: true,
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
      });

      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("SUBMITTED");
    } finally {
      await revoke();
    }
  });

  it("keeps KPI fail-closed at 501", () => {
    expect(() => new EvidenceGateService().assertSatisfied(true)).toThrowError(
      expect.objectContaining({
        status: 501,
        code: "EVIDENCE_GATE_NOT_IMPLEMENTED",
      }),
    );
  });

  it("CHECK policy_versions_submission_fields_consistent allows requires_evidence on approved family", async () => {
    const rows = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'policy_versions'
        AND c.conname = 'policy_versions_submission_fields_consistent'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.def).not.toMatch(/NOT\s+"?requires_evidence"?/i);
    expect(rows[0]!.def).toMatch(/APPROVED/);
    expect(rows[0]!.def).toMatch(/submitted_by_id/);
  });
});
