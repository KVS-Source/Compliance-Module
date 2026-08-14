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

describe("Evidence API Slice 5.1", () => {
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

  const createEvidence = async (
    token: string,
    body: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token))
      .send({
        title: `Evidence ${randomUUID()}`,
        ...body,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      lifecycleStatus: string;
      hasFile: boolean;
      supersedesEvidenceId: string | null;
    };
  };

  it("requires authentication", async () => {
    await request(app).get("/api/v1/evidence").expect(401);
    await request(app)
      .post("/api/v1/evidence")
      .send({ title: "Unauthenticated" })
      .expect(401);
  });

  it("enforces evidence:read and evidence:write permissions", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const user = await loginAs("user001@example.test", "User001!Secure");

    // COMPANY_USER has evidence:read via seed filter, not write.
    await request(app)
      .get("/api/v1/evidence")
      .set(auth(user.accessToken))
      .expect(200);

    await request(app)
      .post("/api/v1/evidence")
      .set(auth(user.accessToken))
      .send({ title: "Should fail without write" })
      .expect(403);

    const writeGrant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:write",
    });
    try {
      // Permissions are embedded in the access token at login.
      const reloaded = await loginAs("user001@example.test", "User001!Secure");
      const created = await request(app)
        .post("/api/v1/evidence")
        .set(auth(reloaded.accessToken))
        .send({ title: `Writable ${randomUUID()}` })
        .expect(201);
      expect(created.body.data.lifecycleStatus).toBe("DRAFT");
      expect(created.body.data.hasFile).toBe(false);
      expect(created.body.data).not.toHaveProperty("storageKey");
    } finally {
      await writeGrant.revoke();
    }

    // Admin can create via wildcard.
    await createEvidence(admin.accessToken);
  });

  it("creates DRAFT Evidence with server EVD codes and audit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: company.id },
      select: { nextEvidenceNumber: true },
    });

    const first = await createEvidence(admin.accessToken, {
      title: "First evidence item",
      description: "Synthetic description",
    });
    const second = await createEvidence(admin.accessToken, {
      title: "Second evidence item",
    });

    expect(first.code).toMatch(/^EVD-\d{3,}$/);
    expect(second.code).toMatch(/^EVD-\d{3,}$/);
    expect(first.code).not.toBe(second.code);
    expect(first.lifecycleStatus).toBe("DRAFT");
    expect(first.hasFile).toBe(false);

    const after = await prisma.tenant.findUniqueOrThrow({
      where: { id: company.id },
      select: { nextEvidenceNumber: true },
    });
    expect(after.nextEvidenceNumber).toBe(before.nextEvidenceNumber + 2);

    const audits = await prisma.auditEvent.findMany({
      where: {
        tenantId: company.id,
        entityType: "EVIDENCE",
        entityId: first.id,
        action: "EVIDENCE_CREATED",
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      code: first.code,
      lifecycleStatus: "DRAFT",
      hasFile: false,
    });
    const metadata = audits[0]?.metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("description");
    expect(metadata).not.toHaveProperty("storageKey");
  });

  it("lists, filters, details, patches and archives Evidence", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const marker = randomUUID();
    const created = await createEvidence(admin.accessToken, {
      title: `Listable ${marker}`,
      issueDate: "2026-07-01",
      expiresAt: "2026-12-31",
    });

    const listed = await request(app)
      .get("/api/v1/evidence")
      .query({ q: marker, lifecycleStatus: "DRAFT", page: 1, pageSize: 20 })
      .set(auth(admin.accessToken))
      .expect(200);
    expect(listed.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(
      listed.body.data.some((row: { id: string }) => row.id === created.id),
    ).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/evidence/${created.id}`)
      .set(auth(admin.accessToken))
      .expect(200);
    expect(detail.body.data.code).toBe(created.code);
    expect(detail.body.data.issueDate).toBe("2026-07-01");
    expect(detail.body.data).not.toHaveProperty("storageKey");

    const patched = await request(app)
      .patch(`/api/v1/evidence/${created.id}`)
      .set(auth(admin.accessToken))
      .send({ title: `Patched ${marker}` })
      .expect(200);
    expect(patched.body.data.title).toBe(`Patched ${marker}`);

    const submit = await request(app)
      .post(`/api/v1/evidence/${created.id}/submit`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    expect(submit.body.error.code).toBe("EVIDENCE_FILE_REQUIRED");

    const archived = await request(app)
      .post(`/api/v1/evidence/${created.id}/archive`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(archived.body.data.lifecycleStatus).toBe("ARCHIVED");
    expect(archived.body.data.archivedAt).toBeTruthy();

    await request(app)
      .get(`/api/v1/evidence/${created.id}`)
      .set(auth(admin.accessToken))
      .expect(200);

    await request(app)
      .patch(`/api/v1/evidence/${created.id}`)
      .set(auth(admin.accessToken))
      .send({ title: "Should fail" })
      .expect(409);

    await request(app)
      .post(`/api/v1/evidence/${created.id}/archive`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);

    const audit = await request(app)
      .get(`/api/v1/evidence/${created.id}/audit-events`)
      .set(auth(admin.accessToken))
      .expect(200);
    const actions = audit.body.data.map(
      (row: { action: string }) => row.action,
    );
    expect(actions).toContain("EVIDENCE_CREATED");
    expect(actions).toContain("EVIDENCE_UPDATED");
    expect(actions).toContain("EVIDENCE_ARCHIVED");
  });

  it("supports replacement of REJECTED and ARCHIVED Evidence only", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const rejected = await createEvidence(admin.accessToken, {
      title: "Rejected prior",
    });
    await prisma.evidence.update({
      where: { id: rejected.id },
      data: { lifecycleStatus: "REJECTED" },
    });

    const replacement = await createEvidence(admin.accessToken, {
      title: "Replacement for rejected",
      supersedesEvidenceId: rejected.id,
    });
    expect(replacement.supersedesEvidenceId).toBe(rejected.id);
    expect(replacement.lifecycleStatus).toBe("DRAFT");
    expect(replacement.code).not.toBe(rejected.code);

    const priorUnchanged = await prisma.evidence.findUniqueOrThrow({
      where: { id: rejected.id },
    });
    expect(priorUnchanged.lifecycleStatus).toBe("REJECTED");

    const replacementAudits = await prisma.auditEvent.findMany({
      where: {
        tenantId: company.id,
        entityId: replacement.id,
        action: "EVIDENCE_REPLACEMENT_CREATED",
      },
    });
    expect(replacementAudits).toHaveLength(1);

    const archived = await createEvidence(admin.accessToken, {
      title: "Archived prior",
    });
    await request(app)
      .post(`/api/v1/evidence/${archived.id}/archive`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);

    const archivedReplacement = await createEvidence(admin.accessToken, {
      title: "Replacement for archived",
      supersedesEvidenceId: archived.id,
    });
    expect(archivedReplacement.supersedesEvidenceId).toBe(archived.id);

    const draft = await createEvidence(admin.accessToken, {
      title: "Still draft",
    });
    const invalid = await request(app)
      .post("/api/v1/evidence")
      .set(auth(admin.accessToken))
      .send({
        title: "Bad supersede",
        supersedesEvidenceId: draft.id,
      })
      .expect(409);
    expect(invalid.body.error.code).toBe("EVIDENCE_SUPERSEDE_INVALID");
  });

  it("enforces tenant isolation for read, write, owner, department and supersede", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company001 = admin.user.companies.find((c) => c.code === "COM-001")!;
    const company002 = admin.user.companies.find((c) => c.code === "COM-002")!;
    const token001 = await switchCompany(admin.accessToken, company001.id);
    const token002 = await switchCompany(admin.accessToken, company002.id);

    const in001 = await createEvidence(token001, { title: "Tenant 001 item" });
    const in002 = await createEvidence(token002, { title: "Tenant 002 item" });

    await request(app)
      .get(`/api/v1/evidence/${in002.id}`)
      .set(auth(token001))
      .expect(404);
    await request(app)
      .patch(`/api/v1/evidence/${in002.id}`)
      .set(auth(token001))
      .send({ title: "Cross tenant" })
      .expect(404);
    await request(app)
      .post(`/api/v1/evidence/${in002.id}/archive`)
      .set(auth(token001))
      .send({})
      .expect(404);

    // User active only in COM-002 (no COM-001 membership).
    const foreignOnlyUser = await prisma.user.create({
      data: {
        code: `EVD-ISO-${randomUUID().slice(0, 8)}`,
        email: `evd-iso-${randomUUID()}@example.test`,
        fullName: "Evidence Isolation User",
        passwordHash: "not-used-in-this-test",
        status: "ACTIVE",
        memberships: {
          create: {
            tenantId: company002.id,
            status: "ACTIVE",
          },
        },
      },
    });
    const ownerReject = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token001))
      .send({
        title: "Bad owner",
        ownerId: foreignOnlyUser.id,
      })
      .expect(400);
    expect(ownerReject.body.error.code).toBe("EVIDENCE_OWNER_INVALID");

    const foreignDept = await prisma.orgDepartment.findFirstOrThrow({
      where: { tenant: { code: "COM-002" }, status: "ACTIVE" },
    });
    const deptReject = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token001))
      .send({
        title: "Bad department",
        departmentId: foreignDept.id,
      })
      .expect(400);
    expect(deptReject.body.error.code).toBe("EVIDENCE_DEPARTMENT_INVALID");

    const supersedeReject = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token001))
      .send({
        title: "Bad supersede tenant",
        supersedesEvidenceId: in002.id,
      })
      .expect(409);
    expect(supersedeReject.body.error.code).toBe("EVIDENCE_SUPERSEDE_INVALID");

    // per-tenant counters remain independent
    const t1 = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
      select: { nextEvidenceNumber: true },
    });
    const t2 = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
      select: { nextEvidenceNumber: true },
    });
    expect(t1.nextEvidenceNumber).toBeGreaterThan(1);
    expect(t2.nextEvidenceNumber).toBeGreaterThan(1);
    void in001;
  });

  it("protects review decisions as append-only and enforces composite link FKs", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const otherCompany = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const evidence = await createEvidence(admin.accessToken, {
      title: "Constraint fixture",
    });
    const decision = await prisma.evidenceReviewDecision.create({
      data: {
        tenantId: company.id,
        evidenceId: evidence.id,
        actedById: admin.user.id,
        decision: "APPROVED",
        reason: null,
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

    const foreignControl = await prisma.control.findFirst({
      where: { tenantId: otherCompany.id },
    });
    if (foreignControl) {
      await expect(
        prisma.evidenceControlLink.create({
          data: {
            tenantId: company.id,
            evidenceId: evidence.id,
            controlId: foreignControl.id,
            createdById: admin.user.id,
            updatedById: admin.user.id,
          },
        }),
      ).rejects.toThrow();
    }

    const foreignCheckpoint = await prisma.checkpoint.findFirst({
      where: { tenantId: otherCompany.id },
    });
    if (foreignCheckpoint) {
      await expect(
        prisma.evidenceCheckpointLink.create({
          data: {
            tenantId: company.id,
            evidenceId: evidence.id,
            checkpointId: foreignCheckpoint.id,
            createdById: admin.user.id,
            updatedById: admin.user.id,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it("does not expose legacy upload path or hard-delete Evidence", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await createEvidence(admin.accessToken);
    // Approve/reject exist (Slice 5.4) but reject DRAFT with invalid state.
    await request(app)
      .post(`/api/v1/evidence/${created.id}/approve`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    await request(app)
      .post(`/api/v1/evidence/${created.id}/reject`)
      .set(auth(admin.accessToken))
      .send({ reason: "not submitted yet" })
      .expect(409);
    await request(app)
      .post(`/api/v1/evidence/${created.id}/upload`)
      .set(auth(admin.accessToken))
      .expect(404);
    await request(app)
      .delete(`/api/v1/evidence/${created.id}`)
      .set(auth(admin.accessToken))
      .expect(404);
  });
});
