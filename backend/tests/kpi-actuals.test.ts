import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { KpiDirection, Prisma, PrismaClient } from "@prisma/client";

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

describe("KPI actual submission and automatic risk creation Slice D", () => {
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

  const definitionFor = (direction: KpiDirection) =>
    prisma.kpiDefinition.upsert({
      where: { code: `KPI-SLICEB-${direction}` },
      update: {
        name: `Synthetic ${direction} KPI`,
        direction,
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
      create: {
        code: `KPI-SLICEB-${direction}`,
        name: `Synthetic ${direction} KPI`,
        unit: "Count",
        direction,
        frequency: "QUARTERLY",
        status: "ACTIVE",
      },
    });

  const createConfiguration = async (
    token: string,
    ownerId: string,
    direction: KpiDirection = "HIGHER_IS_BETTER",
    overrides: Record<string, unknown> = {},
  ) => {
    const definition = await definitionFor(direction);
    return request(app)
      .post("/api/v1/kpi-configurations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiDefinitionId: definition.id,
        ownerId,
        productService: `Slice B ${randomUUID()}`,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: "2026-07-01",
        enabled: true,
        requiresEvidence: false,
        requiresApproval: false,
        ...overrides,
      });
  };

  const createApprovedTarget = async (
    token: string,
    configurationId: string,
    targetValue = "100.0000",
    overrides: Record<string, unknown> = {},
  ) => {
    const target = await request(app)
      .post("/api/v1/kpi-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiConfigurationId: configurationId,
        code: `KTG-SLICEB-${randomUUID()}`,
        period: "FY26-27 Q1",
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        targetValue,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2026-09-30",
        ...overrides,
      })
      .expect(201);
    return request(app)
      .post(`/api/v1/kpi-targets/${target.body.data.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  };

  const submitActual = (
    token: string,
    configurationId: string,
    actualValue: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request(app)
      .post("/api/v1/kpi-actuals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiConfigurationId: configurationId,
        period: "FY26-27 Q1",
        actualValue,
        ...overrides,
      });

  const actualsForConfiguration = (tenantId: string, configurationId: string) =>
    prisma.kpiActual.count({
      where: { tenantId, kpiConfigurationId: configurationId },
    });

  const provisionFreshAdminTenant = async (adminUserId: string) => {
    const wildcard = await prisma.permission.findUniqueOrThrow({
      where: { code: "*" },
    });
    const tenant = await prisma.tenant.create({
      data: {
        code: `COM-RISK-SEQUENCE-${randomUUID()}`,
        name: "Synthetic Risk Sequence Company",
      },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: "COMPANY_ADMIN",
        name: "Synthetic Company Administrator",
        permissions: { create: { permissionId: wildcard.id } },
      },
    });
    await prisma.userCompany.create({
      data: { userId: adminUserId, tenantId: tenant.id },
    });
    await prisma.userRole.create({
      data: {
        userId: adminUserId,
        roleId: role.id,
        tenantId: tenant.id,
        assignedBy: adminUserId,
      },
    });
    return tenant;
  };

  it("seeds KPI actual and Risk permissions explicitly for admins and excludes Company User", async () => {
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
    ).toContain("kpi-actual:write");
    expect(
      adminRole.permissions.map(({ permission }) => permission.code),
    ).toContain("kpi-actual:approve");
    expect(
      adminRole.permissions.map(({ permission }) => permission.code),
    ).toContain("risk:read");
    expect(
      adminRole.permissions.map(({ permission }) => permission.code),
    ).toContain("risk:write");
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("kpi-actual:write");
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("kpi-actual:approve");
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("risk:read");
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("risk:write");

    const regular = await loginAs("user001@example.test", "User001!Secure");
    await submitActual(regular.accessToken, randomUUID(), "1").expect(403);
    await request(app)
      .get("/api/v1/risks")
      .set("Authorization", `Bearer ${regular.accessToken}`)
      .expect(403);
  });

  it("rejects body-derived identity, codes, calculations, approval fields and Risk fields", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(admin.accessToken, configuration.body.data.id);

    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "95",
      {
        code: `ACT-UNTRUSTED-${randomUUID()}`,
        tenantId: randomUUID(),
        companyId: randomUUID(),
        kpiTargetId: randomUUID(),
        targetValueSnapshot: "1",
        periodStart: "2000-01-01",
        periodEnd: "2000-01-02",
        variance: "1",
        variancePercentage: "1",
        ragStatus: "GREEN",
        targetMet: true,
        approvalStatus: "APPROVED",
        submittedById: randomUUID(),
        submittedAt: new Date().toISOString(),
        approvedById: randomUUID(),
        approvedAt: new Date().toISOString(),
        risk: {
          code: "RSK-CALLER",
          title: "Caller-controlled risk",
          inherentLikelihood: 1,
          inherentImpact: 1,
        },
        riskCode: "RSK-CALLER",
        riskTitle: "Caller-controlled risk",
        kpiRiskClass: "MINOR",
        generalLevel: "LOW",
      },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      response.body.error.details.some((detail: { message: string }) =>
        detail.message.includes("Unrecognized key"),
      ),
    ).toBe(true);
  });

  it("rejects a caller-supplied code and each Risk field on an otherwise valid submission", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const callerControlledFields: Array<[string, unknown]> = [
      ["code", "ACT-CALLER-001"],
      [
        "risk",
        {
          code: "RSK-CALLER",
          title: "Caller-controlled risk",
          inherentLikelihood: 1,
          inherentImpact: 1,
        },
      ],
      ["riskId", randomUUID()],
      ["riskCode", "RSK-CALLER"],
      ["riskTitle", "Caller-controlled risk"],
      ["title", "Caller-controlled risk"],
      ["description", "Caller-controlled description"],
      ["category", "Caller-controlled category"],
      ["kpiActualId", randomUUID()],
      ["kpiTargetId", randomUUID()],
      ["inherentLikelihood", 1],
      ["inherentImpact", 1],
      ["inherentScore", 1],
      ["residualLikelihood", 1],
      ["residualImpact", 1],
      ["residualScore", 1],
      ["kpiRiskClass", "MINOR"],
      ["generalLevel", "LOW"],
      ["ownerId", admin.user.id],
      ["treatmentStrategy", "ACCEPT"],
      ["reviewDate", "2026-09-30"],
      ["status", "OPEN"],
      ["closedAt", new Date().toISOString()],
      ["closureReason", "Caller-controlled closure"],
      ["createdById", admin.user.id],
      ["updatedById", admin.user.id],
      ["createdAt", new Date().toISOString()],
      ["updatedAt", new Date().toISOString()],
      ["deletedAt", new Date().toISOString()],
    ];
    for (const [field, value] of callerControlledFields) {
      const response = await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "95",
        { [field]: value },
      );

      expect(response.status, field).toBe(400);
      expect(response.body.error.code, field).toBe("VALIDATION_ERROR");
    }

    expect(
      await actualsForConfiguration(
        admin.user.activeCompany.id,
        configuration.body.data.id,
      ),
    ).toBe(0);
    expect(
      await prisma.kpiActual.count({ where: { code: "ACT-CALLER-001" } }),
    ).toBe(0);
    expect(
      await prisma.risk.count({
        where: { tenantId: admin.user.activeCompany.id, code: "RSK-CALLER" },
      }),
    ).toBe(0);
  });

  it("submits against the approved target with custom thresholds and one audit event", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      "HIGHER_IS_BETTER",
      {
        amberThresholdPct: "5.00",
        redThresholdPct: "20.00",
      },
    );
    expect(configuration.status).toBe(201);
    const target = await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100.0000",
    );
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "95.0000",
      {
        evidenceStatus: "PENDING",
        comments: "Synthetic KPI actual",
      },
    ).expect(201);

    expect(submitted.body.data.code).toMatch(/^ACT-\d{3,}$/);
    expect(submitted.body.data).toMatchObject({
      target: {
        id: target.body.data.id,
        code: target.body.data.code,
        version: 1,
      },
      period: "FY26-27 Q1",
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      targetValueSnapshot: "100",
      actualValue: "95",
      variance: "-5",
      variancePercentage: "-5",
      ragStatus: "GREEN",
      targetMet: false,
      approvalStatus: "APPROVED",
      submittedBy: { id: admin.user.id },
      approvedBy: null,
      evidenceStatus: "PENDING",
      comments: "Synthetic KPI actual",
      riskRequired: false,
      recommendedRiskClass: null,
      risk: null,
    });
    expect(submitted.body.data).not.toHaveProperty("tenantId");

    const stored = await prisma.kpiActual.findUniqueOrThrow({
      where: { id: submitted.body.data.id },
    });
    expect(stored).toMatchObject({
      tenantId: admin.user.activeCompany.id,
      kpiTargetId: target.body.data.id,
      submittedById: admin.user.id,
      approvedById: null,
      approvalStatus: "APPROVED",
    });
    expect(stored.approvedAt).toEqual(stored.submittedAt);
    expect(stored.targetValueSnapshot.toString()).toBe("100");
    expect(await prisma.risk.count({ where: { kpiActualId: stored.id } })).toBe(
      0,
    );

    const events = await prisma.auditEvent.findMany({
      where: {
        entityId: stored.id,
        action: { in: ["KPI_ACTUAL_SUBMITTED", "RISK_CREATED"] },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: admin.user.activeCompany.id,
      userId: admin.user.id,
      action: "KPI_ACTUAL_SUBMITTED",
      entityType: "KPI_ACTUAL",
    });
  });

  it("submits an AMBER miss without Risk fields and creates one MINOR 3x3 MEDIUM risk", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "95",
    ).expect(201);
    expect(submitted.body.data).toMatchObject({
      ragStatus: "AMBER",
      targetMet: false,
      riskRequired: true,
      recommendedRiskClass: "MINOR",
      risk: {
        kpiRiskClass: "MINOR",
        inherentLikelihood: 3,
        inherentImpact: 3,
        inherentScore: 9,
        generalLevel: "MEDIUM",
        status: "OPEN",
      },
    });
    const risk = await prisma.risk.findFirstOrThrow({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiActualId: submitted.body.data.id,
        deletedAt: null,
      },
    });
    expect(risk).toMatchObject({
      kpiConfigurationId: configuration.body.data.id,
      kpiTargetId: submitted.body.data.target.id,
      kpiRiskClass: "MINOR",
      inherentLikelihood: 3,
      inherentImpact: 3,
      inherentScore: 9,
      generalLevel: "MEDIUM",
      status: "OPEN",
      ownerId: null,
      category: null,
    });
    expect(risk.code).toMatch(/^RSK-\d{3,}$/);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          entityId: risk.id,
          action: "RISK_CREATED",
          entityType: "RISK",
        },
      }),
    ).toBe(1);
  });

  it("creates one MAJOR 4x4 HIGH risk for a RED miss", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );

    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "80",
    ).expect(201);
    expect(submitted.body.data).toMatchObject({
      ragStatus: "RED",
      targetMet: false,
      riskRequired: true,
      recommendedRiskClass: "MAJOR",
      risk: {
        kpiRiskClass: "MAJOR",
        inherentLikelihood: 4,
        inherentImpact: 4,
        inherentScore: 16,
        generalLevel: "HIGH",
        status: "OPEN",
      },
    });

    const risk = await prisma.risk.findFirstOrThrow({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiActualId: submitted.body.data.id,
        deletedAt: null,
      },
    });
    expect(risk).toMatchObject({
      kpiRiskClass: "MAJOR",
      inherentLikelihood: 4,
      inherentImpact: 4,
      inherentScore: 16,
      generalLevel: "HIGH",
      status: "OPEN",
      ownerId: null,
      category: null,
    });
  });

  it("does not backfill a risk for an existing missed actual", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    const approvedTarget = await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const target = await prisma.kpiTarget.findUniqueOrThrow({
      where: { id: approvedTarget.body.data.id },
    });
    const actual = await prisma.kpiActual.create({
      data: {
        tenantId: admin.user.activeCompany.id,
        code: `ACT-PRE-SLICE-D-${randomUUID()}`,
        kpiConfigurationId: configuration.body.data.id,
        kpiTargetId: target.id,
        period: target.period,
        periodStart: target.periodStart,
        periodEnd: target.periodEnd,
        targetValueSnapshot: target.targetValue,
        actualValue: "95",
        variance: "-5",
        variancePercentage: "-5",
        ragStatus: "AMBER",
        targetMet: false,
        approvalStatus: "SUBMITTED",
        submittedById: admin.user.id,
        submittedAt: new Date(),
        createdById: admin.user.id,
        updatedById: admin.user.id,
      },
    });

    expect(await prisma.risk.count({ where: { kpiActualId: actual.id } })).toBe(
      0,
    );
  });

  it("returns KPI_TARGET_NOT_FOUND when no approved target exists", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);

    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "95",
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("KPI_TARGET_NOT_FOUND");
    expect(
      await actualsForConfiguration(
        admin.user.activeCompany.id,
        configuration.body.data.id,
      ),
    ).toBe(0);
  });

  it("allows only one concurrent active actual per configuration and period", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const responses = await Promise.all(
      [0, 1].map(() =>
        submitActual(admin.accessToken, configuration.body.data.id, "90"),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const conflict = responses.find(({ status }) => status === 409);
    expect(conflict?.body.error.code).toBe("KPI_ACTUAL_PERIOD_EXISTS");

    const actuals = await prisma.kpiActual.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiConfigurationId: configuration.body.data.id,
        period: "FY26-27 Q1",
        deletedAt: null,
      },
    });
    expect(actuals).toHaveLength(1);
    const actual = actuals[0]!;
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: actual.id,
          action: "KPI_ACTUAL_SUBMITTED",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.risk.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          kpiActualId: actual.id,
          status: { notIn: ["CLOSED", "ARCHIVED"] },
          deletedAt: null,
        },
      }),
    ).toBe(1);

    await expect(
      prisma.risk.create({
        data: {
          tenantId: admin.user.activeCompany.id,
          code: `RSK-DUPLICATE-${randomUUID()}`,
          title: "Synthetic duplicate active KPI risk",
          kpiActualId: actual.id,
          kpiConfigurationId: actual.kpiConfigurationId,
          kpiTargetId: actual.kpiTargetId,
          inherentLikelihood: 3,
          inherentImpact: 3,
          inherentScore: 9,
          kpiRiskClass: "MINOR",
          generalLevel: "MEDIUM",
          ownerId: admin.user.id,
          status: "OPEN",
          createdById: admin.user.id,
          updatedById: admin.user.id,
        },
      }),
    ).rejects.toThrow();

    for (const status of ["CLOSED", "ARCHIVED"] as const) {
      const historical = await prisma.risk.create({
        data: {
          tenantId: admin.user.activeCompany.id,
          code: `RSK-${status}-${randomUUID()}`,
          title: `Synthetic ${status.toLowerCase()} KPI risk`,
          kpiActualId: actual.id,
          kpiConfigurationId: actual.kpiConfigurationId,
          kpiTargetId: actual.kpiTargetId,
          inherentLikelihood: 3,
          inherentImpact: 3,
          inherentScore: 9,
          kpiRiskClass: "MINOR",
          generalLevel: "MEDIUM",
          ownerId: admin.user.id,
          status,
          createdById: admin.user.id,
          updatedById: admin.user.id,
        },
      });
      expect(historical.status).toBe(status);
    }
    expect(
      await prisma.risk.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          kpiActualId: actual.id,
        },
      }),
    ).toBe(3);
  });

  it("starts fresh tenant actual and Risk sequences independently at ACT-001 and RSK-001", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenants = [
      await provisionFreshAdminTenant(admin.user.id),
      await provisionFreshAdminTenant(admin.user.id),
    ];
    const tenantIds = tenants.map(({ id }) => id);

    try {
      const tenantTokens = await Promise.all(
        tenants.map((tenant) => switchCompany(admin.accessToken, tenant.id)),
      );
      const configurationIds: string[] = [];

      for (const token of tenantTokens) {
        const configuration = await createConfiguration(token, admin.user.id);
        expect(configuration.status).toBe(201);
        configurationIds.push(String(configuration.body.data.id));
      }
      await Promise.all(
        tenantTokens.map((token, index) =>
          createApprovedTarget(token, configurationIds[index]!, "100"),
        ),
      );

      const submissions = await Promise.all(
        tenantTokens.map((token, index) =>
          submitActual(token, configurationIds[index]!, "80").expect(201),
        ),
      );
      expect(submissions.map(({ body }) => body.data.code)).toEqual([
        "ACT-001",
        "ACT-001",
      ]);
      expect(submissions.map(({ body }) => body.data.risk.code)).toEqual([
        "RSK-001",
        "RSK-001",
      ]);
      expect(
        await prisma.kpiActual.count({
          where: {
            tenantId: { in: tenantIds },
            code: "ACT-001",
          },
        }),
      ).toBe(2);
      expect(
        await prisma.risk.count({
          where: {
            tenantId: { in: tenantIds },
            code: "RSK-001",
          },
        }),
      ).toBe(2);
      expect(
        (
          await prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { nextKpiActualNumber: true, nextRiskNumber: true },
          })
        ).map(({ nextKpiActualNumber, nextRiskNumber }) => [
          nextKpiActualNumber,
          nextRiskNumber,
        ]),
      ).toEqual([
        [2, 2],
        [2, 2],
      ]);
    } finally {
      await prisma.userRole.deleteMany({
        where: { userId: admin.user.id, tenantId: { in: tenantIds } },
      });
      await prisma.userCompany.deleteMany({
        where: { userId: admin.user.id, tenantId: { in: tenantIds } },
      });
    }
  });

  it("allocates distinct consecutive tenant Risk codes for a concurrent burst", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const concurrentCount = 6;
    const configurationIds: string[] = [];

    for (let index = 0; index < concurrentCount; index += 1) {
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
      );
      expect(configuration.status).toBe(201);
      configurationIds.push(String(configuration.body.data.id));
    }
    await Promise.all(
      configurationIds.map((configurationId) =>
        createApprovedTarget(admin.accessToken, configurationId, "100"),
      ),
    );
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: admin.user.activeCompany.id },
      select: { nextRiskNumber: true },
    });

    const submissions = await Promise.all(
      configurationIds.map((configurationId) =>
        submitActual(admin.accessToken, configurationId, "80").expect(201),
      ),
    );
    const risks = await prisma.risk.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiActualId: {
          in: submissions.map(({ body }) => String(body.data.id)),
        },
      },
      select: { code: true, kpiActualId: true },
    });
    expect(risks).toHaveLength(concurrentCount);
    expect(new Set(risks.map(({ kpiActualId }) => kpiActualId)).size).toBe(
      concurrentCount,
    );
    const allocatedNumbers = risks
      .map(({ code }) => {
        const match = /^RSK-(\d{3,})$/.exec(code);
        expect(match).not.toBeNull();
        return Number(match![1]);
      })
      .sort((left, right) => left - right);
    expect(allocatedNumbers).toEqual(
      Array.from(
        { length: concurrentCount },
        (_, index) => before.nextRiskNumber + index,
      ),
    );
    const after = await prisma.tenant.findUniqueOrThrow({
      where: { id: admin.user.activeCompany.id },
      select: { nextRiskNumber: true },
    });
    expect(after.nextRiskNumber).toBe(before.nextRiskNumber + concurrentCount);
  });

  it("allocates distinct consecutive actual codes for simultaneous submissions", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const concurrentCount = 6;
    const configurationIds: string[] = [];

    for (let index = 0; index < concurrentCount; index += 1) {
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
      );
      expect(configuration.status).toBe(201);
      configurationIds.push(String(configuration.body.data.id));
    }
    await Promise.all(
      configurationIds.map((configurationId) =>
        createApprovedTarget(admin.accessToken, configurationId, "100"),
      ),
    );
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: admin.user.activeCompany.id },
      select: { nextKpiActualNumber: true },
    });

    const submissions = await Promise.all(
      configurationIds.map((configurationId) =>
        submitActual(admin.accessToken, configurationId, "100").expect(201),
      ),
    );
    const codes = submissions.map(({ body }) => String(body.data.code));
    expect(new Set(codes).size).toBe(concurrentCount);

    const allocatedNumbers = codes
      .map((code) => {
        const match = /^ACT-(\d{3,})$/.exec(code);
        expect(match).not.toBeNull();
        return Number(match![1]);
      })
      .sort((left, right) => left - right);
    expect(allocatedNumbers).toEqual(
      Array.from(
        { length: concurrentCount },
        (_, index) => before.nextKpiActualNumber + index,
      ),
    );

    const stored = await prisma.kpiActual.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        id: { in: submissions.map(({ body }) => String(body.data.id)) },
      },
      select: { code: true },
    });
    expect(stored.map(({ code }) => code).sort()).toEqual([...codes].sort());

    const after = await prisma.tenant.findUniqueOrThrow({
      where: { id: admin.user.activeCompany.id },
      select: { nextKpiActualNumber: true },
    });
    expect(after.nextKpiActualNumber).toBe(
      before.nextKpiActualNumber + concurrentCount,
    );
  });

  it("reports a generated code collision as a server fault, not a period conflict", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const occupied = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(occupied.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      occupied.body.data.id,
      "100",
    );
    const first = await submitActual(
      admin.accessToken,
      occupied.body.data.id,
      "100",
    ).expect(201);
    const takenNumber = Number(
      /^ACT-(\d+)$/.exec(String(first.body.data.code))![1],
    );

    const colliding = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(colliding.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      colliding.body.data.id,
      "100",
    );
    const restore = await prisma.tenant.findUniqueOrThrow({
      where: { id: admin.user.activeCompany.id },
      select: { nextKpiActualNumber: true },
    });

    // Rewinding the counter is the only way to force the code index to fire:
    // a different configuration keeps the period index satisfied.
    await prisma.tenant.update({
      where: { id: admin.user.activeCompany.id },
      data: { nextKpiActualNumber: takenNumber },
    });
    try {
      const response = await submitActual(
        admin.accessToken,
        colliding.body.data.id,
        "100",
      );
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("KPI_ACTUAL_CODE_COLLISION");
      expect(
        await actualsForConfiguration(
          admin.user.activeCompany.id,
          colliding.body.data.id,
        ),
      ).toBe(0);
    } finally {
      await prisma.tenant.update({
        where: { id: admin.user.activeCompany.id },
        data: { nextKpiActualNumber: restore.nextKpiActualNumber },
      });
    }
  });

  it("keeps its target snapshot after target re-versioning", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    const originalTarget = await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "90",
    );
    const nextVersion = await request(app)
      .post(`/api/v1/kpi-targets/${originalTarget.body.data.id}/versions`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        code: `KTG-SLICEB-V2-${randomUUID()}`,
        targetValue: "95.0000",
      })
      .expect(201);

    const supersededOriginal = await prisma.kpiTarget.findUniqueOrThrow({
      where: { id: originalTarget.body.data.id },
    });
    expect(supersededOriginal.supersededById).toBe(nextVersion.body.data.id);
    expect(nextVersion.body.data.approvalStatus).toBe("DRAFT");

    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "85",
    ).expect(201);
    expect(submitted.body.data).toMatchObject({
      target: { id: originalTarget.body.data.id, version: 1 },
      targetValueSnapshot: "90",
    });

    await request(app)
      .post(`/api/v1/kpi-targets/${nextVersion.body.data.id}/submit`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    const stored = await prisma.kpiActual.findUniqueOrThrow({
      where: { id: submitted.body.data.id },
    });
    expect(stored.kpiTargetId).toBe(originalTarget.body.data.id);
    expect(stored.targetValueSnapshot.toString()).toBe("90");
  });

  it("selects the highest approved target version", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    const originalTarget = await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "90",
    );
    const nextVersion = await request(app)
      .post(`/api/v1/kpi-targets/${originalTarget.body.data.id}/versions`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        code: `KTG-SLICEB-HIGHEST-${randomUUID()}`,
        targetValue: "95.0000",
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/kpi-targets/${nextVersion.body.data.id}/submit`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "95",
    ).expect(201);
    expect(submitted.body.data).toMatchObject({
      target: { id: nextVersion.body.data.id, version: 2 },
      targetValueSnapshot: "95",
    });
  });

  it("returns a safe 400 when a derived value cannot fit Decimal(18,4)", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "0.0001",
    );
    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "99999999999999.9999",
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("KPI_CALCULATION_OUT_OF_RANGE");
    expect(
      await actualsForConfiguration(
        admin.user.activeCompany.id,
        configuration.body.data.id,
      ),
    ).toBe(0);
  });

  it("handles informational and zero-target actuals", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const informationalConfiguration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      "INFORMATIONAL",
      { requiresEvidence: false },
    );
    expect(informationalConfiguration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      informationalConfiguration.body.data.id,
      "0",
    );
    const informational = await submitActual(
      admin.accessToken,
      informationalConfiguration.body.data.id,
      "50",
    ).expect(201);
    expect(informational.body.data).toMatchObject({
      targetValueSnapshot: "0",
      variance: "50",
      variancePercentage: null,
      targetMet: true,
      ragStatus: null,
      riskRequired: false,
      recommendedRiskClass: null,
    });

    const zeroConfiguration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      "HIGHER_IS_BETTER",
      { requiresEvidence: false },
    );
    expect(zeroConfiguration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      zeroConfiguration.body.data.id,
      "0",
    );
    const zeroMiss = await submitActual(
      admin.accessToken,
      zeroConfiguration.body.data.id,
      "-1",
    ).expect(201);
    expect(zeroMiss.body.data).toMatchObject({
      targetValueSnapshot: "0",
      variance: "-1",
      variancePercentage: null,
      targetMet: false,
      ragStatus: "RED",
      riskRequired: true,
      recommendedRiskClass: "MAJOR",
    });
  });

  it("prevents cross-tenant submission while allowing repeated actual codes", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const configuration1 = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration1.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration1.body.data.id,
      "100",
    );
    const first = await submitActual(
      admin.accessToken,
      configuration1.body.data.id,
      "100",
    ).expect(201);
    const allocatedCode = String(first.body.data.code);

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    const crossTenant = await submitActual(
      company2Token,
      configuration1.body.data.id,
      "100",
    );
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.error.code).toBe("KPI_CONFIGURATION_NOT_FOUND");

    const configuration2 = await createConfiguration(
      company2Token,
      admin.user.id,
    );
    expect(configuration2.status).toBe(201);
    await createApprovedTarget(
      company2Token,
      configuration2.body.data.id,
      "100",
    );
    // Force Company 002 onto the same ACT number so the sequence is proven
    // free to repeat across Companies.
    const allocatedNumber = Number(/^ACT-(\d+)$/.exec(allocatedCode)![1]);
    await prisma.tenant.update({
      where: { id: company2!.id },
      data: { nextKpiActualNumber: allocatedNumber },
    });
    const second = await submitActual(
      company2Token,
      configuration2.body.data.id,
      "100",
    ).expect(201);
    expect(second.body.data.code).toBe(allocatedCode);

    expect(
      await prisma.kpiActual.count({ where: { code: allocatedCode } }),
    ).toBe(2);
  });

  it("keeps Risk list and detail reads tenant-isolated", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "80",
    ).expect(201);
    const risk = await prisma.risk.findFirstOrThrow({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiActualId: submitted.body.data.id,
      },
    });

    const list = await request(app)
      .get("/api/v1/risks?pageSize=100")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      list.body.data.some(({ id }: { id: string }) => id === risk.id),
    ).toBe(true);
    const detail = await request(app)
      .get(`/api/v1/risks/${risk.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: risk.id,
      code: risk.code,
      kpiRiskClass: "MAJOR",
      generalLevel: "HIGH",
      source: {
        actual: {
          id: submitted.body.data.id,
          code: submitted.body.data.code,
          period: submitted.body.data.period,
          actualValue: submitted.body.data.actualValue,
          variance: submitted.body.data.variance,
          targetValueSnapshot: submitted.body.data.targetValueSnapshot,
          ragStatus: submitted.body.data.ragStatus,
        },
        configuration: { id: configuration.body.data.id },
        target: { id: submitted.body.data.target.id },
      },
    });
    const listed = list.body.data.find(
      ({ id }: { id: string }) => id === risk.id,
    );
    expect(listed.source.actual).toMatchObject({
      actualValue: submitted.body.data.actualValue,
      variance: submitted.body.data.variance,
      targetValueSnapshot: submitted.body.data.targetValueSnapshot,
    });

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    const isolatedList = await request(app)
      .get("/api/v1/risks")
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(200);
    expect(
      isolatedList.body.data.some(({ id }: { id: string }) => id === risk.id),
    ).toBe(false);
    const isolatedSearch = await request(app)
      .get(`/api/v1/risks?q=${encodeURIComponent(risk.code)}&lifecycle=all`)
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(200);
    expect(
      isolatedSearch.body.data.some(({ id }: { id: string }) => id === risk.id),
    ).toBe(false);
    expect(
      isolatedSearch.body.data.some(
        (entry: { source?: { actual?: { id?: string } } }) =>
          entry.source?.actual?.id === submitted.body.data.id,
      ),
    ).toBe(false);
    const crossTenant = await request(app)
      .get(`/api/v1/risks/${risk.id}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(404);
    expect(crossTenant.body.error.code).toBe("NOT_FOUND");
  });

  it("filters Risk list by search, lifecycle, status precedence and pagination", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "80",
    ).expect(201);
    const risk = await prisma.risk.findFirstOrThrow({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiActualId: submitted.body.data.id,
      },
    });

    const byCode = await request(app)
      .get(`/api/v1/risks?q=${encodeURIComponent(risk.code)}&lifecycle=active`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byCode.body.data.map(({ id }: { id: string }) => id)).toContain(
      risk.id,
    );

    const byKpiName = await request(app)
      .get(
        `/api/v1/risks?q=${encodeURIComponent("Synthetic HIGHER_IS_BETTER")}&lifecycle=active`,
      )
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byKpiName.body.data.map(({ id }: { id: string }) => id)).toContain(
      risk.id,
    );

    const activeOnly = await request(app)
      .get("/api/v1/risks?lifecycle=active&pageSize=100")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      activeOnly.body.data.some(({ id }: { id: string }) => id === risk.id),
    ).toBe(true);
    expect(
      activeOnly.body.data.every(({ status }: { status: string }) =>
        ["OPEN", "UNDER_REVIEW", "TREATED"].includes(status),
      ),
    ).toBe(true);

    await prisma.risk.update({
      where: { id: risk.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const activeAfterClose = await request(app)
      .get(`/api/v1/risks?lifecycle=active&q=${encodeURIComponent(risk.code)}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      activeAfterClose.body.data.some(
        ({ id }: { id: string }) => id === risk.id,
      ),
    ).toBe(false);

    const historical = await request(app)
      .get(`/api/v1/risks?lifecycle=closed&q=${encodeURIComponent(risk.code)}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      historical.body.data.some(({ id }: { id: string }) => id === risk.id),
    ).toBe(true);

    // Specific status wins over lifecycle (CLOSED with lifecycle=active).
    const statusPrecedence = await request(app)
      .get(
        `/api/v1/risks?status=CLOSED&lifecycle=active&q=${encodeURIComponent(risk.code)}`,
      )
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      statusPrecedence.body.data.some(
        ({ id }: { id: string }) => id === risk.id,
      ),
    ).toBe(true);
    expect(
      statusPrecedence.body.data.every(
        ({ status }: { status: string }) => status === "CLOSED",
      ),
    ).toBe(true);

    const page = await request(app)
      .get(
        `/api/v1/risks?lifecycle=closed&q=${encodeURIComponent(risk.code)}&page=1&pageSize=1`,
      )
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(page.body.meta).toMatchObject({
      page: 1,
      pageSize: 1,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });
    expect(page.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(page.body.data).toHaveLength(1);
  });

  it("rolls back the actual, Risk, sequence and audits when RISK_CREATED audit fails", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
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
          action: { in: ["KPI_ACTUAL_SUBMITTED", "RISK_CREATED"] },
        },
      }),
      prisma.kpiActual.count({
        where: {
          tenantId: admin.user.activeCompany.id,
          kpiConfigurationId: configuration.body.data.id,
        },
      }),
    ]);

    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "reject_kpi_risk_created_test" ON "audit_events"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS reject_kpi_risk_created_test()`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_kpi_risk_created_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."action" = 'RISK_CREATED' THEN
          RAISE EXCEPTION 'synthetic KPI risk audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "reject_kpi_risk_created_test"
      BEFORE INSERT ON "audit_events"
      FOR EACH ROW EXECUTE FUNCTION reject_kpi_risk_created_test()
    `);
    try {
      await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        "80",
      ).expect(500);
      expect(
        await prisma.kpiActual.count({
          where: {
            tenantId: admin.user.activeCompany.id,
            kpiConfigurationId: configuration.body.data.id,
          },
        }),
      ).toBe(before[3]);
      expect(
        await prisma.risk.count({
          where: { tenantId: admin.user.activeCompany.id },
        }),
      ).toBe(before[1]);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: admin.user.activeCompany.id,
            action: { in: ["KPI_ACTUAL_SUBMITTED", "RISK_CREATED"] },
          },
        }),
      ).toBe(before[2]);
      expect(
        await prisma.tenant.findUniqueOrThrow({
          where: { id: admin.user.activeCompany.id },
          select: { nextRiskNumber: true, nextKpiActualNumber: true },
        }),
      ).toEqual(before[0]);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "reject_kpi_risk_created_test" ON "audit_events"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS reject_kpi_risk_created_test()`,
      );
    }
  });

  it("enforces period, tenant-target and active-period uniqueness in PostgreSQL", async () => {
    const [company1, company2, admin, regular, definition] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { code: "COM-001" } }),
      prisma.tenant.findUniqueOrThrow({ where: { code: "COM-002" } }),
      prisma.user.findUniqueOrThrow({
        where: { email: "admin001@example.test" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "user001@example.test" },
      }),
      definitionFor("HIGHER_IS_BETTER"),
    ]);
    const configuration1 = await prisma.kpiConfiguration.create({
      data: {
        tenantId: company1.id,
        kpiDefinitionId: definition.id,
        productService: `DB constraint ${randomUUID()}`,
        ownerId: admin.id,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const target1 = await prisma.kpiTarget.create({
      data: {
        tenantId: company1.id,
        kpiConfigurationId: configuration1.id,
        code: `KTG-DB-${randomUUID()}`,
        period: `FY-DB-${randomUUID().slice(0, 8)}`,
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        targetValue: "100",
        approvalStatus: "APPROVED",
        submittedById: admin.id,
        submittedAt: new Date(),
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const configuration2 = await prisma.kpiConfiguration.create({
      data: {
        tenantId: company2.id,
        kpiDefinitionId: definition.id,
        productService: `DB constraint ${randomUUID()}`,
        ownerId: admin.id,
        reviewFrequency: "QUARTERLY",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const target2 = await prisma.kpiTarget.create({
      data: {
        tenantId: company2.id,
        kpiConfigurationId: configuration2.id,
        code: `KTG-DB-${randomUUID()}`,
        period: `FY-DB-${randomUUID().slice(0, 8)}`,
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        targetValue: "100",
        approvalStatus: "APPROVED",
        submittedById: admin.id,
        submittedAt: new Date(),
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const actualData = (
      code: string,
      tenantId: string,
      configurationId: string,
      target: typeof target1,
      actorId = admin.id,
      overrides: Partial<{
        kpiConfigurationId: string;
        kpiTargetId: string;
        period: string;
        periodStart: Date;
        periodEnd: Date;
      }> = {},
    ) => ({
      tenantId,
      code,
      kpiConfigurationId: configurationId,
      kpiTargetId: target.id,
      period: target.period,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      targetValueSnapshot: target.targetValue,
      actualValue: target.targetValue,
      variance: "0",
      variancePercentage: target.targetValue.isZero() ? null : "0",
      ragStatus: "GREEN" as const,
      targetMet: true,
      approvalStatus: "SUBMITTED" as const,
      submittedById: actorId,
      submittedAt: new Date(),
      createdById: actorId,
      updatedById: actorId,
      ...overrides,
    });

    await expect(
      prisma.kpiActual.create({
        data: actualData(
          `ACT-DB-DATE-${randomUUID()}`,
          company1.id,
          configuration1.id,
          target1,
          admin.id,
          {
            periodStart: new Date("2026-09-30T00:00:00.000Z"),
            periodEnd: new Date("2026-07-01T00:00:00.000Z"),
          },
        ),
      }),
    ).rejects.toThrow();

    await expect(
      prisma.kpiActual.create({
        data: actualData(
          `ACT-DB-TENANT-${randomUUID()}`,
          company2.id,
          configuration2.id,
          target1,
        ),
      }),
    ).rejects.toThrow();

    await expect(
      prisma.kpiActual.create({
        data: actualData(
          `ACT-DB-MEMBER-${randomUUID()}`,
          company2.id,
          configuration2.id,
          target2,
          regular.id,
        ),
      }),
    ).rejects.toThrow();

    await prisma.kpiActual.create({
      data: actualData(
        `ACT-DB-UNIQUE-A-${randomUUID()}`,
        company1.id,
        configuration1.id,
        target1,
      ),
    });
    await expect(
      prisma.kpiActual.create({
        data: actualData(
          `ACT-DB-UNIQUE-B-${randomUUID()}`,
          company1.id,
          configuration1.id,
          target1,
        ),
      }),
    ).rejects.toThrow();
  });

  it("enforces Risk assessment, source-group and cross-tenant lineage constraints in PostgreSQL", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    await createApprovedTarget(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    );
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      "100",
    ).expect(201);
    const actual = await prisma.kpiActual.findUniqueOrThrow({
      where: { id: submitted.body.data.id },
    });
    expect(await prisma.risk.count({ where: { kpiActualId: actual.id } })).toBe(
      0,
    );

    const riskData = (
      overrides: Partial<Prisma.RiskUncheckedCreateInput> = {},
    ): Prisma.RiskUncheckedCreateInput => ({
      tenantId: admin.user.activeCompany.id,
      code: `RSK-DB-${randomUUID()}`,
      title: "Synthetic Risk constraint fixture",
      inherentLikelihood: 3,
      inherentImpact: 3,
      inherentScore: 9,
      kpiRiskClass: "MINOR",
      generalLevel: "MEDIUM",
      ownerId: admin.user.id,
      status: "OPEN",
      createdById: admin.user.id,
      updatedById: admin.user.id,
      ...overrides,
    });

    for (const invalid of [
      { inherentLikelihood: 0, inherentScore: 0 },
      { inherentLikelihood: 6, inherentScore: 18 },
      { inherentImpact: 0, inherentScore: 0 },
      { inherentImpact: 6, inherentScore: 18 },
      { inherentScore: 8 },
      { residualLikelihood: 0 },
      { residualLikelihood: 6 },
      { residualImpact: 0 },
      { residualImpact: 6 },
    ]) {
      await expect(
        prisma.risk.create({ data: riskData(invalid) }),
      ).rejects.toThrow();
    }

    await expect(
      prisma.risk.create({
        data: riskData({
          kpiActualId: actual.id,
          kpiConfigurationId: null,
          kpiTargetId: null,
        }),
      }),
    ).rejects.toThrow();

    const secondConfiguration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(secondConfiguration.status).toBe(201);
    const secondTargetResponse = await createApprovedTarget(
      admin.accessToken,
      secondConfiguration.body.data.id,
      "100",
    );
    const secondTarget = await prisma.kpiTarget.findUniqueOrThrow({
      where: { id: secondTargetResponse.body.data.id },
    });
    await expect(
      prisma.risk.create({
        data: riskData({
          kpiActualId: actual.id,
          kpiConfigurationId: secondConfiguration.body.data.id,
          kpiTargetId: secondTarget.id,
        }),
      }),
    ).rejects.toThrow();

    await expect(
      prisma.risk.create({
        data: riskData({
          tenantId: company2!.id,
          kpiActualId: actual.id,
          kpiConfigurationId: actual.kpiConfigurationId,
          kpiTargetId: actual.kpiTargetId,
        }),
      }),
    ).rejects.toThrow();
  });
});
