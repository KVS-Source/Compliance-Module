import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { KpiDirection, PrismaClient } from "@prisma/client";

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

describe("KPI actual submission Slice B", () => {
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
    code: string,
    actualValue: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request(app)
      .post("/api/v1/kpi-actuals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code,
        kpiConfigurationId: configurationId,
        period: "FY26-27 Q1",
        actualValue,
        ...overrides,
      });

  it("seeds the write permission explicitly for admins and excludes Company User", async () => {
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
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toContain("kpi-actual:write");

    const regular = await loginAs("user001@example.test", "User001!Secure");
    await submitActual(
      regular.accessToken,
      randomUUID(),
      `ACT-DENIED-${randomUUID()}`,
      "1",
    ).expect(403);
  });

  it("rejects body-derived identity, target, snapshot, dates, calculations and approval fields", async () => {
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
      `ACT-UNTRUSTED-${randomUUID()}`,
      "95",
      {
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
    const code = `ACT-CUSTOM-${randomUUID()}`;
    const submitted = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      code,
      "95.0000",
      {
        evidenceStatus: "PENDING",
        comments: "Synthetic KPI actual",
      },
    ).expect(201);

    expect(submitted.body.data).toMatchObject({
      code,
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
      approvalStatus: "SUBMITTED",
      submittedBy: { id: admin.user.id },
      approvedBy: null,
      approvedAt: null,
      evidenceStatus: "PENDING",
      comments: "Synthetic KPI actual",
      riskRequired: false,
      recommendedRiskClass: null,
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
      approvalStatus: "SUBMITTED",
    });
    expect(stored.targetValueSnapshot.toString()).toBe("100");

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

  it("uses Company defaults when configuration thresholds are null", async () => {
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
      `ACT-DEFAULT-${randomUUID()}`,
      "95",
    ).expect(201);
    expect(submitted.body.data).toMatchObject({
      ragStatus: "AMBER",
      targetMet: false,
      riskRequired: true,
      recommendedRiskClass: "MINOR",
    });
  });

  it("returns KPI_TARGET_NOT_FOUND when no approved target exists", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
    );
    expect(configuration.status).toBe(201);
    const code = `ACT-NO-TARGET-${randomUUID()}`;

    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      code,
      "95",
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("KPI_TARGET_NOT_FOUND");
    expect(await prisma.kpiActual.count({ where: { code } })).toBe(0);
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
    const codes = [`ACT-RACE-A-${randomUUID()}`, `ACT-RACE-B-${randomUUID()}`];
    const responses = await Promise.all(
      codes.map((code) =>
        submitActual(admin.accessToken, configuration.body.data.id, code, "90"),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const conflict = responses.find(({ status }) => status === 409);
    expect(conflict?.body.error.code).toBe("KPI_ACTUAL_ALREADY_EXISTS");

    const actuals = await prisma.kpiActual.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        kpiConfigurationId: configuration.body.data.id,
        period: "FY26-27 Q1",
        deletedAt: null,
      },
    });
    expect(actuals).toHaveLength(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: actuals[0]!.id,
          action: "KPI_ACTUAL_SUBMITTED",
        },
      }),
    ).toBe(1);
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
      `ACT-SNAPSHOT-${randomUUID()}`,
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
      `ACT-HIGHEST-${randomUUID()}`,
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
    const code = `ACT-OVERFLOW-${randomUUID()}`;
    const response = await submitActual(
      admin.accessToken,
      configuration.body.data.id,
      code,
      "99999999999999.9999",
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("KPI_CALCULATION_OUT_OF_RANGE");
    expect(await prisma.kpiActual.count({ where: { code } })).toBe(0);
  });

  it("does not enforce evidence and handles informational and zero-target actuals", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const informationalConfiguration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      "INFORMATIONAL",
      { requiresEvidence: true },
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
      `ACT-INFO-${randomUUID()}`,
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
      { requiresEvidence: true },
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
      `ACT-ZERO-${randomUUID()}`,
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
    const repeatedCode = `ACT-ISOLATION-${randomUUID()}`;
    await submitActual(
      admin.accessToken,
      configuration1.body.data.id,
      repeatedCode,
      "100",
    ).expect(201);

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    const crossTenant = await submitActual(
      company2Token,
      configuration1.body.data.id,
      `ACT-CROSS-${randomUUID()}`,
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
    await submitActual(
      company2Token,
      configuration2.body.data.id,
      repeatedCode,
      "100",
    ).expect(201);

    expect(
      await prisma.kpiActual.count({ where: { code: repeatedCode } }),
    ).toBe(2);
  });

  it("rolls back the actual when its audit event cannot be written", async () => {
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
    const code = `ACT-ROLLBACK-${randomUUID()}`;

    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "reject_kpi_actual_submission_test" ON "audit_events"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS reject_kpi_actual_submission_test()`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_kpi_actual_submission_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."action" = 'KPI_ACTUAL_SUBMITTED' THEN
          RAISE EXCEPTION 'synthetic KPI actual audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "reject_kpi_actual_submission_test"
      BEFORE INSERT ON "audit_events"
      FOR EACH ROW EXECUTE FUNCTION reject_kpi_actual_submission_test()
    `);
    try {
      await submitActual(
        admin.accessToken,
        configuration.body.data.id,
        code,
        "100",
      ).expect(500);
      expect(await prisma.kpiActual.count({ where: { code } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "reject_kpi_actual_submission_test" ON "audit_events"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS reject_kpi_actual_submission_test()`,
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
});
