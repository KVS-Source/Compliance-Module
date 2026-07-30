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

describe("Control API Slice 3", () => {
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

  const ensureFrameworkWithRule = async () => {
    const framework = await prisma.framework.upsert({
      where: {
        code_version: { code: "FW-CTL-API", version: "1" },
      },
      update: { status: "ACTIVE", name: "Control API Framework" },
      create: {
        code: "FW-CTL-API",
        name: "Control API Framework",
        version: "1",
        status: "ACTIVE",
      },
    });
    const rule = await prisma.frameworkRule.upsert({
      where: {
        frameworkId_code: { frameworkId: framework.id, code: "R-CTL-1" },
      },
      update: { status: "ACTIVE", title: "Control API Rule" },
      create: {
        frameworkId: framework.id,
        code: "R-CTL-1",
        title: "Control API Rule",
        status: "ACTIVE",
      },
    });
    return { framework, rule };
  };

  const createApprovedPolicy = async (adminToken: string) => {
    const revoke = await grantUserApprove();
    try {
      const user = await loginAs("user001@example.test", "User001!Secure");
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: `Control Policy ${randomUUID()}`,
          content: "Synthetic approved policy for Control mappings",
          requiresEvidence: false,
        })
        .expect(201);
      const versionId = created.body.data.latestVersion.id as string;
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(200);
      return {
        policyId: created.body.data.id as string,
        versionId,
      };
    } finally {
      await revoke();
    }
  };

  const controlBody = (overrides: Record<string, unknown> = {}) => ({
    title: `Control ${randomUUID()}`,
    objective: "Verify Control API behaviour with synthetic data",
    implementationStatus: "NOT_STARTED",
    controlType: "PREVENTIVE",
    frequency: "MONTHLY",
    verificationMethod: "Review synthetic evidence",
    ...overrides,
  });

  it("creates a Control with server-generated code and default ACTIVE lifecycle", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const response = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);

    expect(response.body.data.code).toMatch(/^CTL-/);
    expect(response.body.data.lifecycleStatus).toBe("ACTIVE");
    expect(response.body.data.activeCheckpointCount).toBe(0);

    const stored = await prisma.control.findFirstOrThrow({
      where: { id: response.body.data.id },
    });
    expect(stored.code).toBe(response.body.data.code);
    expect(stored.lifecycleStatus).toBe("ACTIVE");
  });

  it("allocates distinct Control codes under concurrency", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/controls")
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send(controlBody({ title: `Concurrent ${randomUUID()}` })),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const codes = results.map((result) => result.body.data.code as string);
    expect(new Set(codes).size).toBe(5);
  });

  it("enforces tenant isolation with safe 404 for cross-tenant IDs", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);

    const otherCompany = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(otherCompany).toBeTruthy();
    const otherToken = await switchCompany(
      admin.accessToken,
      otherCompany!.id,
    );
    await request(app)
      .get(`/api/v1/controls/${created.body.data.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_NOT_FOUND");
      });
  });

  it("rejects controls:write denial and required-field / NOT_APPLICABLE validation", async () => {
    const user = await loginAs("user001@example.test", "User001!Secure");
    await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(controlBody())
      .expect(403);

    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: "Missing fields",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
      })
      .expect(400);

    await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        controlBody({
          implementationStatus: "NOT_APPLICABLE",
          implementationNotes: "x",
        }),
      )
      .expect(400);
  });

  it("updates Control fields, skips no-op audit, and rejects archived mutation", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);
    const controlId = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/controls/${controlId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: "Updated Control Title",
        ownerId: admin.user.id,
        implementationStatus: "IN_PROGRESS",
      })
      .expect(200);

    const beforeNoOp = await prisma.auditEvent.count({
      where: { entityType: "CONTROL", entityId: controlId },
    });
    await request(app)
      .patch(`/api/v1/controls/${controlId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ title: "Updated Control Title" })
      .expect(200);
    const afterNoOp = await prisma.auditEvent.count({
      where: { entityType: "CONTROL", entityId: controlId },
    });
    expect(afterNoOp).toBe(beforeNoOp);

    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "CONTROL", entityId: controlId },
    });
    expect(
      audits.some((event) => event.action === "CONTROL_OWNER_CHANGED"),
    ).toBe(true);
    expect(
      audits.some(
        (event) => event.action === "CONTROL_IMPLEMENTATION_STATUS_CHANGED",
      ),
    ).toBe(true);
    for (const event of audits) {
      expect(JSON.stringify(event.metadata)).not.toMatch(
        /Verify Control API|Updated Control Title/i,
      );
    }

    await request(app)
      .post(`/api/v1/controls/${controlId}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);
    await request(app)
      .patch(`/api/v1/controls/${controlId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ title: "Should fail" })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_INVALID_STATE");
      });
  });

  it("enforces lifecycle transitions and same-state 409", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);
    const controlId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/controls/${controlId}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_INVALID_STATE");
      });

    await request(app)
      .post(`/api/v1/controls/${controlId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200)
      .expect((res) => {
        expect(res.body.data.lifecycleStatus).toBe("INACTIVE");
      });

    await request(app)
      .post(`/api/v1/controls/${controlId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409);

    await request(app)
      .post(`/api/v1/controls/${controlId}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200)
      .expect((res) => {
        expect(res.body.data.lifecycleStatus).toBe("ACTIVE");
      });
  });

  it("rejects archive with ACTIVE Checkpoint and allows archive after Checkpoint INACTIVE", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);
    const controlId = created.body.data.id as string;
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });

    const checkpoint = await prisma.checkpoint.create({
      data: {
        tenantId: company.id,
        controlId,
        code: `CHK-API-${randomUUID().slice(0, 8).toUpperCase()}`,
        title: "Synthetic archive blocker",
        verificationFrequency: "MONTHLY",
        ownerId: admin.user.id,
        expectedResult: "Synthetic pass",
        createdById: admin.user.id,
        updatedById: admin.user.id,
      },
    });

    await request(app)
      .post(`/api/v1/controls/${controlId}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_HAS_ACTIVE_CHECKPOINTS");
      });

    await prisma.checkpoint.update({
      where: { id: checkpoint.id },
      data: {
        lifecycleStatus: "INACTIVE",
        updatedById: admin.user.id,
      },
    });

    await request(app)
      .post(`/api/v1/controls/${controlId}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    const stored = await prisma.control.findFirstOrThrow({
      where: { id: controlId },
    });
    expect(stored.lifecycleStatus).toBe("ARCHIVED");
    expect(stored.archivedAt).not.toBeNull();

    const checkpointAfter = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpoint.id },
    });
    expect(checkpointAfter.lifecycleStatus).toBe("INACTIVE");
  });

  it("replaces Policy Version mappings with APPROVED-only and stable-Policy rules", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const first = await createApprovedPolicy(admin.accessToken);
    const second = await createApprovedPolicy(admin.accessToken);

    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);
    const controlId = created.body.data.id as string;

    await request(app)
      .put(`/api/v1/controls/${controlId}/policy-versions`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ policyVersionIds: [first.versionId, second.versionId] })
      .expect(200);

    const active = await prisma.controlPolicyVersion.findMany({
      where: { controlId, isActive: true },
    });
    expect(active).toHaveLength(2);

    // Create a second APPROVED Version of the first Policy and replace.
    const revoke = await grantUserApprove();
    try {
      const user = await loginAs("user001@example.test", "User001!Secure");
      const nextVersion = await request(app)
        .post(`/api/v1/policies/${first.policyId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          bump: "MINOR",
          content: "Replacement approved version for Control mapping",
        })
        .expect(201);
      await request(app)
        .post(`/api/v1/policy-versions/${nextVersion.body.data.id}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);
      await request(app)
        .post(`/api/v1/policy-versions/${nextVersion.body.data.id}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(200);

      await request(app)
        .put(`/api/v1/controls/${controlId}/policy-versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          policyVersionIds: [nextVersion.body.data.id, second.versionId],
        })
        .expect(200);

      const historical = await prisma.controlPolicyVersion.findMany({
        where: { controlId, policyVersionId: first.versionId },
      });
      expect(historical).toHaveLength(1);
      expect(historical[0]?.isActive).toBe(false);

      const supersededStatus = await prisma.policyVersion.findFirstOrThrow({
        where: { id: first.versionId },
      });
      expect(supersededStatus.status).toBe("SUPERSEDED");

      // Two Versions of same Policy in one request.
      await request(app)
        .put(`/api/v1/controls/${controlId}/policy-versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          policyVersionIds: [first.versionId, nextVersion.body.data.id],
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
        });

      // Non-APPROVED (SUPERSEDED) rejection.
      await request(app)
        .put(`/api/v1/controls/${controlId}/policy-versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ policyVersionIds: [first.versionId] })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
        });

      // Idempotent repeated PUT.
      const before = await prisma.auditEvent.count({
        where: {
          entityId: controlId,
          action: "CONTROL_MAPPINGS_CHANGED",
        },
      });
      await request(app)
        .put(`/api/v1/controls/${controlId}/policy-versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          policyVersionIds: [nextVersion.body.data.id, second.versionId],
        })
        .expect(200);
      const after = await prisma.auditEvent.count({
        where: {
          entityId: controlId,
          action: "CONTROL_MAPPINGS_CHANGED",
        },
      });
      expect(after).toBe(before);

      // Empty list deactivates all.
      await request(app)
        .put(`/api/v1/controls/${controlId}/policy-versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ policyVersionIds: [] })
        .expect(200);
      expect(
        await prisma.controlPolicyVersion.count({
          where: { controlId, isActive: true },
        }),
      ).toBe(0);
    } finally {
      await revoke();
    }
  });

  it("enforces Framework/Rule mapping dependencies and rollback", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const { framework, rule } = await ensureFrameworkWithRule();
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(controlBody())
      .expect(201);
    const controlId = created.body.data.id as string;

    await request(app)
      .put(`/api/v1/controls/${controlId}/framework-rules`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkRuleIds: [rule.id] })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
      });
    expect(
      await prisma.ruleControl.count({ where: { controlId } }),
    ).toBe(0);

    await request(app)
      .put(`/api/v1/controls/${controlId}/frameworks`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkIds: [framework.id] })
      .expect(200);

    await request(app)
      .put(`/api/v1/controls/${controlId}/framework-rules`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkRuleIds: [rule.id] })
      .expect(200);

    await request(app)
      .put(`/api/v1/controls/${controlId}/frameworks`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkIds: [] })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_INVALID_STATE");
      });
    expect(
      await prisma.controlFramework.count({
        where: { controlId, frameworkId: framework.id, isActive: true },
      }),
    ).toBe(1);

    // Invalid mapping ID rolls back (no partial Framework create from this PUT).
    const beforeFrameworks = await prisma.controlFramework.count({
      where: { controlId },
    });
    await request(app)
      .put(`/api/v1/controls/${controlId}/frameworks`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        frameworkIds: [framework.id, "00000000-0000-4000-8000-000000000099"],
      })
      .expect(400);
    expect(
      await prisma.controlFramework.count({ where: { controlId } }),
    ).toBe(beforeFrameworks);

    await request(app)
      .put(`/api/v1/controls/${controlId}/framework-rules`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkRuleIds: [] })
      .expect(200);
    await request(app)
      .put(`/api/v1/controls/${controlId}/frameworks`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ frameworkIds: [] })
      .expect(200);
  });

  it("supports list filters, detail counts, traceability, audit and no DELETE", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const { framework, rule } = await ensureFrameworkWithRule();
    const approved = await createApprovedPolicy(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        controlBody({
          title: `Filterable Control ${randomUUID()}`,
          policyVersionIds: [approved.versionId],
          frameworkIds: [framework.id],
          frameworkRuleIds: [rule.id],
        }),
      )
      .expect(201);
    const controlId = created.body.data.id as string;

    const listed = await request(app)
      .get("/api/v1/controls")
      .query({
        q: "Filterable",
        policyId: approved.policyId,
        frameworkId: framework.id,
        frameworkRuleId: rule.id,
        page: 1,
        pageSize: 20,
      })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      listed.body.data.some(
        (row: { id: string }) => row.id === controlId,
      ),
    ).toBe(true);
    const listRow = listed.body.data.find(
      (row: { id: string }) => row.id === controlId,
    );
    expect(listRow.objective).toBeUndefined();
    expect(listRow.description).toBeUndefined();
    expect(listRow.activePolicyVersionMappingCount).toBe(1);

    const detail = await request(app)
      .get(`/api/v1/controls/${controlId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body.data.activeFrameworkMappingCount).toBe(1);
    expect(detail.body.data.activeFrameworkRuleMappingCount).toBe(1);
    expect(detail.body.data.policyVersionMappings).toBeUndefined();

    const trace = await request(app)
      .get(`/api/v1/controls/${controlId}/traceability`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(trace.body.data.policyVersionMappings[0].policyVersion.status).toBe(
      "APPROVED",
    );
    expect(trace.body.data.frameworkRuleMappings).toHaveLength(1);

    const audits = await request(app)
      .get(`/api/v1/controls/${controlId}/audit-events`)
      .query({ page: 1, pageSize: 50 })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      audits.body.data.some(
        (event: { action: string }) => event.action === "CONTROL_CREATED",
      ),
    ).toBe(true);

    await request(app)
      .delete(`/api/v1/controls/${controlId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(404);
  });
});
