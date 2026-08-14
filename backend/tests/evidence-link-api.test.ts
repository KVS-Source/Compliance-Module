import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { EvidenceLifecycleStatus, PrismaClient } from "@prisma/client";
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

describe("Evidence Control and Checkpoint linking Slice 5.3", () => {
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
        title: `Evidence link ${randomUUID()}`,
        ...body,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      lifecycleStatus: string;
      hasFile: boolean;
      activeControlLinkCount?: number;
      activeCheckpointLinkCount?: number;
    };
  };

  const createControl = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/controls")
      .set(auth(token))
      .send({
        title: `Control for Evidence link ${randomUUID()}`,
        objective: "Synthetic Control for Evidence linking tests",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Review synthetic evidence",
        ...overrides,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      lifecycleStatus: string;
    };
  };

  const createCheckpoint = async (
    token: string,
    controlId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/checkpoints")
      .set(auth(token))
      .send({
        controlId,
        title: `Checkpoint for Evidence link ${randomUUID()}`,
        expectedResult: "Synthetic expected result remains true",
        verificationFrequency: "MONTHLY",
        ...overrides,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      lifecycleStatus: string;
      controlId: string;
    };
  };

  const setEvidenceLifecycle = async (
    evidenceId: string,
    lifecycleStatus: EvidenceLifecycleStatus,
  ) => {
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        lifecycleStatus,
        ...(lifecycleStatus === "ARCHIVED"
          ? { archivedAt: new Date() }
          : { archivedAt: null }),
      },
    });
  };

  it("links Control with 201, unlinks with 200, re-links with 200, and rejects duplicates", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);

    const linked = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);

    expect(linked.body.data.isActive).toBe(true);
    expect(linked.body.data.control).toMatchObject({
      id: control.id,
      code: control.code,
      lifecycleStatus: "ACTIVE",
    });
    expect(linked.body.data.linkedAt).toBeTruthy();
    expect(linked.body.data.linkedBy).toMatchObject({
      id: admin.user.id,
    });
    expect(linked.body.data).not.toHaveProperty("storageKey");
    expect(linked.body.data).not.toHaveProperty("linkReason");
    const firstCreatedAt = linked.body.data.linkedAt as string;
    const firstLinkedById = linked.body.data.linkedBy.id as string;

    const duplicate = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    expect(duplicate.body.error.code).toBe("EVIDENCE_CONTROL_LINK_EXISTS");

    const unlinked = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(unlinked.body.data.isActive).toBe(false);

    const missing = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(404);
    expect(missing.body.error.code).toBe("EVIDENCE_CONTROL_LINK_NOT_FOUND");

    const relinked = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(relinked.body.data.isActive).toBe(true);
    expect(relinked.body.data.id).toBe(linked.body.data.id);
    expect(relinked.body.data.linkedAt).toBe(firstCreatedAt);
    expect(relinked.body.data.linkedBy.id).toBe(firstLinkedById);

    const row = await prisma.evidenceControlLink.findFirstOrThrow({
      where: {
        tenantId: admin.user.activeCompany.id,
        evidenceId: evidence.id,
        controlId: control.id,
      },
    });
    expect(row.isActive).toBe(true);
    expect(row.createdById).toBe(admin.user.id);

    const audits = await prisma.auditEvent.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        entityType: "EVIDENCE",
        entityId: evidence.id,
        action: {
          in: ["EVIDENCE_CONTROL_LINKED", "EVIDENCE_CONTROL_UNLINKED"],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(3);
    const reactivated = audits.find((event) => {
      const metadata = event.metadata as Record<string, unknown>;
      return (
        event.action === "EVIDENCE_CONTROL_LINKED" &&
        metadata.reactivated === true
      );
    });
    expect(reactivated).toBeTruthy();
    for (const event of audits) {
      const metadata = event.metadata as Record<string, unknown>;
      expect(metadata).not.toHaveProperty("description");
      expect(metadata).not.toHaveProperty("storageKey");
      expect(metadata).not.toHaveProperty("linkReason");
      expect(metadata).toHaveProperty("code");
      expect(metadata).toHaveProperty("controlCode");
    }
  });

  it("links Checkpoint independently of Control links with full lifecycle", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(admin.accessToken, control.id);

    // Checkpoint link does not require an Evidence-Control link first.
    const linked = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    expect(linked.body.data.checkpoint).toMatchObject({
      id: checkpoint.id,
      controlId: control.id,
      lifecycleStatus: "ACTIVE",
    });

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_CHECKPOINT_LINK_EXISTS");
      });

    await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}/unlink`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);

    await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}/unlink`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_CHECKPOINT_LINK_NOT_FOUND");
      });

    const relinked = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(relinked.body.data.isActive).toBe(true);
    expect(relinked.body.data.id).toBe(linked.body.data.id);
  });

  it("lists only active links with pagination and detail counts", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const controlA = await createControl(admin.accessToken);
    const controlB = await createControl(admin.accessToken);
    const controlC = await createControl(admin.accessToken);
    const parent = await createControl(admin.accessToken);
    const checkpoint = await createCheckpoint(admin.accessToken, parent.id);

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${controlA.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${controlB.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${controlC.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${controlC.id}/unlink`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/checkpoints/${checkpoint.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);

    const page1 = await request(app)
      .get(`/api/v1/evidence/${evidence.id}/controls`)
      .query({ page: 1, pageSize: 1 })
      .set(auth(admin.accessToken))
      .expect(200);
    expect(page1.body.meta.total).toBe(2);
    expect(page1.body.meta.pageSize).toBe(1);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.data[0].isActive).toBe(true);

    const allActive = await request(app)
      .get(`/api/v1/evidence/${evidence.id}/controls`)
      .query({ page: 1, pageSize: 20 })
      .set(auth(admin.accessToken))
      .expect(200);
    expect(allActive.body.data).toHaveLength(2);
    expect(
      allActive.body.data.every(
        (row: { isActive: boolean }) => row.isActive === true,
      ),
    ).toBe(true);
    expect(
      allActive.body.data.some(
        (row: { control: { id: string } }) => row.control.id === controlC.id,
      ),
    ).toBe(false);

    const checkpoints = await request(app)
      .get(`/api/v1/evidence/${evidence.id}/checkpoints`)
      .set(auth(admin.accessToken))
      .expect(200);
    expect(checkpoints.body.meta.total).toBe(1);
    expect(checkpoints.body.data[0].checkpoint.id).toBe(checkpoint.id);

    const detail = await request(app)
      .get(`/api/v1/evidence/${evidence.id}`)
      .set(auth(admin.accessToken))
      .expect(200);
    expect(detail.body.data.activeControlLinkCount).toBe(2);
    expect(detail.body.data.activeCheckpointLinkCount).toBe(1);
    expect(detail.body.data).not.toHaveProperty("controlLinks");
    expect(detail.body.data).not.toHaveProperty("storageKey");

    const list = await request(app)
      .get("/api/v1/evidence")
      .query({ q: evidence.code, page: 1, pageSize: 5 })
      .set(auth(admin.accessToken))
      .expect(200);
    const listRow = list.body.data.find(
      (row: { id: string }) => row.id === evidence.id,
    );
    expect(listRow).toBeTruthy();
    expect(listRow).not.toHaveProperty("activeControlLinkCount");
  });

  it("rejects link and unlink for non-DRAFT Evidence while keeping links readable", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);

    for (const status of [
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "ARCHIVED",
    ] as const) {
      await setEvidenceLifecycle(evidence.id, status);
      const linkDenied = await request(app)
        .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
        .set(auth(admin.accessToken))
        .send({});
      expect(linkDenied.status).toBe(409);
      expect(["EVIDENCE_INVALID_STATE", "EVIDENCE_ARCHIVED"]).toContain(
        linkDenied.body.error.code,
      );

      const unlinkDenied = await request(app)
        .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`)
        .set(auth(admin.accessToken))
        .send({});
      expect(unlinkDenied.status).toBe(409);

      const listed = await request(app)
        .get(`/api/v1/evidence/${evidence.id}/controls`)
        .set(auth(admin.accessToken))
        .expect(200);
      expect(listed.body.meta.total).toBe(1);
      expect(listed.body.data[0].control.id).toBe(control.id);
    }

    await setEvidenceLifecycle(evidence.id, "DRAFT");
  });

  it("rejects non-ACTIVE targets for new links and allows unlink of inactive/archived targets", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const inactiveControl = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/controls/${inactiveControl.id}/deactivate`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);

    const inactiveLink = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${inactiveControl.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    expect(inactiveLink.body.error.code).toBe("CONTROL_INVALID_STATE");

    const archivedControl = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/controls/${archivedControl.id}/archive`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    const archivedLink = await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${archivedControl.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    expect(archivedLink.body.error.code).toBe("CONTROL_INVALID_STATE");

    const activeControl = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${activeControl.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/controls/${activeControl.id}/deactivate`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    const unlinkedInactive = await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/controls/${activeControl.id}/unlink`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(unlinkedInactive.body.data.isActive).toBe(false);

    const parent = await createControl(admin.accessToken);
    const inactiveCheckpoint = await createCheckpoint(
      admin.accessToken,
      parent.id,
    );
    await request(app)
      .post(`/api/v1/checkpoints/${inactiveCheckpoint.id}/deactivate`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    const inactiveCp = await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/checkpoints/${inactiveCheckpoint.id}`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(409);
    expect(inactiveCp.body.error.code).toBe("CHECKPOINT_INVALID_STATE");

    const activeCheckpoint = await createCheckpoint(
      admin.accessToken,
      parent.id,
    );
    await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/checkpoints/${activeCheckpoint.id}`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/checkpoints/${activeCheckpoint.id}/deactivate`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    await request(app)
      .post(
        `/api/v1/evidence/${evidence.id}/checkpoints/${activeCheckpoint.id}/unlink`,
      )
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
  });

  it("enforces tenant isolation for Evidence, Control and Checkpoint", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const foreignCompany = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const tokenCom2 = await switchCompany(
      admin.accessToken,
      foreignCompany.id,
    );
    const foreignEvidence = await createEvidence(tokenCom2);
    const foreignControl = await createControl(tokenCom2);
    const foreignParent = await createControl(tokenCom2);
    const foreignCheckpoint = await createCheckpoint(
      tokenCom2,
      foreignParent.id,
    );

    const tokenCom1 = await switchCompany(
      tokenCom2,
      admin.user.activeCompany.id,
    );
    const localEvidence = await createEvidence(tokenCom1);
    const localControl = await createControl(tokenCom1);

    const crossEvidence = await request(app)
      .post(
        `/api/v1/evidence/${foreignEvidence.id}/controls/${localControl.id}`,
      )
      .set(auth(tokenCom1))
      .send({});
    expect(crossEvidence.status).toBe(404);
    expect(crossEvidence.body.error.code).toBe("EVIDENCE_NOT_FOUND");

    const crossControl = await request(app)
      .post(
        `/api/v1/evidence/${localEvidence.id}/controls/${foreignControl.id}`,
      )
      .set(auth(tokenCom1))
      .send({});
    expect(crossControl.status).toBe(404);
    expect(crossControl.body.error.code).toBe("CONTROL_NOT_FOUND");

    const crossCheckpoint = await request(app)
      .post(
        `/api/v1/evidence/${localEvidence.id}/checkpoints/${foreignCheckpoint.id}`,
      )
      .set(auth(tokenCom1))
      .send({});
    expect(crossCheckpoint.status).toBe(404);
    expect(crossCheckpoint.body.error.code).toBe("CHECKPOINT_NOT_FOUND");
  });

  it("allows COMPANY_USER to list links and denies mutations without evidence:write", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);

    const user = await loginAs("user001@example.test", "User001!Secure");
    await request(app)
      .get(`/api/v1/evidence/${evidence.id}/controls`)
      .set(auth(user.accessToken))
      .expect(200);

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`)
      .set(auth(user.accessToken))
      .send({})
      .expect(403);

    const writeGrant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:write",
    });
    try {
      const reloaded = await loginAs("user001@example.test", "User001!Secure");
      const secondControl = await createControl(admin.accessToken);
      await request(app)
        .post(
          `/api/v1/evidence/${evidence.id}/controls/${secondControl.id}`,
        )
        .set(auth(reloaded.accessToken))
        .send({})
        .expect(201);
    } finally {
      await writeGrant.revoke();
    }
  });

  it("does not change Evidence lifecycle or file fields when linking", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken, {
      title: `Stable lifecycle ${randomUUID()}`,
    });
    const control = await createControl(admin.accessToken);
    const before = await prisma.evidence.findUniqueOrThrow({
      where: { id: evidence.id },
    });

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(201);

    const after = await prisma.evidence.findUniqueOrThrow({
      where: { id: evidence.id },
    });
    expect(after.lifecycleStatus).toBe("DRAFT");
    expect(after.lifecycleStatus).toBe(before.lifecycleStatus);
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.contentSha256).toBe(before.contentSha256);
    expect(after.byteSize).toBe(before.byteSize);
    expect(after.submittedAt).toBeNull();
    expect(after.reviewedAt).toBeNull();
  });

  it("handles concurrent duplicate Control links and concurrent unlinks safely", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);

    const concurrentLinks = await Promise.all([
      request(app)
        .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
        .set(auth(admin.accessToken))
        .send({}),
      request(app)
        .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
        .set(auth(admin.accessToken))
        .send({}),
    ]);
    const statuses = concurrentLinks.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = concurrentLinks.find((res) => res.status === 409);
    expect(conflict?.body.error.code).toBe("EVIDENCE_CONTROL_LINK_EXISTS");

    const concurrentUnlinks = await Promise.all([
      request(app)
        .post(
          `/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`,
        )
        .set(auth(admin.accessToken))
        .send({}),
      request(app)
        .post(
          `/api/v1/evidence/${evidence.id}/controls/${control.id}/unlink`,
        )
        .set(auth(admin.accessToken))
        .send({}),
    ]);
    const unlinkStatuses = concurrentUnlinks.map((res) => res.status).sort();
    expect(unlinkStatuses).toEqual([200, 404]);

    const rows = await prisma.evidenceControlLink.findMany({
      where: {
        tenantId: admin.user.activeCompany.id,
        evidenceId: evidence.id,
        controlId: control.id,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(false);
  });

  it("rejects invalid bodies and unknown UUIDs with safe codes", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const evidence = await createEvidence(admin.accessToken);
    const control = await createControl(admin.accessToken);
    const unknown = randomUUID();

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({ tenantId: admin.user.activeCompany.id })
      .expect(400);

    await request(app)
      .post(`/api/v1/evidence/not-a-uuid/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(400);

    await request(app)
      .post(`/api/v1/evidence/${unknown}/controls/${control.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_NOT_FOUND");
      });

    await request(app)
      .post(`/api/v1/evidence/${evidence.id}/controls/${unknown}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_NOT_FOUND");
      });
  });
});
