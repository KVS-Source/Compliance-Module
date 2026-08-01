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

describe("KPI Evidence gate Slice 5D", () => {
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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const grantRegularApproval = async () => {
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

  const createConfiguration = async (
    token: string,
    ownerId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const definition = await prisma.kpiDefinition.upsert({
      where: { code: "KPI-SLICE5D-001" },
      update: {
        name: "Synthetic Slice 5D KPI",
        direction: "HIGHER_IS_BETTER",
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
      create: {
        code: "KPI-SLICE5D-001",
        name: "Synthetic Slice 5D KPI",
        unit: "Count",
        direction: "HIGHER_IS_BETTER",
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
    });
    return request(app)
      .post("/api/v1/kpi-configurations")
      .set(auth(token))
      .send({
        kpiDefinitionId: definition.id,
        ownerId,
        productService: `Slice 5D ${randomUUID()}`,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: "2026-07-01",
        enabled: true,
        requiresEvidence: true,
        requiresApproval: true,
        ...overrides,
      })
      .expect(201);
  };

  const createApprovedTarget = async (
    tenantId: string,
    configurationId: string,
    actorUserId: string,
    period = "2026-Q3",
  ) => {
    const target = await prisma.kpiTarget.create({
      data: {
        tenantId,
        kpiConfigurationId: configurationId,
        code: `KTG-5D-${randomUUID().slice(0, 8)}`,
        period,
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        targetValue: 100,
        approvalStatus: "APPROVED",
        submittedById: actorUserId,
        submittedAt: new Date(),
        approvedAt: new Date(),
        version: 1,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        status: "ACTIVE",
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });
    return target;
  };

  const submitActual = (
    token: string,
    configurationId: string,
    actualValue = "90",
    period = "2026-Q3",
  ) =>
    request(app)
      .post("/api/v1/kpi-actuals")
      .set(auth(token))
      .send({
        kpiConfigurationId: configurationId,
        period,
        actualValue,
      });

  const createApprovedEvidence = async (token: string, title?: string) => {
    const created = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token))
      .send({ title: title ?? `KPI Evidence ${randomUUID()}` })
      .expect(201);
    const id = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/evidence/${id}/file`)
      .set(auth(token))
      .attach("file", Buffer.from(`%PDF-1.4 kpi fixture ${randomUUID()}\n`), {
        filename: "kpi-proof.pdf",
        contentType: "application/pdf",
      })
      .expect(200);
    await request(app)
      .post(`/api/v1/evidence/${id}/submit`)
      .set(auth(token))
      .send({})
      .expect(200);
    // Reviewer must not be the submitter (admin submitted; user reviews).
    return id;
  };

  const approveEvidenceAs = async (token: string, evidenceId: string) => {
    await request(app)
      .post(`/api/v1/evidence/${evidenceId}/approve`)
      .set(auth(token))
      .send({})
      .expect(200);
  };

  it("rejects requiresEvidence without requiresApproval on create and update", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const createRes = await request(app)
      .post("/api/v1/kpi-configurations")
      .set(auth(admin.accessToken))
      .send({
        kpiDefinitionId: (
          await prisma.kpiDefinition.upsert({
            where: { code: "KPI-SLICE5D-INV" },
            update: {},
            create: {
              code: "KPI-SLICE5D-INV",
              name: "Invariant KPI",
              unit: "Count",
              direction: "HIGHER_IS_BETTER",
              frequency: "MONTHLY",
              status: "ACTIVE",
            },
          })
        ).id,
        ownerId: admin.user.id,
        productService: `Inv ${randomUUID()}`,
        reviewFrequency: "MONTHLY",
        effectiveFrom: "2026-07-01",
        requiresEvidence: true,
        requiresApproval: false,
      });
    expect(createRes.status).toBe(400);

    const valid = await createConfiguration(admin.accessToken, admin.user.id, {
      requiresEvidence: false,
      requiresApproval: false,
    });
    const patchRes = await request(app)
      .patch(`/api/v1/kpi-configurations/${valid.body.data.id}`)
      .set(auth(admin.accessToken))
      .send({ requiresEvidence: true });
    expect(patchRes.status).toBe(400);
  });

  it("approves when qualifying Evidence is linked to the exact actual", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
      );
      const submitted = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "95",
      ).expect(201);
      expect(submitted.body.data.approvalStatus).toBe("PENDING_APPROVAL");
      const actualId = submitted.body.data.id as string;

      const evidenceId = await createApprovedEvidence(admin.accessToken);
      // Link while DRAFT before submit — create fresh DRAFT for link.
      const draft = await request(app)
        .post("/api/v1/evidence")
        .set(auth(admin.accessToken))
        .send({ title: `Linkable KPI proof ${randomUUID()}` })
        .expect(201);
      const draftId = draft.body.data.id as string;
      await request(app)
        .post(`/api/v1/evidence/${draftId}/file`)
        .set(auth(admin.accessToken))
        .attach("file", Buffer.from(`%PDF-1.4 linkable ${randomUUID()}\n`), {
          filename: "linkable.pdf",
          contentType: "application/pdf",
        })
        .expect(200);
      await request(app)
        .post(`/api/v1/evidence/${draftId}/kpi-actuals/${actualId}`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(201);

      const links = await request(app)
        .get(`/api/v1/kpi-actuals/${actualId}/evidence-links`)
        .set(auth(admin.accessToken))
        .expect(200);
      expect(links.body.data.length).toBeGreaterThanOrEqual(1);
      expect(links.body.data[0]).not.toHaveProperty("storageKey");

      await request(app)
        .post(`/api/v1/evidence/${draftId}/submit`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(200);
      await approveEvidenceAs(reviewer.accessToken, draftId);

      // Unrelated APPROVED evidence without link must not matter.
      void evidenceId;

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      const actual = await prisma.kpiActual.findUniqueOrThrow({
        where: { id: actualId },
      });
      expect(actual.approvalStatus).toBe("APPROVED");
      expect(
        await prisma.kpiApproval.count({
          where: { kpiActualId: actualId, decision: "APPROVED" },
        }),
      ).toBe(1);
    } finally {
      await revoke();
    }
  });

  it("returns EVIDENCE_KPI_LINK_REQUIRED when no links exist", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
      );
      const submitted = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
      ).expect(201);

      const response = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409);
      expect(response.body.error.code).toBe("EVIDENCE_REQUIRED");
      expect(response.body.error.details.reason).toBe(
        "EVIDENCE_KPI_LINK_REQUIRED",
      );
      expect(response.body.error.message).not.toMatch(/storage|prisma|sql/i);
    } finally {
      await revoke();
    }
  });

  it("returns EVIDENCE_KPI_COVERAGE_INCOMPLETE when links exist but Evidence is not qualifying", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
      );
      const submitted = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
      ).expect(201);
      const actualId = submitted.body.data.id as string;

      const draft = await request(app)
        .post("/api/v1/evidence")
        .set(auth(admin.accessToken))
        .send({ title: `Incomplete KPI proof ${randomUUID()}` })
        .expect(201);
      const draftId = draft.body.data.id as string;
      await request(app)
        .post(`/api/v1/evidence/${draftId}/file`)
        .set(auth(admin.accessToken))
        .attach("file", Buffer.from(`%PDF-1.4 incomplete ${randomUUID()}\n`), {
          filename: "incomplete.pdf",
          contentType: "application/pdf",
        })
        .expect(200);
      await request(app)
        .post(`/api/v1/evidence/${draftId}/kpi-actuals/${actualId}`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(201);
      // Leave Evidence as DRAFT — linked but not qualifying.

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
    } finally {
      await revoke();
    }
  });

  it("preserves submit-time Risk when approval gate fails", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
      );
      // Miss target → AMBER/RED risk on submit.
      const submitted = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "50",
      ).expect(201);
      const actualId = submitted.body.data.id as string;
      const riskBefore = await prisma.risk.count({
        where: { kpiActualId: actualId },
      });
      expect(riskBefore).toBe(1);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409);

      expect(
        await prisma.risk.count({ where: { kpiActualId: actualId } }),
      ).toBe(1);
      expect(
        await prisma.kpiActual.findUniqueOrThrow({
          where: { id: actualId },
          select: { approvalStatus: true },
        }),
      ).toEqual({ approvalStatus: "PENDING_APPROVAL" });
    } finally {
      await revoke();
    }
  });

  it("rejects link mutation on APPROVED actual and retains links on resubmit", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
      );
      const submitted = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "98",
      ).expect(201);
      const actualId = submitted.body.data.id as string;

      const draft = await request(app)
        .post("/api/v1/evidence")
        .set(auth(admin.accessToken))
        .send({ title: `Resubmit proof ${randomUUID()}` })
        .expect(201);
      const draftId = draft.body.data.id as string;
      await request(app)
        .post(`/api/v1/evidence/${draftId}/file`)
        .set(auth(admin.accessToken))
        .attach("file", Buffer.from(`%PDF-1.4 resubmit ${randomUUID()}\n`), {
          filename: "resubmit.pdf",
          contentType: "application/pdf",
        })
        .expect(200);
      await request(app)
        .post(`/api/v1/evidence/${draftId}/kpi-actuals/${actualId}`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(201);
      await request(app)
        .post(`/api/v1/evidence/${draftId}/submit`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(200);
      await approveEvidenceAs(reviewer.accessToken, draftId);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/reject`)
        .set(auth(reviewer.accessToken))
        .send({ reason: "Need resubmission for process check" })
        .expect(200);

      const linksAfterReject = await prisma.evidenceKpiActualLink.count({
        where: { kpiActualId: actualId, isActive: true },
      });
      expect(linksAfterReject).toBe(1);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/resubmit`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(200);

      expect(
        await prisma.evidenceKpiActualLink.count({
          where: { kpiActualId: actualId, isActive: true },
        }),
      ).toBe(1);

      await request(app)
        .post(`/api/v1/kpi-actuals/${actualId}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);

      const anotherDraft = await request(app)
        .post("/api/v1/evidence")
        .set(auth(admin.accessToken))
        .send({ title: `Too late ${randomUUID()}` })
        .expect(201);
      await request(app)
        .post(
          `/api/v1/evidence/${anotherDraft.body.data.id}/kpi-actuals/${actualId}`,
        )
        .set(auth(admin.accessToken))
        .send({})
        .expect(409);
    } finally {
      await revoke();
    }
  });

  it("does not allow wrong-period actual links to satisfy another actual", async () => {
    const revoke = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: reviewer.user.id },
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
        "2026-Q3",
      );
      await createApprovedTarget(
        admin.user.activeCompany.id,
        configuration.body.data.id,
        admin.user.id,
        "2026-Q4",
      );
      const a1 = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "90",
        "2026-Q3",
      ).expect(201);
      const a2 = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "91",
        "2026-Q4",
      ).expect(201);

      const draft = await request(app)
        .post("/api/v1/evidence")
        .set(auth(admin.accessToken))
        .send({ title: `Period proof ${randomUUID()}` })
        .expect(201);
      const draftId = draft.body.data.id as string;
      await request(app)
        .post(`/api/v1/evidence/${draftId}/file`)
        .set(auth(admin.accessToken))
        .attach("file", Buffer.from(`%PDF-1.4 period ${randomUUID()}\n`), {
          filename: "period.pdf",
          contentType: "application/pdf",
        })
        .expect(200);
      await request(app)
        .post(
          `/api/v1/evidence/${draftId}/kpi-actuals/${a1.body.data.id}`,
        )
        .set(auth(admin.accessToken))
        .send({})
        .expect(201);
      await request(app)
        .post(`/api/v1/evidence/${draftId}/submit`)
        .set(auth(admin.accessToken))
        .send({})
        .expect(200);
      await approveEvidenceAs(reviewer.accessToken, draftId);

      // a2 has no links
      await request(app)
        .post(`/api/v1/kpi-actuals/${a2.body.data.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(409)
        .expect((res) => {
          expect(res.body.error.details.reason).toBe(
            "EVIDENCE_KPI_LINK_REQUIRED",
          );
        });

      // a1 has qualifying link
      await request(app)
        .post(`/api/v1/kpi-actuals/${a1.body.data.id}/approve`)
        .set(auth(reviewer.accessToken))
        .send({})
        .expect(200);
    } finally {
      await revoke();
    }
  });
});
