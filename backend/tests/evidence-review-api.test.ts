import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { EvidenceLifecycleStatus, PrismaClient } from "@prisma/client";
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

describe("Evidence approve/reject review Slice 5.4", () => {
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
        companies: Array<{ id: string; code: string }>;
      };
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

  const createSubmittedEvidence = async (token: string) => {
    const created = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token))
      .send({ title: `Review evidence ${randomUUID()}` })
      .expect(201);
    const id = created.body.data.id as string;
    const uniqueBytes = Buffer.from(
      `%PDF-1.4 review fixture ${randomUUID()}\n`,
    );
    await request(app)
      .post(`/api/v1/evidence/${id}/file`)
      .set(auth(token))
      .attach("file", uniqueBytes, {
        filename: "review.pdf",
        contentType: "application/pdf",
      })
      .expect(200);
    const submitted = await request(app)
      .post(`/api/v1/evidence/${id}/submit`)
      .set(auth(token))
      .send({})
      .expect(200);
    return submitted.body.data as {
      id: string;
      code: string;
      lifecycleStatus: string;
      createdById: string;
      submittedById: string;
      storageKey?: string;
    };
  };

  const setLifecycle = async (
    evidenceId: string,
    lifecycleStatus: EvidenceLifecycleStatus,
  ) => {
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        lifecycleStatus,
        ...(lifecycleStatus === "ARCHIVED"
          ? { archivedAt: new Date() }
          : { archivedAt: null }),
      },
    });
  };

  it("approves SUBMITTED Evidence with decision, audit and detail summary", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);

    // Admin is creator/submitter/uploader — self-review forbidden.
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/approve`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_SELF_REVIEW_FORBIDDEN");
      });

    const selfAudits = await prisma.auditEvent.count({
      where: {
        tenantId: admin.user.activeCompany.id,
        entityId: evidence.id,
        action: { in: ["EVIDENCE_APPROVED", "EVIDENCE_REJECTED"] },
      },
    });
    expect(selfAudits).toBe(0);

    const writeGrant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      const approved = await request(app)
        .post(`/api/v1/evidence/${evidence.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({ comment: "Looks complete" })
        .expect(200);

      expect(approved.body.data.lifecycleStatus).toBe("APPROVED");
      expect(approved.body.data.reviewedById).toBe(reviewer.user.id);
      expect(approved.body.data.reviewedAt).toBeTruthy();
      expect(approved.body.data.reviewedBy).toMatchObject({
        id: reviewer.user.id,
      });
      expect(approved.body.data.latestReviewDecision).toMatchObject({
        decision: "APPROVED",
        reason: "Looks complete",
      });
      expect(approved.body.data).not.toHaveProperty("storageKey");
      expect(approved.body.data.file?.contentSha256).toBeTruthy();

      const history = await request(app)
        .get(`/api/v1/evidence/${evidence.id}/review-decisions`)
        .set(auth(admin.accessToken))
        .expect(200);
      expect(history.body.meta.total).toBe(1);
      expect(history.body.data[0]).toMatchObject({
        decision: "APPROVED",
        reason: "Looks complete",
      });
      expect(history.body.data[0].actedBy.id).toBe(reviewer.user.id);

      const decisions = await prisma.evidenceReviewDecision.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          evidenceId: evidence.id,
        },
      });
      expect(decisions).toHaveLength(1);

      const audits = await prisma.auditEvent.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          entityId: evidence.id,
          action: "EVIDENCE_APPROVED",
        },
      });
      expect(audits).toHaveLength(1);
      const metadata = audits[0]?.metadata as Record<string, unknown>;
      expect(metadata).toMatchObject({
        decision: "APPROVED",
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        hasComment: true,
        hasFile: true,
      });
      expect(metadata).not.toHaveProperty("reason");
      expect(metadata).not.toHaveProperty("comment");
      expect(metadata).not.toHaveProperty("storageKey");

      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409)
        .expect((res) => {
          expect(res.body.error.code).toBe("EVIDENCE_INVALID_STATE");
        });
    } finally {
      await writeGrant.revoke();
    }
  });

  it("rejects SUBMITTED Evidence with mandatory reason and preserves file/links", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const control = await request(app)
      .post("/api/v1/controls")
      .set(auth(admin.accessToken))
      .send({
        title: `Control review ${randomUUID()}`,
        objective: "Synthetic objective for review tests",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic",
      })
      .expect(201);

    // Link while still DRAFT is required — evidence already SUBMITTED.
    // Create another DRAFT for link preservation test path: file fields on reviewed row.
    const before = await prisma.evidence.findUniqueOrThrow({
      where: { id: evidence.id },
    });

    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );

      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/reject`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(400);

      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/reject`)
        .set(auth(reviewer.accessToken))
        .send({ reason: "x" })
        .expect(400);

      const rejected = await request(app)
        .post(`/api/v1/evidence/${evidence.id}/reject`)
        .set(auth(reviewer.accessToken))
        .send({ reason: "Insufficient supporting detail" })
        .expect(200);

      expect(rejected.body.data.lifecycleStatus).toBe("REJECTED");
      expect(rejected.body.data.latestReviewDecision).toMatchObject({
        decision: "REJECTED",
        reason: "Insufficient supporting detail",
      });

      const after = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
      expect(after.storageKey).toBe(before.storageKey);
      expect(after.contentSha256).toBe(before.contentSha256);
      expect(after.byteSize).toBe(before.byteSize);
      expect(after.description).toBe(before.description);

      // Cannot resubmit rejected Evidence.
      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/submit`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(409);

      // Cannot re-review.
      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/reject`)
        .set(auth(reviewer.accessToken))
        .send({ reason: "Second attempt" })
        .expect(409);

      // Control link creation against rejected Evidence is blocked (not DRAFT).
      await request(app)
        .post(
          `/api/v1/evidence/${evidence.id}/controls/${control.body.data.id}`,
        )
        .set(auth(admin.accessToken))
        .send({})
        .expect(409);
    } finally {
      await grant.revoke();
    }
  });

  it("lists only SUBMITTED items in review queue with FIFO pagination", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const first = await createSubmittedEvidence(admin.accessToken);
    const second = await createSubmittedEvidence(admin.accessToken);
    const draft = await request(app)
      .post("/api/v1/evidence")
      .set(auth(admin.accessToken))
      .send({ title: `Draft not in queue ${randomUUID()}` })
      .expect(201);

    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );

      const queue = await request(app)
        .get("/api/v1/evidence/review-queue")
        .query({ page: 1, pageSize: 100 })
        .set(auth(reviewer.accessToken))
        .expect(200);

      const ids = queue.body.data.map((row: { id: string }) => row.id);
      expect(ids).toContain(first.id);
      expect(ids).toContain(second.id);
      expect(ids).not.toContain(draft.body.data.id);
      expect(
        queue.body.data.every(
          (row: { lifecycleStatus: string }) =>
            row.lifecycleStatus === "SUBMITTED",
        ),
      ).toBe(true);
      expect(queue.body.data[0]).not.toHaveProperty("storageKey");
      expect(queue.body.data[0]).toHaveProperty("hasFile");
      expect(queue.body.data[0]).toHaveProperty("activeControlLinkCount");

      const page1 = await request(app)
        .get("/api/v1/evidence/review-queue")
        .query({ page: 1, pageSize: 1 })
        .set(auth(reviewer.accessToken))
        .expect(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta.pageSize).toBe(1);
    } finally {
      await grant.revoke();
    }
  });

  it("denies COMPANY_USER without evidence:review and non-SUBMITTED states", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const user = await loginAs("user001@example.test", "User001!Secure");

    await request(app)
      .get("/api/v1/evidence/review-queue")
      .set(auth(user.accessToken))
      .expect(403);

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/approve`)
      .set(auth(user.accessToken))
      .send({})
      .expect(403);

    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      for (const status of [
        "DRAFT",
        "APPROVED",
        "REJECTED",
        "ARCHIVED",
      ] as const) {
        const row = await createSubmittedEvidence(admin.accessToken);
        await setLifecycle(row.id, status);
        await request(app)
          .post(`/api/v1/evidence/${row.id}/approve`)
          .set(auth(reviewer.accessToken))
          .send({})
          .expect(409)
          .expect((res) => {
            expect(res.body.error.code).toBe("EVIDENCE_INVALID_STATE");
          });
      }
    } finally {
      await grant.revoke();
    }
  });

  it("enforces tenant isolation with safe not-found", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const foreign = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const tokenCom2 = await switchCompany(admin.accessToken, foreign.id);

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/approve`)
      .set(auth(tokenCom2))
      .send({})
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_NOT_FOUND");
      });

    await request(app)
      .get(`/api/v1/evidence/${evidence.id}/review-decisions`)
      .set(auth(tokenCom2))
      .expect(404);
  });

  it("handles concurrent approve races with one decision and one success audit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);

    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      const responses = await Promise.all([
        request(app)
          .post(`/api/v1/evidence/${evidence.id}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
        request(app)
          .post(`/api/v1/evidence/${evidence.id}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
      ]);
      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409]);

      const decisions = await prisma.evidenceReviewDecision.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          evidenceId: evidence.id,
        },
      });
      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.decision).toBe("APPROVED");

      const audits = await prisma.auditEvent.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          entityId: evidence.id,
          action: "EVIDENCE_APPROVED",
        },
      });
      expect(audits).toHaveLength(1);

      const row = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
      expect(row.lifecycleStatus).toBe("APPROVED");
    } finally {
      await grant.revoke();
    }
  });

  it("handles concurrent approve and reject with exactly one terminal outcome", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      const responses = await Promise.all([
        request(app)
          .post(`/api/v1/evidence/${evidence.id}/approve`)
          .set(auth(reviewer.accessToken))
          .send({}),
        request(app)
          .post(`/api/v1/evidence/${evidence.id}/reject`)
          .set(auth(reviewer.accessToken))
          .send({ reason: "Concurrent reject attempt" }),
      ]);
      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409]);

      const decisions = await prisma.evidenceReviewDecision.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          evidenceId: evidence.id,
        },
      });
      expect(decisions).toHaveLength(1);

      const row = await prisma.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
      expect(["APPROVED", "REJECTED"]).toContain(row.lifecycleStatus);
      expect(row.lifecycleStatus).toBe(decisions[0]?.decision);
    } finally {
      await grant.revoke();
    }
  });

  it("keeps review decisions append-only after API review", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      const decision = await prisma.evidenceReviewDecision.findFirstOrThrow({
        where: {
          tenantId: admin.user.activeCompany.id,
          evidenceId: evidence.id,
        },
      });

      await expect(
        prisma.evidenceReviewDecision.update({
          where: { id: decision.id },
          data: { reason: "mutated" },
        }),
      ).rejects.toThrow(/append-only/i);

      await expect(
        prisma.evidenceReviewDecision.delete({ where: { id: decision.id } }),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await grant.revoke();
    }
  });

  it("does not change Policy Evidence gate behaviour after approval", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createSubmittedEvidence(admin.accessToken);
    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:review",
    });
    try {
      const reviewer = await loginAs(
        "user001@example.test",
        "User001!Secure",
      );
      await request(app)
        .post(`/api/v1/evidence/${evidence.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      // Gate remains fail-closed after Evidence approval.
      const gate = await import(
        "../src/modules/kpis/evidence-gate-service.js"
      );
      const service = new gate.EvidenceGateService();
      expect(() => service.assertSatisfied(true)).toThrowError(
        /EVIDENCE_GATE_NOT_IMPLEMENTED|not implemented/i,
      );
    } finally {
      await grant.revoke();
    }
  });
});
