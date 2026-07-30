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

describe("Policy API Slice 2", () => {
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

  const ensureFramework = async () => {
    return prisma.framework.upsert({
      where: {
        code_version: { code: "FW-POL-API", version: "1" },
      },
      update: { status: "ACTIVE", name: "Policy API Framework" },
      create: {
        code: "FW-POL-API",
        name: "Policy API Framework",
        version: "1",
        status: "ACTIVE",
      },
    });
  };

  it("creates a Policy with latestVersion 1.0 DRAFT and null currentApprovedVersion", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const framework = await ensureFramework();
    const response = await request(app)
      .post("/api/v1/policies")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: `Policy ${randomUUID()}`,
        content: "Initial controlled policy content",
        frameworkIds: [framework.id],
        requiresEvidence: false,
      })
      .expect(201);

    expect(response.body.data.currentApprovedVersion).toBeNull();
    expect(response.body.data.latestVersion.version).toBe("1.0");
    expect(response.body.data.latestVersion.status).toBe("DRAFT");
    expect(response.body.data.code).toMatch(/^POL-/);

    const stored = await prisma.policy.findFirstOrThrow({
      where: { id: response.body.data.id },
      include: { versions: true },
    });
    expect(stored.currentApprovedVersionId).toBeNull();
    expect(stored.versions).toHaveLength(1);
  });

  it("enforces tenant isolation with safe 404 for cross-tenant IDs", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const created = await request(app)
      .post("/api/v1/policies")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: `Tenant Policy ${randomUUID()}`,
        content: "Tenant scoped content",
      })
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
      .get(`/api/v1/policies/${created.body.data.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("POLICY_NOT_FOUND");
      });
  });

  it("allocates distinct semantic versions under concurrency", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const policy = await request(app)
      .post("/api/v1/policies")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: `Concurrent Policy ${randomUUID()}`,
        content: "Base content",
      })
      .expect(201);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/v1/policies/${policy.body.data.id}/versions`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ bump: "MINOR", content: `Concurrent ${randomUUID()}` }),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const labels = results.map((result) => result.body.data.version).sort();
    expect(new Set(labels).size).toBe(5);
  });

  it("runs submit, self-approval rejection, approve supersession and audit safety", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `Workflow Policy ${randomUUID()}`,
          content: "Workflow content",
          requiresEvidence: false,
        })
        .expect(201);
      const versionId = created.body.data.latestVersion.id as string;

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);

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
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(200);

      const policy = await prisma.policy.findFirstOrThrow({
        where: { id: created.body.data.id },
        include: {
          versions: true,
          currentApprovedVersion: true,
        },
      });
      expect(policy.currentApprovedVersionId).toBe(versionId);
      expect(policy.currentApprovedVersion?.status).toBe("APPROVED");

      const second = await request(app)
        .post(`/api/v1/policies/${policy.id}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ bump: "MINOR", content: "Second version content" })
        .expect(201);
      await request(app)
        .post(`/api/v1/policy-versions/${second.body.data.id}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);
      await request(app)
        .post(`/api/v1/policy-versions/${second.body.data.id}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(200);

      const previous = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(previous.status).toBe("SUPERSEDED");
      expect(previous.supersededById).toBe(second.body.data.id);

      const audits = await request(app)
        .get(`/api/v1/policies/${policy.id}/audit-events`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      for (const event of audits.body.data) {
        const metadata = JSON.stringify(event.metadata);
        expect(metadata).not.toMatch(/Workflow content|Second version|Needs/i);
      }
      expect(
        audits.body.data.some(
          (event: { action: string }) => event.action === "POLICY_VERSION_APPROVED",
        ),
      ).toBe(true);
    } finally {
      await revoke();
    }
  });

  it("rejects Evidence-required approval with 501 and leaves state unchanged", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `Evidence Policy ${randomUUID()}`,
          content: "Evidence gated content",
          requiresEvidence: true,
        })
        .expect(201);
      const versionId = created.body.data.latestVersion.id as string;
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(501)
        .expect((res) => {
          expect(res.body.error.code).toBe("EVIDENCE_GATE_NOT_IMPLEMENTED");
        });
      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("SUBMITTED");
    } finally {
      await revoke();
    }
  });

  it("rejects future-effective approval", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `Future Policy ${randomUUID()}`,
          content: "Future effective content",
          effectiveDate: "2099-01-01",
          reviewDate: "2099-06-01",
        })
        .expect(201);
      const versionId = created.body.data.latestVersion.id as string;
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(409);
    } finally {
      await revoke();
    }
  });

  it("supports reject, resubmit, framework replace and archive rules", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const framework = await ensureFramework();
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `Archive Policy ${randomUUID()}`,
          content: "Archive flow content",
        })
        .expect(201);
      const versionId = created.body.data.latestVersion.id as string;

      await request(app)
        .put(`/api/v1/policy-versions/${versionId}/frameworks`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ frameworkIds: [framework.id] })
        .expect(200);

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);

      await request(app)
        .post(`/api/v1/policies/${created.body.data.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(409);

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/reject`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({ comments: "Needs clarification" })
        .expect(200);

      const approval = await prisma.policyApproval.findFirstOrThrow({
        where: { policyVersionId: versionId, decision: "REJECTED" },
      });
      expect(approval.comments).toBe("Needs clarification");

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/submit`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/approve`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(200);

      await request(app)
        .post(`/api/v1/policies/${created.body.data.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);

      await request(app)
        .patch(`/api/v1/policies/${created.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ title: "Should fail" })
        .expect(409);

      await request(app)
        .delete(`/api/v1/policies/${created.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    } finally {
      await revoke();
    }
  });

  it("returns 403 when permission is missing", async () => {
    const user = await loginAs("user001@example.test", "User001!Secure");
    await request(app)
      .post("/api/v1/policies")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Denied",
        content: "Denied content",
      })
      .expect(403);
  });

  it("rejects one-sided policy dates with VALIDATION_ERROR", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    await request(app)
      .post("/api/v1/policies")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: `One-sided ${randomUUID()}`,
        content: "Content",
        effectiveDate: "2026-01-01",
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      });
  });

  it("paginates versionStatus filters with accurate meta.total", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const marker = `FilterPage ${randomUUID().slice(0, 8)}`;
    const createdIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await request(app)
        .post("/api/v1/policies")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          title: `${marker} ${index}`,
          content: `Filter content ${index}`,
        })
        .expect(201);
      createdIds.push(created.body.data.id as string);
    }

    const page1 = await request(app)
      .get("/api/v1/policies")
      .query({
        q: marker,
        versionStatus: "DRAFT",
        page: 1,
        pageSize: 2,
      })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(page1.body.meta.total).toBe(3);
    expect(page1.body.meta.totalPages).toBe(2);
    expect(page1.body.data).toHaveLength(2);
    for (const item of page1.body.data) {
      expect(item.latestVersion.content).toBeUndefined();
      expect(item.latestVersion.purpose).toBeUndefined();
      expect(item.latestVersion.scope).toBeUndefined();
      expect(item.latestVersion.changeSummary).toBeUndefined();
      expect(item.latestVersion.status).toBe("DRAFT");
    }

    const page2 = await request(app)
      .get("/api/v1/policies")
      .query({
        q: marker,
        versionStatus: "DRAFT",
        page: 2,
        pageSize: 2,
      })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(page2.body.meta.total).toBe(3);
    expect(page2.body.data).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/policies/${createdIds[0]}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body.data.latestVersion.content).toBe("Filter content 0");
  });
});
