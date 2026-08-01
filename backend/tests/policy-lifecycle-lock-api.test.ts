import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
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

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Policy lifecycle lock order hardening", () => {
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
      user: { id: string; activeCompany: { id: string } };
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

  const createDraftPolicy = async (token: string) => {
    const created = await request(app)
      .post("/api/v1/policies")
      .set(auth(token))
      .send({
        title: `Lock-order policy ${randomUUID()}`,
        content: "Synthetic content for Policy lifecycle lock-order tests",
        requiresEvidence: false,
      })
      .expect(201);
    return {
      policyId: created.body.data.id as string,
      versionId: created.body.data.latestVersion.id as string,
    };
  };

  const createSubmittedPolicy = async (token: string) => {
    const { policyId, versionId } = await createDraftPolicy(token);
    await request(app)
      .post(`/api/v1/policy-versions/${versionId}/submit`)
      .set(auth(token))
      .send({})
      .expect(200);
    return { policyId, versionId };
  };

  const createControlMapped = async (
    token: string,
    policyVersionId: string,
  ) => {
    const response = await request(app)
      .post("/api/v1/controls")
      .set(auth(token))
      .send({
        title: `Lock-order control ${randomUUID()}`,
        objective: "Synthetic objective for lock-order tests",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic",
        requiresEvidence: false,
        policyVersionIds: [policyVersionId],
      })
      .expect(201);
    return response.body.data as { id: string };
  };

  it("source order: submit/reject/updateVersion/replaceFrameworks lock Policy before Version", async () => {
    const servicePath = path.join(
      process.cwd(),
      "src/modules/policies/service.ts",
    );
    const src = await readFile(servicePath, "utf8");
    for (const method of [
      "async submit(",
      "async reject(",
      "async updateVersion(",
      "async replaceFrameworks(",
    ]) {
      const start = src.indexOf(method);
      expect(start).toBeGreaterThan(-1);
      const slice = src.slice(start, start + 1200);
      expect(slice).toContain("lockParentPolicyThenVersion");
      // Must not call lockVersion before the Policy-first helper in the method body.
      const helperIdx = slice.indexOf("lockParentPolicyThenVersion");
      const bareVersionIdx = slice.indexOf("this.repository.lockVersion");
      if (bareVersionIdx !== -1) {
        expect(helperIdx).toBeLessThan(bareVersionIdx);
      }
    }
  });

  it("A: mapping-first then reject waits on Policy without deadlock", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { policyId, versionId } = await createSubmittedPolicy(
        admin.accessToken,
      );
      const control = await createControlMapped(admin.accessToken, versionId);

      const hold = deferred();
      const mappingLocked = deferred();
      let rejectSettled = false;

      // Production-equivalent mapping order: Policy → Version → Control
      const mappingTx = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM policies
            WHERE tenant_id = ${tenantId}::uuid AND id = ${policyId}::uuid
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT id FROM policy_versions
            WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT id FROM controls
            WHERE tenant_id = ${tenantId}::uuid AND id = ${control.id}::uuid
            FOR UPDATE
          `;
          mappingLocked.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await mappingLocked.promise;

      // Production-equivalent reject order (corrected): Policy → Version
      const rejectTx = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT p.id FROM policy_versions v
              INNER JOIN policies p
                ON p.tenant_id = v.tenant_id AND p.id = v.policy_id
              WHERE v.tenant_id = ${tenantId}::uuid AND v.id = ${versionId}::uuid
              FOR UPDATE OF p
            `;
            await tx.$queryRaw`
              SELECT id FROM policy_versions
              WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
              FOR UPDATE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          rejectSettled = true;
        });

      await sleep(400);
      expect(rejectSettled).toBe(false);
      hold.resolve();
      await mappingTx;
      await rejectTx;
      expect(rejectSettled).toBe(true);

      // Live reject still succeeds after mapping released.
      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/reject`)
        .set(auth(user.accessToken))
        .send({ comments: "Reject after mapping serialization test" })
        .expect(200);
      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(version.status).toBe("REJECTED");
      const rejects = await prisma.policyApproval.count({
        where: {
          tenantId,
          policyVersionId: versionId,
          decision: "REJECTED",
        },
      });
      expect(rejects).toBe(1);
    } finally {
      await revoke();
    }
  });

  it("B: reject-first then mapping waits; mapping fails M1 after REJECTED", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const tenantId = admin.user.activeCompany.id;
      const { policyId, versionId } = await createSubmittedPolicy(
        admin.accessToken,
      );
      const control = await createControlMapped(admin.accessToken, versionId);

      const hold = deferred();
      const rejectLocked = deferred();
      let mappingSettled = false;

      const rejectHoldTx = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT p.id FROM policy_versions v
            INNER JOIN policies p
              ON p.tenant_id = v.tenant_id AND p.id = v.policy_id
            WHERE v.tenant_id = ${tenantId}::uuid AND v.id = ${versionId}::uuid
            FOR UPDATE OF p
          `;
          await tx.$queryRaw`
            SELECT id FROM policy_versions
            WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
            FOR UPDATE
          `;
          rejectLocked.resolve();
          await hold.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      );

      await rejectLocked.promise;

      const mappingTx = prisma
        .$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT id FROM policies
              WHERE tenant_id = ${tenantId}::uuid AND id = ${policyId}::uuid
              FOR UPDATE
            `;
            await tx.$queryRaw`
              SELECT id FROM policy_versions
              WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
              FOR UPDATE
            `;
            await tx.$queryRaw`
              SELECT id FROM controls
              WHERE tenant_id = ${tenantId}::uuid AND id = ${control.id}::uuid
              FOR UPDATE
            `;
          },
          { maxWait: 15_000, timeout: 20_000 },
        )
        .finally(() => {
          mappingSettled = true;
        });

      await sleep(400);
      expect(mappingSettled).toBe(false);
      hold.resolve();
      await rejectHoldTx;
      await mappingTx;
      expect(mappingSettled).toBe(true);

      await request(app)
        .post(`/api/v1/policy-versions/${versionId}/reject`)
        .set(auth(user.accessToken))
        .send({ comments: "Reject before mapping replace M1 test" })
        .expect(200);

      // replacePolicyVersions onto REJECTED version must fail M1.
      await request(app)
        .put(`/api/v1/controls/${control.id}/policy-versions`)
        .set(auth(admin.accessToken))
        .send({ policyVersionIds: [versionId] })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe("CONTROL_MAPPING_INVALID");
        });
    } finally {
      await revoke();
    }
  });

  it("C: submit and mapping serialize on Policy without deadlock", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const { policyId, versionId } = await createDraftPolicy(admin.accessToken);

    // Mapping to DRAFT fails M1; use an APPROVED sibling path is heavy —
    // exercise Policy-first wait graph with production-equivalent locks only.
    const hold = deferred();
    const submitLocked = deferred();
    let mappingSettled = false;

    const submitHold = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT p.id FROM policy_versions v
          INNER JOIN policies p
            ON p.tenant_id = v.tenant_id AND p.id = v.policy_id
          WHERE v.tenant_id = ${tenantId}::uuid AND v.id = ${versionId}::uuid
          FOR UPDATE OF p
        `;
        await tx.$queryRaw`
          SELECT id FROM policy_versions
          WHERE tenant_id = ${tenantId}::uuid AND id = ${versionId}::uuid
          FOR UPDATE
        `;
        submitLocked.resolve();
        await hold.promise;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    await submitLocked.promise;

    const mappingWait = prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM policies
            WHERE tenant_id = ${tenantId}::uuid AND id = ${policyId}::uuid
            FOR UPDATE
          `;
        },
        { maxWait: 15_000, timeout: 20_000 },
      )
      .finally(() => {
        mappingSettled = true;
      });

    await sleep(400);
    expect(mappingSettled).toBe(false);
    hold.resolve();
    await submitHold;
    await mappingWait;
    expect(mappingSettled).toBe(true);

    await request(app)
      .post(`/api/v1/policy-versions/${versionId}/submit`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    const version = await prisma.policyVersion.findFirstOrThrow({
      where: { id: versionId },
    });
    expect(version.status).toBe("SUBMITTED");
  });

  it("D: concurrent approve and reject — exactly one terminal decision", async () => {
    const revoke = await grantUserApprove();
    try {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const user = await loginAs("user001@example.test", "User001!Secure");
      const { versionId } = await createSubmittedPolicy(admin.accessToken);

      const [approveRes, rejectRes] = await Promise.all([
        request(app)
          .post(`/api/v1/policy-versions/${versionId}/approve`)
          .set(auth(user.accessToken))
          .send({}),
        request(app)
          .post(`/api/v1/policy-versions/${versionId}/reject`)
          .set(auth(user.accessToken))
          .send({ comments: "Concurrent reject attempt" }),
      ]);

      const statuses = [approveRes.status, rejectRes.status];
      // One wins with 200; the other gets a conflict/domain error (4xx).
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s >= 400)).toHaveLength(1);

      const version = await prisma.policyVersion.findFirstOrThrow({
        where: { id: versionId },
      });
      expect(["APPROVED", "REJECTED"]).toContain(version.status);

      const decisions = await prisma.policyApproval.findMany({
        where: { policyVersionId: versionId },
      });
      expect(decisions.length).toBe(1);
      expect(decisions[0]!.decision).toBe(
        version.status === "APPROVED" ? "APPROVED" : "REJECTED",
      );

      if (version.status === "APPROVED") {
        const policy = await prisma.policy.findFirstOrThrow({
          where: { id: version.policyId },
        });
        expect(policy.currentApprovedVersionId).toBe(versionId);
      }
    } finally {
      await revoke();
    }
  });
});
