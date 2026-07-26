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

describe("KPI actual approval workflow Slice C", () => {
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

  const grantRegularApproval = async () => {
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company.id, code: "COMPANY_USER" },
      },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "kpi-actual:approve" },
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

  const createConfiguration = async (
    token: string,
    ownerId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const definition = await prisma.kpiDefinition.upsert({
      where: { code: "KPI-SLICEC-001" },
      update: {
        name: "Synthetic Slice C KPI",
        direction: "HIGHER_IS_BETTER",
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
      create: {
        code: "KPI-SLICEC-001",
        name: "Synthetic Slice C KPI",
        unit: "Count",
        direction: "HIGHER_IS_BETTER",
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
    });
    return request(app)
      .post("/api/v1/kpi-configurations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiDefinitionId: definition.id,
        ownerId,
        productService: `Slice C ${randomUUID()}`,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: "2026-07-01",
        enabled: true,
        requiresEvidence: false,
        requiresApproval: true,
        ...overrides,
      })
      .expect(201);
  };

  const createApprovedTarget = async (
    tenantId: string,
    configurationId: string,
    actorUserId: string,
    targetValue = "100",
  ) =>
    prisma.kpiTarget.create({
      data: {
        tenantId,
        kpiConfigurationId: configurationId,
        code: `KTG-SLICEC-${randomUUID()}`,
        period: "FY26-27 Q1",
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        targetValue,
        approvalStatus: "APPROVED",
        submittedById: actorUserId,
        submittedAt: new Date(),
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });

  const submitActual = (
    token: string,
    configurationId: string,
    actualValue = "100",
  ) =>
    request(app)
      .post("/api/v1/kpi-actuals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiConfigurationId: configurationId,
        period: "FY26-27 Q1",
        actualValue,
        comments: "Synthetic Slice C actual",
      });

  it("seeds kpi-actual:approve for Company Admin and excludes Company User", async () => {
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const [adminRole, companyUserRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: {
          tenantId_code: { tenantId: company.id, code: "COMPANY_ADMIN" },
        },
        include: { permissions: { include: { permission: true } } },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          tenantId_code: { tenantId: company.id, code: "COMPANY_USER" },
        },
        include: { permissions: { include: { permission: true } } },
      }),
    ]);
    expect(
      adminRole.permissions.map(({ permission }) => permission.code),
    ).toContain("kpi-actual:approve");
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("kpi-actual:approve");

    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const regular = await loginAs("user001@example.test", "User001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    await createApprovedTarget(
      admin.user.activeCompany.id,
      configuration.body.data.id,
      admin.user.id,
    );
    const actual = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
    ).expect(201);
    await request(app)
      .post(`/api/v1/kpi-actuals/${actual.body.data.id}/approve`)
      .set("Authorization", `Bearer ${regular.accessToken}`)
      .expect(403);
  });

  it("automatically approves without a fake reviewer when approval is not required", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      { requiresApproval: false },
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

    expect(submitted.body.data).toMatchObject({
      approvalStatus: "APPROVED",
      approvedBy: null,
    });
    expect(submitted.body.data.approvedAt).toBe(
      submitted.body.data.submittedAt,
    );
    const approvals = await prisma.kpiApproval.findMany({
      where: { kpiActualId: submitted.body.data.id },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      decision: "APPROVED",
      reviewerId: null,
    });
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: submitted.body.data.id,
          action: "KPI_ACTUAL_APPROVED",
          metadata: { path: ["automatic"], equals: true },
        },
      }),
    ).toBe(1);
  });

  it("enforces self-approval and the configured approver", async () => {
    const removeApproval = await grantRegularApproval();
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
      expect(submitted.body.data.approvalStatus).toBe("PENDING_APPROVAL");

      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(403);
      const approved = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .send({ comments: "Synthetic approval review complete" })
        .expect(200);
      expect(approved.body.data).toMatchObject({
        approvalStatus: "APPROVED",
        approvedBy: { id: reviewer.user.id },
      });
      expect(
        await prisma.kpiApproval.findMany({
          where: { kpiActualId: submitted.body.data.id },
        }),
      ).toEqual([
        expect.objectContaining({
          reviewerId: reviewer.user.id,
          decision: "APPROVED",
          comments: "Synthetic approval review complete",
        }),
      ]);
    } finally {
      await removeApproval();
    }
  });

  it("falls back when the configured approver submitted the actual", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        { approverId: admin.user.id },
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

      const approved = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .expect(200);
      expect(approved.body.data.approvedBy.id).toBe(reviewer.user.id);
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          entityId: submitted.body.data.id,
          action: "KPI_ACTUAL_APPROVED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit.metadata).toMatchObject({
        automatic: false,
        configuredApproverFallback: true,
      });
    } finally {
      await removeApproval();
    }
  });

  it("keeps the linked Risk unchanged through reject, resubmit and approve", async () => {
    const removeApproval = await grantRegularApproval();
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
        "80",
      ).expect(201);
      const [riskBefore, tenantBefore, actualBefore] = await Promise.all([
        prisma.risk.findFirstOrThrow({
          where: { kpiActualId: submitted.body.data.id },
        }),
        prisma.tenant.findUniqueOrThrow({
          where: { id: admin.user.activeCompany.id },
          select: { nextRiskNumber: true },
        }),
        prisma.kpiActual.findUniqueOrThrow({
          where: { id: submitted.body.data.id },
        }),
      ]);

      const rejected = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/reject`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .send({ reason: "Synthetic review correction required" })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        approvalStatus: "REJECTED",
        rejectionReason: "Synthetic review correction required",
        risk: { id: riskBefore.id, status: "OPEN" },
      });

      const resubmitted = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/resubmit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ comments: "Synthetic resubmission without data changes" })
        .expect(200);
      expect(resubmitted.body.data.approvalStatus).toBe("PENDING_APPROVAL");

      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .expect(200);

      const [riskAfter, tenantAfter, actualAfter, approvals, workflowAudits] =
        await Promise.all([
          prisma.risk.findUniqueOrThrow({ where: { id: riskBefore.id } }),
          prisma.tenant.findUniqueOrThrow({
            where: { id: admin.user.activeCompany.id },
            select: { nextRiskNumber: true },
          }),
          prisma.kpiActual.findUniqueOrThrow({
            where: { id: submitted.body.data.id },
          }),
          prisma.kpiApproval.findMany({
            where: { kpiActualId: submitted.body.data.id },
            orderBy: { decidedAt: "asc" },
          }),
          prisma.auditEvent.findMany({
            where: {
              entityId: submitted.body.data.id,
              action: {
                in: [
                  "KPI_ACTUAL_REJECTED",
                  "KPI_ACTUAL_RESUBMITTED",
                  "KPI_ACTUAL_APPROVED",
                ],
              },
            },
          }),
        ]);
      expect(riskAfter).toMatchObject({
        id: riskBefore.id,
        code: riskBefore.code,
        status: "OPEN",
        inherentScore: riskBefore.inherentScore,
      });
      expect(riskAfter.updatedAt).toEqual(riskBefore.updatedAt);
      expect(tenantAfter).toEqual(tenantBefore);
      expect(
        await prisma.risk.count({ where: { kpiActualId: actualAfter.id } }),
      ).toBe(1);
      expect(actualAfter).toMatchObject({
        actualValue: actualBefore.actualValue,
        targetValueSnapshot: actualBefore.targetValueSnapshot,
        variance: actualBefore.variance,
        ragStatus: actualBefore.ragStatus,
        approvalStatus: "APPROVED",
      });
      expect(approvals.map(({ decision }) => decision)).toEqual([
        "REJECTED",
        "RESUBMITTED",
        "APPROVED",
      ]);
      expect(workflowAudits).toHaveLength(3);
      for (const audit of workflowAudits) {
        expect(audit.metadata).toMatchObject({
          linkedRiskId: riskBefore.id,
          linkedRiskStatus: "OPEN",
        });
      }
    } finally {
      await removeApproval();
    }
  });

  it("uses current configuration and auto-approves a status-only resubmission", async () => {
    const removeApproval = await grantRegularApproval();
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
      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/reject`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .send({ reason: "Synthetic resubmission requested" })
        .expect(200);
      await request(app)
        .patch(`/api/v1/kpi-configurations/${configuration.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ requiresApproval: false })
        .expect(200);

      const resubmitted = await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/resubmit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(resubmitted.body.data).toMatchObject({
        approvalStatus: "APPROVED",
        approvedBy: null,
        rejectionReason: null,
      });
      const approvals = await prisma.kpiApproval.findMany({
        where: { kpiActualId: submitted.body.data.id },
      });
      expect(approvals.map(({ decision }) => decision).sort()).toEqual([
        "APPROVED",
        "REJECTED",
        "RESUBMITTED",
      ]);
      expect(
        approvals.find(({ decision }) => decision === "APPROVED")?.reviewerId,
      ).toBeNull();
    } finally {
      await removeApproval();
    }
  });

  it("fails closed at the manual evidence gate without partial writes", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        {
          approverId: reviewer.user.id,
          requiresEvidence: true,
          requiresApproval: true,
        },
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
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .expect(501);
      expect(response.body.error.code).toBe("EVIDENCE_GATE_NOT_IMPLEMENTED");
      expect(
        await prisma.kpiActual.findUniqueOrThrow({
          where: { id: submitted.body.data.id },
          select: { approvalStatus: true },
        }),
      ).toEqual({ approvalStatus: "PENDING_APPROVAL" });
      expect(
        await prisma.kpiApproval.count({
          where: { kpiActualId: submitted.body.data.id },
        }),
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityId: submitted.body.data.id,
            action: "KPI_ACTUAL_APPROVED",
          },
        }),
      ).toBe(0);
    } finally {
      await removeApproval();
    }
  });

  it("rolls back automatic submission approval when evidence is required", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      { requiresEvidence: true, requiresApproval: false },
    );
    await createApprovedTarget(
      admin.user.activeCompany.id,
      configuration.body.data.id,
      admin.user.id,
    );
    const before = await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: admin.user.activeCompany.id },
        select: { nextRiskNumber: true, nextKpiActualNumber: true },
      }),
      prisma.risk.count({
        where: { tenantId: admin.user.activeCompany.id },
      }),
      prisma.auditEvent.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: {
            in: ["KPI_ACTUAL_SUBMITTED", "KPI_ACTUAL_APPROVED", "RISK_CREATED"],
          },
        },
      }),
      prisma.kpiActual.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          kpiConfigurationId: configuration.body.data.id,
        },
      }),
    ]);

    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "80",
    ).expect(501);
    expect(response.body.error.code).toBe("EVIDENCE_GATE_NOT_IMPLEMENTED");
    expect(
      await prisma.kpiActual.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          kpiConfigurationId: configuration.body.data.id,
        },
      }),
    ).toBe(before[3]);
    expect(
      await prisma.tenant.findUniqueOrThrow({
        where: { id: admin.user.activeCompany.id },
        select: { nextRiskNumber: true, nextKpiActualNumber: true },
      }),
    ).toEqual({
      nextRiskNumber: before[0].nextRiskNumber,
      nextKpiActualNumber: before[0].nextKpiActualNumber,
    });
    expect(
      await prisma.risk.count({
        where: { tenantId: admin.user.activeCompany.id },
      }),
    ).toBe(before[1]);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: {
            in: ["KPI_ACTUAL_SUBMITTED", "KPI_ACTUAL_APPROVED", "RISK_CREATED"],
          },
        },
      }),
    ).toBe(before[2]);
  });

  it("allows an explicit decision on a legacy SUBMITTED actual", async () => {
    const removeApproval = await grantRegularApproval();
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
      await prisma.kpiActual.update({
        where: { id: submitted.body.data.id },
        data: { approvalStatus: "SUBMITTED" },
      });

      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .expect(200);
      expect(
        await prisma.kpiApproval.findMany({
          where: { kpiActualId: submitted.body.data.id },
        }),
      ).toEqual([
        expect.objectContaining({
          decision: "APPROVED",
          reviewerId: reviewer.user.id,
        }),
      ]);
    } finally {
      await removeApproval();
    }
  });

  it("serializes concurrent approval decisions into one history event", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
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

      const responses = await Promise.all([
        request(app)
          .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
          .set("Authorization", `Bearer ${reviewer.accessToken}`)
          .send({ comments: "Synthetic concurrent approval" }),
        request(app)
          .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/reject`)
          .set("Authorization", `Bearer ${reviewer.accessToken}`)
          .send({ reason: "Synthetic concurrent rejection" }),
      ]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(
        await prisma.kpiApproval.count({
          where: { kpiActualId: submitted.body.data.id },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityId: submitted.body.data.id,
            action: {
              in: ["KPI_ACTUAL_APPROVED", "KPI_ACTUAL_REJECTED"],
            },
          },
        }),
      ).toBe(1);
    } finally {
      await removeApproval();
    }
  });

  it("rolls back actual state and history when the workflow audit fails", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
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

      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "reject_kpi_actual_approved_test" ON "audit_events"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS reject_kpi_actual_approved_test()`,
      );
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION reject_kpi_actual_approved_test()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW."action" = 'KPI_ACTUAL_APPROVED' THEN
            RAISE EXCEPTION 'synthetic KPI actual approval audit failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "reject_kpi_actual_approved_test"
        BEFORE INSERT ON "audit_events"
        FOR EACH ROW EXECUTE FUNCTION reject_kpi_actual_approved_test()
      `);
      try {
        await request(app)
          .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
          .set("Authorization", `Bearer ${reviewer.accessToken}`)
          .expect(500);
        expect(
          await prisma.kpiActual.findUniqueOrThrow({
            where: { id: submitted.body.data.id },
            select: { approvalStatus: true },
          }),
        ).toEqual({ approvalStatus: "PENDING_APPROVAL" });
        expect(
          await prisma.kpiApproval.count({
            where: { kpiActualId: submitted.body.data.id },
          }),
        ).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "reject_kpi_actual_approved_test" ON "audit_events"`,
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS reject_kpi_actual_approved_test()`,
        );
      }
    } finally {
      await removeApproval();
    }
  });

  it("keeps approval, rejection and resubmission tenant-isolated", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const company2 = admin.user.companies.find(
        ({ code }) => code === "COM-002",
      );
      expect(company2).toBeTruthy();
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
      const company2Token = await switchCompany(
        admin.accessToken,
        company2!.id,
      );

      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/approve`)
        .set("Authorization", `Bearer ${company2Token}`)
        .expect(404);
      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/reject`)
        .set("Authorization", `Bearer ${company2Token}`)
        .send({ reason: "Synthetic cross-Company rejection" })
        .expect(404);
      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/reject`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .send({ reason: "Synthetic tenant-isolation resubmission" })
        .expect(200);
      await request(app)
        .post(`/api/v1/kpi-actuals/${submitted.body.data.id}/resubmit`)
        .set("Authorization", `Bearer ${company2Token}`)
        .expect(404);
    } finally {
      await removeApproval();
    }
  });

  it("enforces approval tenancy, system-reviewer, self-approval and append-only constraints", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      { requiresApproval: false },
    );
    await createApprovedTarget(
      admin.user.activeCompany.id,
      configuration.body.data.id,
      admin.user.id,
    );
    const automatic = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
    ).expect(201);
    const approval = await prisma.kpiApproval.findFirstOrThrow({
      where: { kpiActualId: automatic.body.data.id },
    });

    await expect(
      prisma.kpiApproval.update({
        where: { id: approval.id },
        data: { comments: "Synthetic mutation" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.kpiApproval.delete({ where: { id: approval.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.kpiApproval.create({
        data: {
          tenantId: admin.user.activeCompany.id,
          kpiActualId: automatic.body.data.id,
          reviewerId: null,
          decision: "REJECTED",
          comments: "Synthetic invalid system rejection",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.kpiApproval.create({
        data: {
          tenantId: company2!.id,
          kpiActualId: automatic.body.data.id,
          reviewerId: admin.user.id,
          decision: "APPROVED",
        },
      }),
    ).rejects.toThrow();

    const pendingConfiguration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    await createApprovedTarget(
      admin.user.activeCompany.id,
      pendingConfiguration.body.data.id,
      admin.user.id,
    );
    const pending = await submitActual(
      admin.accessToken,
      pendingConfiguration.body.data.id,
    ).expect(201);
    await expect(
      prisma.kpiActual.update({
        where: { id: pending.body.data.id },
        data: {
          approvalStatus: "APPROVED",
          approvedById: admin.user.id,
          approvedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
