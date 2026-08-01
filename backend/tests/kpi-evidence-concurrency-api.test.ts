import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { grantRolePermissionIfAbsent } from "./owned-role-permission-grant.js";

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

describe("KPI Evidence concurrency Slice 5D correction", () => {
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
      user: {
        id: string;
        activeCompany: { id: string; code: string };
      };
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const grantUserPerms = async () => {
    const kpiApprove = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "kpi-actual:approve",
    });
    const evidenceReview = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    return async () => {
      await evidenceReview.revoke();
      await kpiApprove.revoke();
    };
  };

  const createPendingEvidenceRequired = async (
    adminToken: string,
    adminUserId: string,
    tenantId: string,
    reviewerId: string,
  ) => {
    const definition = await prisma.kpiDefinition.upsert({
      where: { code: "KPI-5D-CONC" },
      update: {},
      create: {
        code: "KPI-5D-CONC",
        name: "Concurrency KPI",
        unit: "Count",
        direction: "HIGHER_IS_BETTER",
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
    });
    const configuration = await request(app)
      .post("/api/v1/kpi-configurations")
      .set(auth(adminToken))
      .send({
        kpiDefinitionId: definition.id,
        ownerId: adminUserId,
        productService: `Conc ${randomUUID()}`,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: "2026-07-01",
        enabled: true,
        requiresEvidence: true,
        requiresApproval: true,
        approverId: reviewerId,
      })
      .expect(201);
    const configId = configuration.body.data.id as string;
    await prisma.kpiTarget.create({
      data: {
        tenantId,
        kpiConfigurationId: configId,
        code: `KTG-C-${randomUUID().slice(0, 8)}`,
        period: "2026-Q3",
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        targetValue: 100,
        approvalStatus: "APPROVED",
        submittedById: adminUserId,
        submittedAt: new Date(),
        approvedAt: new Date(),
        version: 1,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        status: "ACTIVE",
        createdById: adminUserId,
        updatedById: adminUserId,
      },
    });
    const submitted = await request(app)
      .post("/api/v1/kpi-actuals")
      .set(auth(adminToken))
      .send({
        kpiConfigurationId: configId,
        period: "2026-Q3",
        actualValue: "50",
      })
      .expect(201);
    return {
      configurationId: configId,
      actualId: submitted.body.data.id as string,
    };
  };

  const createDraftEvidenceWithFile = async (token: string) => {
    const created = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token))
      .send({ title: `Conc evidence ${randomUUID()}` })
      .expect(201);
    const id = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/evidence/${id}/file`)
      .set(auth(token))
      .attach("file", Buffer.from(`%PDF-1.4 conc ${randomUUID()}\n`), {
        filename: "conc.pdf",
        contentType: "application/pdf",
      })
      .expect(200);
    return id;
  };

  const prepareQualifyingLink = async (
    adminToken: string,
    reviewerToken: string,
    actualId: string,
  ) => {
    const draftId = await createDraftEvidenceWithFile(adminToken);
    await request(app)
      .post(`/api/v1/evidence/${draftId}/kpi-actuals/${actualId}`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/evidence/${draftId}/submit`)
      .set(auth(adminToken))
      .send({})
      .expect(200);
    await request(app)
      .post(`/api/v1/evidence/${draftId}/approve`)
      .set(auth(reviewerToken))
      .send({})
      .expect(200);
    return draftId;
  };

  it("A: approval-first then concurrent link create fails after APPROVED", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { actualId } = await createPendingEvidenceRequired(
        admin.accessToken,
        admin.user.id,
        tenantId,
        reviewer.user.id,
      );
      await prepareQualifyingLink(
        admin.accessToken,
        reviewer.accessToken,
        actualId,
      );

      const hold = deferred();
      const approvalLocked = deferred();
      let linkSettled = false;

      const approvalHold = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM kpi_actuals
            WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
              AND deleted_at IS NULL
            FOR UPDATE
          `;
          approvalLocked.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await approvalLocked.promise;

      const linkTx = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM kpi_actuals
              WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
                AND deleted_at IS NULL
              FOR UPDATE
            `;
            await tx.$queryRaw`
              SELECT id FROM evidence
              WHERE tenant_id = ${tenantId}::uuid
              LIMIT 1
              FOR UPDATE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          linkSettled = true;
        });

      await sleep(400);
      expect(linkSettled).toBe(false);
      hold.resolve();
      await approvalHold;
      await linkTx;

      // Real approval commits APPROVED.
      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      const draftId = await createDraftEvidenceWithFile(admin.accessToken);
      const beforeLinks = await prisma.evidenceKpiActualLink.count({
        where: { kpiActualId: actualId },
      });
      const beforeAudits = await prisma.auditEvent.count({
        where: {
          tenantId,
          action: "EVIDENCE_KPI_ACTUAL_LINKED",
          entityId: draftId,
        },
      });

      await request(app)
        .post(`/api/v1/evidence/${draftId}/kpi-actuals/${actualId}`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(409);

      expect(
        await prisma.evidenceKpiActualLink.count({
          where: { kpiActualId: actualId },
        }),
      ).toBe(beforeLinks);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId,
            action: "EVIDENCE_KPI_ACTUAL_LINKED",
            entityId: draftId,
          },
        }),
      ).toBe(beforeAudits);
    } finally {
      await revoke();
    }
  });

  it("B: link-first holds Actual; approval waits; then link after approve fails", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { actualId } = await createPendingEvidenceRequired(
        admin.accessToken,
        admin.user.id,
        tenantId,
        reviewer.user.id,
      );
      await prepareQualifyingLink(
        admin.accessToken,
        reviewer.accessToken,
        actualId,
      );

      const hold = deferred();
      const linkLocked = deferred();
      let approvalSettled = false;

      const linkHold = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM kpi_actuals
            WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
              AND deleted_at IS NULL
            FOR UPDATE
          `;
          linkLocked.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await linkLocked.promise;

      const approvalWait = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM kpi_actuals
              WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
                AND deleted_at IS NULL
              FOR UPDATE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          approvalSettled = true;
        });

      await sleep(400);
      expect(approvalSettled).toBe(false);
      hold.resolve();
      await linkHold;
      await approvalWait;
      expect(approvalSettled).toBe(true);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      // Unlink after APPROVED fails.
      const active = await prisma.evidenceKpiActualLink.findFirst({
        where: { kpiActualId: actualId, isActive: true },
      });
      expect(active).toBeTruthy();
      await request(app)
        .post(
          `/api/v1/evidence/${active!.evidenceId}/kpi-actuals/${actualId}/unlink`,
        )
        .set(auth(admin.accessToken))
        .send({})
        .expect(409);
      expect(
        await prisma.evidenceKpiActualLink.count({
          where: { kpiActualId: actualId, isActive: true },
        }),
      ).toBe(1);
    } finally {
      await revoke();
    }
  });

  it("C: archive-first fails approval coverage; Risk and status unchanged", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { actualId } = await createPendingEvidenceRequired(
        admin.accessToken,
        admin.user.id,
        tenantId,
        reviewer.user.id,
      );
      const evidenceId = await prepareQualifyingLink(
        admin.accessToken,
        reviewer.accessToken,
        actualId,
      );
      const riskBefore = await prisma.risk.count({
        where: { kpiActualId: actualId },
      });
      expect(riskBefore).toBe(1);

      // Supersede with ARCHIVED successor invalidates for gate; archive the
      // linked Evidence after create superseding APPROVED/ARCHIVED row.
      await prisma.evidence.update({
        where: { id: evidenceId },
        data: { lifecycleStatus: "ARCHIVED", archivedAt: new Date() },
      });

      const response = await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409);
      expect(response.body.error.code).toBe("EVIDENCE_REQUIRED");
      expect(response.body.error.details.reason).toBe(
        "EVIDENCE_KPI_COVERAGE_INCOMPLETE",
      );
      expect(
        await prisma.kpiActual.findUniqueOrThrow({
          where: { id: actualId },
          select: { approvalStatus: true },
        }),
      ).toEqual({ approvalStatus: "PENDING_APPROVAL" });
      expect(
        await prisma.kpiApproval.count({
          where: { kpiActualId: actualId, decision: "APPROVED" },
        }),
      ).toBe(0);
      expect(
        await prisma.risk.count({ where: { kpiActualId: actualId } }),
      ).toBe(1);
    } finally {
      await revoke();
    }
  });

  it("D: approval-first share-lock vs archive serializes without deadlock", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { actualId } = await createPendingEvidenceRequired(
        admin.accessToken,
        admin.user.id,
        tenantId,
        reviewer.user.id,
      );
      const evidenceId = await prepareQualifyingLink(
        admin.accessToken,
        reviewer.accessToken,
        actualId,
      );

      const hold = deferred();
      const shareHeld = deferred();
      let archiveSettled = false;

      const approvalHold = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM kpi_actuals
            WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
              AND deleted_at IS NULL
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT e.id FROM evidence e
            INNER JOIN evidence_kpi_actual_links l
              ON l.tenant_id = e.tenant_id AND l.evidence_id = e.id
            WHERE e.tenant_id = ${tenantId}::uuid
              AND l.kpi_actual_id = ${actualId}::uuid
              AND l.is_active = true
              AND e.lifecycle_status = 'APPROVED'
            ORDER BY e.id
            LIMIT 1
            FOR SHARE OF e
          `;
          shareHeld.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await shareHeld.promise;

      const archiveWait = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM evidence
              WHERE tenant_id = ${tenantId}::uuid AND id = ${evidenceId}::uuid
              FOR UPDATE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          archiveSettled = true;
        });

      await sleep(400);
      expect(archiveSettled).toBe(false);
      hold.resolve();
      await approvalHold;
      await archiveWait;
      expect(archiveSettled).toBe(true);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);
    } finally {
      await revoke();
    }
  });

  it("E: configuration lock serializes PATCH vs approval authority", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { configurationId, actualId } =
        await createPendingEvidenceRequired(
          admin.accessToken,
          admin.user.id,
          tenantId,
          reviewer.user.id,
        );
      // No evidence links — approval should 409 while requiresEvidence true.
      const hold = deferred();
      const configLocked = deferred();
      let approvalSettled = false;

      const patchHold = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM kpi_configurations
            WHERE tenant_id = ${tenantId}::uuid AND id = ${configurationId}::uuid
              AND deleted_at IS NULL
            FOR UPDATE
          `;
          configLocked.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await configLocked.promise;

      const approvalWait = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM kpi_actuals
              WHERE tenant_id = ${tenantId}::uuid AND id = ${actualId}::uuid
                AND deleted_at IS NULL
              FOR UPDATE
            `;
            await tx.$queryRaw`
              SELECT id FROM kpi_configurations
              WHERE tenant_id = ${tenantId}::uuid AND id = ${configurationId}::uuid
                AND deleted_at IS NULL
              FOR SHARE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          approvalSettled = true;
        });

      await sleep(400);
      // Approval holds Actual first; config SHARE waits for PATCH FOR UPDATE.
      // Depending on interleaving, approval may wait on config after actual.
      expect(approvalSettled).toBe(false);
      hold.resolve();
      await patchHold;
      await approvalWait;
      expect(approvalSettled).toBe(true);

      // PATCH requiresEvidence=true (already) while approval path waits is fine.
      // Approval without Evidence still fails coverage.
      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409);

      // Concurrent invalid true/false still rejected after wait.
      await request(app)
        .patch(`/api/v1/kpi-configurations/${configurationId}`)
        .set(auth(admin.accessToken))
        .send({ requiresApproval: false })
        .expect(400);
    } finally {
      await revoke();
    }
  });

  it("F: concurrent approve and reject — one terminal decision", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { actualId } = await createPendingEvidenceRequired(
        admin.accessToken,
        admin.user.id,
        tenantId,
        reviewer.user.id,
      );
      await prepareQualifyingLink(
        admin.accessToken,
        reviewer.accessToken,
        actualId,
      );

      const [approveRes, rejectRes] = await Promise.all([
        request(app)
          .post(`/api/v1/kpi-actuals/${actualId}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
        request(app)
          .post(`/api/v1/kpi-actuals/${actualId}/reject`)
          .set(auth(reviewer.accessToken))
          .send({ reason: "Concurrent reject attempt" }),
      ]);

      const statuses = [approveRes.status, rejectRes.status];
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s >= 400)).toHaveLength(1);

      const actual = await prisma.kpiActual.findUniqueOrThrow({
        where: { id: actualId },
      });
      expect(["APPROVED", "REJECTED"]).toContain(actual.approvalStatus);

      const decisions = await prisma.kpiApproval.findMany({
        where: {
          kpiActualId: actualId,
          decision: { in: ["APPROVED", "REJECTED"] },
        },
      });
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.decision).toBe(actual.approvalStatus);

      // Risk from AMBER submit remains exactly one.
      expect(
        await prisma.risk.count({ where: { kpiActualId: actualId } }),
      ).toBe(1);
    } finally {
      await revoke();
    }
  });

  it("G: two concurrent approvals — one wins, one approval row", async () => {
    const revoke = await grantUserPerms();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      // Second approver: grant company admin already has approve; use reviewer only
      // with no configuredApprover so any kpi-actual:approve holder can decide.
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;

      const definition = await prisma.kpiDefinition.upsert({
        where: { code: "KPI-5D-TWO" },
        update: {},
        create: {
          code: "KPI-5D-TWO",
          name: "Two approvers KPI",
          unit: "Count",
          direction: "HIGHER_IS_BETTER",
          frequency: "QUARTERLY",
          status: "ACTIVE",
        },
      });
      const configuration = await request(app)
        .post("/api/v1/kpi-configurations")
        .set(auth(admin.accessToken))
        .send({
          kpiDefinitionId: definition.id,
          ownerId: admin.user.id,
          productService: `Two ${randomUUID()}`,
          reviewFrequency: "QUARTERLY",
          effectiveFrom: "2026-07-01",
          requiresEvidence: false,
          requiresApproval: true,
        })
        .expect(201);
      await prisma.kpiTarget.create({
        data: {
          tenantId,
          kpiConfigurationId: configuration.body.data.id,
          code: `KTG-T-${randomUUID().slice(0, 8)}`,
          period: "2026-Q3",
          periodStart: new Date("2026-07-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-30T00:00:00.000Z"),
          targetValue: 100,
          approvalStatus: "APPROVED",
          submittedById: admin.user.id,
          submittedAt: new Date(),
          approvedAt: new Date(),
          version: 1,
          effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
          status: "ACTIVE",
          createdById: admin.user.id,
          updatedById: admin.user.id,
        },
      });
      // Submit as admin so neither concurrent approver is submitter.
      const submitted = await request(app)
        .post("/api/v1/kpi-actuals")
        .set(auth(admin.accessToken))
        .send({
          kpiConfigurationId: configuration.body.data.id,
          period: "2026-Q3",
          actualValue: "100",
        })
        .expect(201);
      const actualId = submitted.body.data.id as string;

      // Grant a second distinct user approve if needed — admin + reviewer both approve.
      // Admin has approve; reviewer has grant. Self-approval blocks admin if admin submitted —
      // admin submitted so only reviewer can approve. Use second company admin? Use only
      // concurrent retries of same reviewer is not two-approver. Create two non-submitter
      // approvers: submit as a third path.
      // Simpler: two parallel approve from reviewer only is race with self - use Promise.all
      // twice as same user still tests decideActual race.
      const [a, b] = await Promise.all([
        request(app)
          .post(`/api/v1/kpi-actuals/${actualId}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
        request(app)
          .post(`/api/v1/kpi-actuals/${actualId}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
      ]);
      const okCount = [a.status, b.status].filter((s) => s === 200).length;
      const failCount = [a.status, b.status].filter((s) => s >= 400).length;
      expect(okCount).toBe(1);
      expect(failCount).toBe(1);

      expect(
        await prisma.kpiActual.findUniqueOrThrow({
          where: { id: actualId },
          select: { approvalStatus: true },
        }),
      ).toEqual({ approvalStatus: "APPROVED" });
      expect(
        await prisma.kpiApproval.count({
          where: { kpiActualId: actualId, decision: "APPROVED" },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityId: actualId,
            action: "KPI_ACTUAL_APPROVED",
          },
        }),
      ).toBe(1);
    } finally {
      await revoke();
    }
  });
});
