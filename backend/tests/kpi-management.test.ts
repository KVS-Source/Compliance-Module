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

describe("KPI configuration and target Slice A", () => {
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
        permissions: string[];
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

  const baseConfigurationBody = async (
    ownerId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const definition = await prisma.kpiDefinition.findUniqueOrThrow({
      where: { code: "KPI-001" },
    });
    return {
      kpiDefinitionId: definition.id,
      ownerId,
      reviewFrequency: "QUARTERLY",
      effectiveFrom: "2026-07-01",
      enabled: true,
      requiresEvidence: false,
      requiresApproval: true,
      ...overrides,
    };
  };

  const createConfiguration = async (
    token: string,
    ownerId: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request(app)
      .post("/api/v1/kpi-configurations")
      .set("Authorization", `Bearer ${token}`)
      .send(await baseConfigurationBody(ownerId, overrides));

  const createTarget = async (
    token: string,
    configurationId: string,
    code: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request(app)
      .post("/api/v1/kpi-targets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kpiConfigurationId: configurationId,
        code,
        period: "FY26-27 Q1",
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        targetValue: "90.0000",
        effectiveFrom: "2026-07-01",
        effectiveTo: "2026-09-30",
        ...overrides,
      });

  const grantRegularApproval = async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: (
            await prisma.tenant.findUniqueOrThrow({
              where: { code: "COM-001" },
            })
          ).id,
          code: "COMPANY_USER",
        },
      },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "kpi-target:approve" },
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
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
    return async () => {
      await prisma.rolePermission.delete({ where: { id: assignment.id } });
    };
  };

  it("seeds explicit admin permissions while excluding Company User", async () => {
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company.id, code: "COMPANY_ADMIN" },
      },
      include: { permissions: { include: { permission: true } } },
    });
    const companyUserRole = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: company.id, code: "COMPANY_USER" },
      },
      include: { permissions: { include: { permission: true } } },
    });
    const sliceAPermissions = [
      "kpi-config:write",
      "kpi-target:write",
      "kpi-target:approve",
    ];
    expect(
      adminRole.permissions.map(({ permission }) => permission.code),
    ).toEqual(expect.arrayContaining(sliceAPermissions));
    expect(
      companyUserRole.permissions.map(({ permission }) => permission.code),
    ).not.toEqual(expect.arrayContaining(sliceAPermissions));

    const regular = await loginAs("user001@example.test", "User001!Secure");
    await createConfiguration(regular.accessToken, regular.user.id).then(
      (response) => {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
      },
    );
  });

  it("creates, updates and soft-deletes a tenant configuration with audits and null-safe uniqueness", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const nullScopeProduct = `Null scope ${randomUUID()}`;

    const created = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      {
        tenantId: company2!.id,
        companyId: company2!.id,
        amberThresholdPct: "2.50",
        redThresholdPct: "12.50",
        currency: "usd",
        productService: nullScopeProduct,
      },
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      currency: "USD",
      amberThresholdPct: "2.5",
      redThresholdPct: "12.5",
      department: null,
    });
    expect(created.body.data).not.toHaveProperty("tenantId");

    const stored = await prisma.kpiConfiguration.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.tenantId).toBe(admin.user.activeCompany.id);

    const duplicate = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      {
        amberThresholdPct: "2.50",
        redThresholdPct: "12.50",
        currency: "USD",
        productService: nullScopeProduct,
      },
    );
    expect(duplicate.status).toBe(409);

    const updated = await request(app)
      .patch(`/api/v1/kpi-configurations/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ productService: "Service 001", enabled: false })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      productService: "Service 001",
      enabled: false,
    });

    await request(app)
      .delete(`/api/v1/kpi-configurations/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    await request(app)
      .get(`/api/v1/kpi-configurations/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(404);

    const actions = await prisma.auditEvent.findMany({
      where: {
        entityId: created.body.data.id,
        action: {
          in: [
            "KPI_CONFIGURATION_CREATED",
            "KPI_CONFIGURATION_UPDATED",
            "KPI_CONFIGURATION_DELETED",
          ],
        },
      },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "KPI_CONFIGURATION_CREATED",
        "KPI_CONFIGURATION_UPDATED",
        "KPI_CONFIGURATION_DELETED",
      ]),
    );

    const recreated = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      {
        amberThresholdPct: "2.50",
        redThresholdPct: "12.50",
        currency: "USD",
        productService: nullScopeProduct,
      },
    );
    expect(recreated.status).toBe(201);
  });

  it("enforces target approval, rejection, resubmission, immutability and versioning", async () => {
    const removeApproval = await grantRegularApproval();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const reviewer = await loginAs("user001@example.test", "User001!Secure");
      const suffix = Date.now().toString().slice(-7);
      const configuration = await createConfiguration(
        admin.accessToken,
        admin.user.id,
        {
          productService: `Workflow ${suffix}`,
          approverId: reviewer.user.id,
        },
      );
      expect(configuration.status).toBe(201);

      const target = await createTarget(
        admin.accessToken,
        configuration.body.data.id,
        `KTG-WF-${suffix}`,
      );
      expect(target.status).toBe(201);
      const targetId = target.body.data.id as string;

      const submitted = await request(app)
        .post(`/api/v1/kpi-targets/${targetId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(submitted.body.data).toMatchObject({
        approvalStatus: "PENDING_APPROVAL",
        version: 1,
        submittedBy: { id: admin.user.id },
      });

      await request(app)
        .post(`/api/v1/kpi-targets/${targetId}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(403);

      const approved = await request(app)
        .post(`/api/v1/kpi-targets/${targetId}/approve`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .expect(200);
      expect(approved.body.data).toMatchObject({
        approvalStatus: "APPROVED",
        approvedBy: { id: reviewer.user.id },
      });

      await request(app)
        .patch(`/api/v1/kpi-targets/${targetId}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ targetValue: "91" })
        .expect(409);

      const next = await request(app)
        .post(`/api/v1/kpi-targets/${targetId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code: `KTG-WF-${suffix}-V2`, targetValue: "91.0000" })
        .expect(201);
      expect(next.body.data).toMatchObject({
        version: 2,
        approvalStatus: "DRAFT",
        targetValue: "91",
      });
      const oldTarget = await prisma.kpiTarget.findUniqueOrThrow({
        where: { id: targetId },
      });
      expect(oldTarget.supersededById).toBe(next.body.data.id);
      await expect(
        prisma.kpiTarget.update({
          where: { id: targetId },
          data: { targetValue: "92" },
        }),
      ).rejects.toThrow();

      const rejectedTarget = await createTarget(
        admin.accessToken,
        configuration.body.data.id,
        `KTG-RJ-${suffix}`,
        {
          period: "FY26-27 Q2",
          periodStart: "2026-10-01",
          periodEnd: "2026-12-31",
          effectiveFrom: "2026-10-01",
          effectiveTo: "2026-12-31",
        },
      );
      expect(rejectedTarget.status).toBe(201);
      const rejectedId = rejectedTarget.body.data.id as string;
      await request(app)
        .post(`/api/v1/kpi-targets/${rejectedId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const rejected = await request(app)
        .post(`/api/v1/kpi-targets/${rejectedId}/reject`)
        .set("Authorization", `Bearer ${reviewer.accessToken}`)
        .send({ reason: "Synthetic review correction required" })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        approvalStatus: "REJECTED",
        version: 1,
        rejectionReason: "Synthetic review correction required",
      });
      await request(app)
        .patch(`/api/v1/kpi-targets/${rejectedId}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ targetValue: "89.0000" })
        .expect(200);
      const resubmitted = await request(app)
        .post(`/api/v1/kpi-targets/${rejectedId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(resubmitted.body.data).toMatchObject({
        approvalStatus: "PENDING_APPROVAL",
        version: 1,
        rejectionReason: null,
      });

      const actions = await prisma.auditEvent.findMany({
        where: {
          tenantId: admin.user.activeCompany.id,
          entityType: "KPI_TARGET",
          action: {
            in: [
              "KPI_TARGET_SUBMITTED",
              "KPI_TARGET_APPROVED",
              "KPI_TARGET_REJECTED",
              "KPI_TARGET_VERSIONED",
            ],
          },
        },
        select: { action: true },
      });
      expect(actions.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          "KPI_TARGET_SUBMITTED",
          "KPI_TARGET_APPROVED",
          "KPI_TARGET_REJECTED",
          "KPI_TARGET_VERSIONED",
        ]),
      );
    } finally {
      await removeApproval();
    }
  });

  it("auto-approves without enforcing the future evidence gate", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const suffix = randomUUID().slice(0, 8);
    const configuration = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      {
        productService: `Automatic ${suffix}`,
        requiresApproval: false,
        requiresEvidence: true,
      },
    );
    expect(configuration.status).toBe(201);
    const target = await createTarget(
      admin.accessToken,
      configuration.body.data.id,
      `KTG-AUTO-${suffix}`,
    );
    expect(target.status).toBe(201);
    const submitted = await request(app)
      .post(`/api/v1/kpi-targets/${target.body.data.id}/submit`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      approvalStatus: "APPROVED",
      submittedBy: { id: admin.user.id },
      approvedBy: null,
    });
    expect(submitted.body.data.approvedAt).toBeTruthy();
  });

  it("prevents cross-tenant reads, writes, approvals and related-record links while allowing repeated codes", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company1 = admin.user.activeCompany;
    const company2 = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const suffix = Date.now().toString().slice(-7);
    const configuration1 = await createConfiguration(
      admin.accessToken,
      admin.user.id,
      { productService: `Isolation ${suffix}` },
    );
    expect(configuration1.status).toBe(201);
    const repeatedCode = `KTG-ISO-${suffix}`;
    const target1 = await createTarget(
      admin.accessToken,
      configuration1.body.data.id,
      repeatedCode,
    );
    expect(target1.status).toBe(201);

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    await request(app)
      .get(`/api/v1/kpi-configurations/${configuration1.body.data.id}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(404);
    await request(app)
      .patch(`/api/v1/kpi-configurations/${configuration1.body.data.id}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .send({ enabled: false })
      .expect(404);
    await request(app)
      .get(`/api/v1/kpi-targets/${target1.body.data.id}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(404);
    await request(app)
      .patch(`/api/v1/kpi-targets/${target1.body.data.id}`)
      .set("Authorization", `Bearer ${company2Token}`)
      .send({ targetValue: "1" })
      .expect(404);
    await request(app)
      .post(`/api/v1/kpi-targets/${target1.body.data.id}/approve`)
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(404);

    const configuration2 = await createConfiguration(
      company2Token,
      admin.user.id,
      { productService: `Isolation ${suffix}` },
    );
    expect(configuration2.status).toBe(201);
    const target2 = await createTarget(
      company2Token,
      configuration2.body.data.id,
      repeatedCode,
      {
        period: "FY26-27 Q3",
        periodStart: "2027-01-01",
        periodEnd: "2027-03-31",
        effectiveFrom: "2027-01-01",
        effectiveTo: "2027-03-31",
      },
    );
    expect(target2.status).toBe(201);

    const company1Unit = await prisma.orgUnit.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: company1.id, code: "UNIT-001" } },
    });
    const invalidScope = await createConfiguration(
      company2Token,
      admin.user.id,
      {
        productService: `Invalid scope ${suffix}`,
        orgUnitId: company1Unit.id,
      },
    );
    expect(invalidScope.status).toBe(400);
    expect(invalidScope.body.error.code).toBe("RELATED_RECORD_INVALID");
  });

  it("scopes Company threshold defaults to the authenticated Company only", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company1 = admin.user.activeCompany;
    const company2 = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(company2).toBeTruthy();

    // Distinct values prove the response follows the token, not the row order.
    await prisma.tenant.update({
      where: { id: company1.id },
      data: {
        defaultAmberThresholdPct: "3.50",
        defaultRedThresholdPct: "11.25",
      },
    });
    await prisma.tenant.update({
      where: { id: company2!.id },
      data: {
        defaultAmberThresholdPct: "7.00",
        defaultRedThresholdPct: "19.75",
      },
    });

    const first = await request(app)
      .get("/api/v1/kpi-configurations/threshold-defaults")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    // Decimal.toString() normalises trailing zeros, so compare numerically
    // while still proving the transport type stays a string.
    expect(typeof first.body.data.defaultAmberThresholdPct).toBe("string");
    expect(Number(first.body.data.defaultAmberThresholdPct)).toBe(3.5);
    expect(Number(first.body.data.defaultRedThresholdPct)).toBe(11.25);

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    const second = await request(app)
      .get("/api/v1/kpi-configurations/threshold-defaults")
      .set("Authorization", `Bearer ${company2Token}`)
      .expect(200);
    expect(Number(second.body.data.defaultAmberThresholdPct)).toBe(7);
    expect(Number(second.body.data.defaultRedThresholdPct)).toBe(19.75);
    expect(second.body.data).not.toHaveProperty("tenantId");
  });

  it("requires authentication and kpis:read for Company threshold defaults", async () => {
    await request(app)
      .get("/api/v1/kpi-configurations/threshold-defaults")
      .expect(401);

    const reader = await loginAs("user001@example.test", "User001!Secure");
    expect(reader.user.permissions).toContain("kpis:read");
    expect(reader.user.permissions).not.toContain("kpi-config:write");
    await request(app)
      .get("/api/v1/kpi-configurations/threshold-defaults")
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .expect(200);
  });

  it("enforces tenant foreign keys, active membership and target constraints in PostgreSQL", async () => {
    const [company1, company2, admin, regular, definition, company2Unit] =
      await Promise.all([
        prisma.tenant.findUniqueOrThrow({ where: { code: "COM-001" } }),
        prisma.tenant.findUniqueOrThrow({ where: { code: "COM-002" } }),
        prisma.user.findUniqueOrThrow({
          where: { email: "admin001@example.test" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "user001@example.test" },
        }),
        prisma.kpiDefinition.findUniqueOrThrow({ where: { code: "KPI-001" } }),
        prisma.orgUnit.findFirstOrThrow({
          where: { tenant: { code: "COM-002" }, code: "UNIT-001" },
        }),
      ]);

    await expect(
      prisma.kpiConfiguration.create({
        data: {
          tenantId: company1.id,
          kpiDefinitionId: definition.id,
          orgUnitId: company2Unit.id,
          productService: `DB scope ${randomUUID()}`,
          ownerId: admin.id,
          reviewFrequency: "QUARTERLY",
          effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.kpiConfiguration.create({
        data: {
          tenantId: company2.id,
          kpiDefinitionId: definition.id,
          productService: `DB owner ${randomUUID()}`,
          ownerId: regular.id,
          reviewFrequency: "QUARTERLY",
          effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ).rejects.toThrow();

    const configuration = await prisma.kpiConfiguration.findFirstOrThrow({
      where: { tenantId: company1.id, deletedAt: null },
    });
    await expect(
      prisma.kpiTarget.create({
        data: {
          tenantId: company1.id,
          kpiConfigurationId: configuration.id,
          code: `KTG-DB-${randomUUID()}`,
          period: "FY26-27 Q4",
          periodStart: new Date("2027-04-01T00:00:00.000Z"),
          periodEnd: new Date("2027-06-30T00:00:00.000Z"),
          targetValue: "10",
          minValue: "10",
          maxValue: "5",
          effectiveFrom: new Date("2027-04-01T00:00:00.000Z"),
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps the legacy KpiGoal API and rows while exposing enum-backed definitions", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const [goalCount, goals, definitionColumns] = await Promise.all([
      prisma.kpiGoal.count({
        where: { tenantId: admin.user.activeCompany.id },
      }),
      request(app)
        .get("/api/v1/kpi-goals")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200),
      prisma.$queryRaw<Array<{ column_name: string; udt_name: string }>>`
        SELECT column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'kpi_definitions'
          AND column_name IN ('direction', 'frequency')
        ORDER BY column_name
      `,
    ]);
    expect(goals.body.data).toHaveLength(goalCount);
    expect(goalCount).toBeGreaterThan(0);
    expect(definitionColumns).toEqual([
      { column_name: "direction", udt_name: "KpiDirection" },
      { column_name: "frequency", udt_name: "KpiFrequency" },
    ]);
  });
});
