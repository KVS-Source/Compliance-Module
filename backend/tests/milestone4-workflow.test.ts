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

/**
 * Cross-module Milestone 4 workflow against real PostgreSQL.
 * Module-scoped suites remain authoritative for edge cases; this file
 * verifies the Policy → Control → Checkpoint → Review chain once.
 */
describe("Milestone 4 cross-module workflow", () => {
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

  const ensureFramework = async () => {
    return prisma.framework.upsert({
      where: {
        code_version: { code: "FW-M4-WF", version: "1" },
      },
      update: { status: "ACTIVE", name: "M4 Workflow Framework" },
      create: {
        code: "FW-M4-WF",
        name: "M4 Workflow Framework",
        version: "1",
        status: "ACTIVE",
      },
    });
  };

  it("chains Policy approval through Control, Checkpoint, Review, traceability and audit", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const approver = await loginAs("user001@example.test", "User001!Secure");
      const framework = await ensureFramework();
      const suffix = randomUUID().slice(0, 8);

      const policyCreated = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `M4 Workflow Policy ${suffix}`,
          content: `Cross-module workflow content ${suffix}`,
          requiresEvidence: false,
          frameworkIds: [framework.id],
        })
        .expect(201);

      const policyId = policyCreated.body.data.id as string;
      const versionId = policyCreated.body.data.latestVersion.id as string;
      expect(policyCreated.body.data.latestVersion.status).toBe("DRAFT");
      expect(policyCreated.body.data).not.toHaveProperty("tenantId");
      expect(policyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe("SUBMITTED");
        });

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(403)
        .expect((res) => {
          expect(res.body.error.code).toBe("POLICY_SELF_APPROVAL_FORBIDDEN");
        });

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${approver.accessToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe("APPROVED");
        });

      const controlCreated = await request(app)
        .post("/api/v1/controls")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `M4 Workflow Control ${suffix}`,
          objective: "Link approved Policy Version across modules",
          implementationStatus: "IN_PROGRESS",
          controlType: "PREVENTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Checkpoint review outcomes",
          requiresEvidence: false,
          policyVersionIds: [versionId],
          frameworkIds: [framework.id],
        })
        .expect(201);

      const controlId = controlCreated.body.data.id as string;
      expect(controlCreated.body.data.code).toMatch(/^CTL-/);
      expect(controlCreated.body.data.lifecycleStatus).toBe("ACTIVE");

      const controlTrace = await request(app)
        .get(`/api/v1/controls/${controlId}/traceability`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(
        controlTrace.body.data.policyVersionMappings.some(
          (mapping: { policyVersionId: string; isActive: boolean }) =>
            mapping.policyVersionId === versionId && mapping.isActive,
        ),
      ).toBe(true);

      const checkpointCreated = await request(app)
        .post("/api/v1/checkpoints")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          controlId,
          title: `M4 Workflow Checkpoint ${suffix}`,
          verificationFrequency: "CONTINUOUS",
          expectedResult: "Synthetic verification outcome",
          evidenceRequired: false,
          initialReviewDate: "2026-07-01",
        })
        .expect(201);

      const checkpointId = checkpointCreated.body.data.id as string;
      expect(checkpointCreated.body.data.code).toMatch(/^CHK-/);

      const reviewPeriod = `2099-01-15#M4${suffix.toUpperCase().replace(/-/g, "").slice(0, 8)}`;
      const reviewBody = {
        reviewPeriod,
        reviewDate: "2099-01-15",
        outcome: "PASS",
        observation: null,
        recommendation: null,
        nextReviewDate: "2099-02-15",
      };
      for (const forbidden of [
        "tenantId",
        "reviewerId",
        "actorId",
        "comments",
        "checkpointId",
      ]) {
        expect(reviewBody).not.toHaveProperty(forbidden);
      }

      const reviewCreated = await request(app)
        .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send(reviewBody)
        .expect(201);

      expect(reviewCreated.body.data.outcome).toBe("PASS");
      expect(reviewCreated.body.data.reviewPeriod).toBe(reviewPeriod);
      expect(reviewCreated.body.data.reviewer.id).toBe(admin.user.id);

      const latest = await request(app)
        .get(`/api/v1/checkpoints/${checkpointId}/latest-review`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(latest.body.data.id).toBe(reviewCreated.body.data.id);

      const history = await request(app)
        .get(`/api/v1/checkpoints/${checkpointId}/reviews`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(
        history.body.data.some(
          (entry: { id: string }) => entry.id === reviewCreated.body.data.id,
        ),
      ).toBe(true);

      await request(app)
        .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send(reviewBody)
        .expect(409);

      const checkpointTrace = await request(app)
        .get(`/api/v1/checkpoints/${checkpointId}/traceability`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(checkpointTrace.body.data.control.id).toBe(controlId);
      expect(
        checkpointTrace.body.data.policyVersionMappings.active.some(
          (mapping: { policyVersion: { id: string } }) =>
            mapping.policyVersion.id === versionId,
        ),
      ).toBe(true);

      const checkpointAudit = await request(app)
        .get(`/api/v1/checkpoints/${checkpointId}/audit-events`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const auditBlob = JSON.stringify(checkpointAudit.body.data);
      expect(auditBlob).not.toMatch(/observation|recommendation/i);

      const otherCompany = admin.user.companies.find(
        (company) => company.code === "COM-002",
      );
      expect(otherCompany).toBeTruthy();
      const switched = await request(app)
        .post("/api/v1/auth/tenant-context")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ companyId: otherCompany!.id })
        .expect(200);
      await request(app)
        .get(`/api/v1/checkpoints/${checkpointId}`)
        .set("Authorization", `Bearer ${switched.body.data.accessToken}`)
        .expect(404);
    } finally {
      await revoke();
    }
  });
});
