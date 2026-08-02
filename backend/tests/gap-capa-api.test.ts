import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { signAccessToken } from "../src/common/security/tokens.js";

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
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

describe("Gap and CAPA API", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let companyOneId: string;
  let readerToken: string;
  let writerToken: string;
  let companyTwoToken: string;

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

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    adminToken = admin.accessToken;
    adminUserId = admin.user.id;
    companyOneId = admin.user.activeCompany.id;
    const reader = await loginAs("user001@example.test", "User001!Secure");
    readerToken = reader.accessToken;
    writerToken = signAccessToken({
      sub: adminUserId,
      tenantId: companyOneId,
      permissions: ["gaps:read", "gaps:write", "capa:read", "capa:write"],
    });
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    if (!company2) throw new Error("COM-002 fixture is unavailable");
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ companyId: company2.id })
      .expect(200);
    companyTwoToken = switched.body.data.accessToken as string;
  });

  afterAll(async () => prisma.$disconnect());

  const createGap = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Privileged access review is not evidenced",
        description: "Quarterly privileged access review has no record.",
        severity: "MAJOR",
        source: "Internal Audit",
        dueDate: "2026-12-31",
        ...overrides,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      status: string;
      severity: string;
      overdue: boolean;
    };
  };

  const createCapa = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/capas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Introduce quarterly privileged access review",
        priority: "HIGH",
        rootCause: "The procedure never defined a review cadence.",
        dueDate: "2026-12-31",
        ...overrides,
      })
      .expect(201);
    return response.body.data as {
      id: string;
      code: string;
      status: string;
      completionPercentage: number;
      gap: { id: string; code: string } | null;
    };
  };

  const linkQualifyingEvidence = async (
    entity: "gaps" | "capas",
    entityId: string,
  ) => {
    const unique = randomUUID().replace(/-/g, "");
    const evidence = await prisma.evidence.create({
      data: {
        tenantId: companyOneId,
        code: `EVD-CLOSE-${unique.slice(0, 12)}`,
        title: "Synthetic approved closure Evidence",
        lifecycleStatus: "APPROVED",
        storageKey: `${companyOneId}/evidence/${unique}.pdf`,
        contentSha256: `${unique}${unique}`.slice(0, 64),
        byteSize: 128,
        createdById: adminUserId,
        updatedById: adminUserId,
      },
      select: { id: true },
    });
    await request(app)
      .post(`/api/v1/${entity}/${entityId}/evidence`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ evidenceId: evidence.id, linkReason: "Supports closure" })
      .expect(201);
    return evidence;
  };

  const waitForBlockedLifecycleQueries = async (
    table: "gaps" | "capas",
    lockClause: "FOR UPDATE" | "FOR SHARE",
    expectedCount: number,
  ) => {
    const deadline = Date.now() + 5_000;
    const queryPattern = `%FROM ${table}%${lockClause}%`;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ blockedCount: bigint }>>`
        SELECT count(*)::bigint AS "blockedCount"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND cardinality(pg_blocking_pids(pid)) > 0
          AND query ILIKE ${queryPattern}
      `;
      if (Number(rows[0]?.blockedCount ?? 0) >= expectedCount) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Expected ${expectedCount} blocked ${lockClause} queries for ${table}`,
    );
  };

  const serializeBehindExternalLock = async <TClose, TPatch>(input: {
    table: "gaps" | "capas";
    id: string;
    startClose: () => Promise<TClose>;
    startPatch: () => Promise<TPatch>;
    secondLockClause?: "FOR UPDATE" | "FOR SHARE";
  }): Promise<[TClose, TPatch]> => {
    const release = deferred();
    const locked = deferred();
    const holder = prisma
      .$transaction(
        async (tx) => {
          if (input.table === "gaps") {
            await tx.$queryRaw`
              SELECT id FROM gaps
              WHERE tenant_id = ${companyOneId}::uuid
                AND id = ${input.id}::uuid
                AND deleted_at IS NULL
              FOR UPDATE
            `;
          } else {
            await tx.$queryRaw`
              SELECT id FROM capas
              WHERE tenant_id = ${companyOneId}::uuid
                AND id = ${input.id}::uuid
                AND deleted_at IS NULL
              FOR UPDATE
            `;
          }
          locked.resolve();
          await release.promise;
        },
        { maxWait: 15_000, timeout: 20_000 },
      )
      .catch((error: unknown) => {
        locked.reject(error);
        throw error;
      });

    await locked.promise;
    let closePromise: Promise<TClose> | undefined;
    let patchPromise: Promise<TPatch> | undefined;
    let coordinationError: unknown;
    try {
      closePromise = input.startClose();
      await waitForBlockedLifecycleQueries(input.table, "FOR UPDATE", 1);
      patchPromise = input.startPatch();
      await waitForBlockedLifecycleQueries(
        input.table,
        input.secondLockClause ?? "FOR UPDATE",
        input.secondLockClause === undefined ? 2 : 1,
      );
    } catch (error) {
      coordinationError = error;
    } finally {
      release.resolve();
    }

    const pending: Promise<unknown>[] = [holder];
    if (closePromise) pending.push(closePromise);
    if (patchPromise) pending.push(patchPromise);
    const [holderResult] = await Promise.allSettled(pending);
    if (holderResult?.status === "rejected") throw holderResult.reason;
    if (coordinationError) throw coordinationError;
    if (!closePromise || !patchPromise) {
      throw new Error("Lifecycle race requests did not both start");
    }
    return Promise.all([closePromise, patchPromise]);
  };

  it("creates a gap with a server-generated code and derives company scope", async () => {
    const gap = await createGap(adminToken);
    expect(gap.code).toMatch(/^GAP-\d{3,}$/);
    expect(gap.status).toBe("OPEN");
    expect(gap.severity).toBe("MAJOR");

    const stored = await prisma.gap.findUniqueOrThrow({
      where: { id: gap.id },
      select: { tenantId: true },
    });
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    expect(stored.tenantId).toBe(company.id);
  });

  it("rejects a companyId supplied in the request body", async () => {
    const other = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    // The schema is strict, so an attempt to steer company scope from the
    // body is a validation failure rather than a silently ignored field.
    await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Attempted cross-company write",
        severity: "MINOR",
        companyId: other.id,
        tenantId: other.id,
      })
      .expect(400);
  });

  it("links a CAPA to its gap and exposes the link from both sides", async () => {
    const gap = await createGap(adminToken);
    const capa = await createCapa(adminToken, { gapId: gap.id });
    expect(capa.gap?.id).toBe(gap.id);

    const detail = await request(app)
      .get(`/api/v1/gaps/${gap.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (detail.body.data.capas as { code: string }[]).map((item) => item.code),
    ).toContain(capa.code);
  });

  it("refuses a CAPA linked to a gap in another company", async () => {
    const foreignGap = await createGap(companyTwoToken);
    const response = await request(app)
      .post("/api/v1/capas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Cross-company CAPA",
        priority: "LOW",
        gapId: foreignGap.id,
      })
      .expect(400);
    expect(response.body.error.code).toBe("RELATED_RECORD_INVALID");
    expect(response.body.error.details.fields).toContain("gapId");
  });

  it("prevents an open CAPA from being created, relinked, or reopened against a closed Gap", async () => {
    const gap = await createGap(adminToken);
    const linkedCapa = await createCapa(adminToken, { gapId: gap.id });
    const cancelledCapa = await createCapa(adminToken, { gapId: gap.id });
    await request(app)
      .patch(`/api/v1/capas/${cancelledCapa.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CANCELLED" })
      .expect(200);
    await linkQualifyingEvidence("capas", linkedCapa.id);
    await request(app)
      .post(`/api/v1/capas/${linkedCapa.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "The linked corrective action is fully verified." })
      .expect(200);
    await linkQualifyingEvidence("gaps", gap.id);
    await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "All linked corrective actions are now complete." })
      .expect(200);

    const createResponse = await request(app)
      .post("/api/v1/capas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Must not attach to a closed Gap",
        priority: "LOW",
        gapId: gap.id,
      })
      .expect(409);
    expect(createResponse.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const unlinkedCapa = await createCapa(adminToken);
    const relinkResponse = await request(app)
      .patch(`/api/v1/capas/${unlinkedCapa.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ gapId: gap.id })
      .expect(409);
    expect(relinkResponse.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const reopenResponse = await request(app)
      .post(`/api/v1/capas/${linkedCapa.id}/reopen`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "A closed parent Gap cannot accept reopened work." })
      .expect(409);
    expect(reopenResponse.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const reactivateResponse = await request(app)
      .patch(`/api/v1/capas/${cancelledCapa.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OPEN" })
      .expect(409);
    expect(reactivateResponse.body.error.code).toBe(
      "INVALID_STATUS_TRANSITION",
    );

    const [persistedLinked, persistedCancelled, persistedUnlinked] =
      await Promise.all([
        prisma.capa.findUniqueOrThrow({
          where: { id: linkedCapa.id },
          select: { gapId: true, status: true, completionPercentage: true },
        }),
        prisma.capa.findUniqueOrThrow({
          where: { id: cancelledCapa.id },
          select: { gapId: true, status: true },
        }),
        prisma.capa.findUniqueOrThrow({
          where: { id: unlinkedCapa.id },
          select: { gapId: true, status: true },
        }),
      ]);
    expect(persistedLinked).toEqual({
      gapId: gap.id,
      status: "CLOSED",
      completionPercentage: 100,
    });
    expect(persistedCancelled).toEqual({
      gapId: gap.id,
      status: "CANCELLED",
    });
    expect(persistedUnlinked).toEqual({ gapId: null, status: "OPEN" });
  });

  it("refuses an owner who is not a member of the company", async () => {
    const outsider = await prisma.user.findFirstOrThrow({
      where: { memberships: { none: { tenant: { code: "COM-001" } } } },
      select: { id: true },
    });
    const response = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Gap with an outside owner",
        severity: "MINOR",
        ownerId: outsider.id,
      })
      .expect(400);
    expect(response.body.error.details.fields).toContain("ownerId");
  });

  it("does not expose another company's gap", async () => {
    const foreignGap = await createGap(companyTwoToken);
    await request(app)
      .get(`/api/v1/gaps/${foreignGap.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    const list = await request(app)
      .get("/api/v1/gaps?pageSize=100")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (list.body.data as { id: string }[]).some(
        (item) => item.id === foreignGap.id,
      ),
    ).toBe(false);
  });

  it("requires gaps:close to close a gap", async () => {
    const gap = await createGap(adminToken);
    // The reader fixture holds gaps:read but neither gaps:write nor gaps:close.
    await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${readerToken}`)
      .send({ closureNote: "Reader should not be able to close this gap." })
      .expect(403);
    await request(app)
      .get(`/api/v1/gaps/${gap.id}`)
      .set("Authorization", `Bearer ${readerToken}`)
      .expect(200);
  });

  it("requires a substantive closure note", async () => {
    const gap = await createGap(adminToken);
    const response = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "done" })
      .expect(422);
    expect(response.body.error.code).toBe("CLOSURE_NOTE_REQUIRED");
  });

  it("requires qualifying approved Evidence to close a gap", async () => {
    const gap = await createGap(adminToken);
    const noLink = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Remediation is complete and ready for closure." })
      .expect(409);
    expect(noLink.body.error).toMatchObject({
      code: "EVIDENCE_REQUIRED",
      details: { reason: "EVIDENCE_GAP_LINK_REQUIRED" },
    });

    const metadataOnly = await prisma.evidence.create({
      data: {
        tenantId: companyOneId,
        code: `EVD-METADATA-${randomUUID().slice(0, 8)}`,
        title: "Workbook reference without a held file",
        lifecycleStatus: "DRAFT",
        sourceFileReference: "/client/reference-only.pdf",
        createdById: adminUserId,
        updatedById: adminUserId,
      },
      select: { id: true },
    });
    await request(app)
      .post(`/api/v1/gaps/${gap.id}/evidence`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ evidenceId: metadataOnly.id })
      .expect(201);
    const incomplete = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Remediation is complete and ready for closure." })
      .expect(409);
    expect(incomplete.body.error).toMatchObject({
      code: "EVIDENCE_REQUIRED",
      details: { reason: "EVIDENCE_GAP_COVERAGE_INCOMPLETE" },
    });
  });

  it("requires qualifying approved Evidence to close a CAPA", async () => {
    const capa = await createCapa(adminToken);
    const response = await request(app)
      .post(`/api/v1/capas/${capa.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Corrective action is complete and verified." })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: "EVIDENCE_REQUIRED",
      details: { reason: "EVIDENCE_CAPA_LINK_REQUIRED" },
    });
  });

  it("will not close a gap while a linked CAPA is still open", async () => {
    const gap = await createGap(adminToken);
    const capa = await createCapa(adminToken, { gapId: gap.id });

    const blocked = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        closureNote: "Closing the finding after remediation was verified.",
      })
      .expect(409);
    expect(blocked.body.error.code).toBe("GAP_HAS_OPEN_CAPA");
    expect(blocked.body.error.details.openCapas).toContain(capa.code);

    await linkQualifyingEvidence("capas", capa.id);
    await request(app)
      .post(`/api/v1/capas/${capa.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Quarterly review scheduled and first run held." })
      .expect(200);

    await linkQualifyingEvidence("gaps", gap.id);
    const closed = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        closureNote: "Closing the finding after remediation was verified.",
      })
      .expect(200);
    expect(closed.body.data.status).toBe("CLOSED");
    expect(closed.body.data.closedAt).not.toBeNull();
  });

  it("drives a closed CAPA to full completion", async () => {
    const capa = await createCapa(adminToken, { completionPercentage: 40 });
    await linkQualifyingEvidence("capas", capa.id);
    const closed = await request(app)
      .post(`/api/v1/capas/${capa.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Action completed and verified by the reviewer." })
      .expect(200);
    expect(closed.body.data.completionPercentage).toBe(100);
    expect(closed.body.data.status).toBe("CLOSED");
  });

  it("rejects a completion percentage outside 0-100", async () => {
    await request(app)
      .post("/api/v1/capas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Impossible progress",
        priority: "LOW",
        completionPercentage: 140,
      })
      .expect(400);
  });

  it("refuses to move a closed gap straight back to closed", async () => {
    const gap = await createGap(adminToken);
    await linkQualifyingEvidence("gaps", gap.id);
    await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Remediated and evidenced by the control owner." })
      .expect(200);
    const again = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Attempting to close an already closed gap." })
      .expect(409);
    expect(again.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("reopens a closed gap into IN_PROGRESS", async () => {
    const gap = await createGap(adminToken);
    await linkQualifyingEvidence("gaps", gap.id);
    await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Closed after the corrective action landed." })
      .expect(200);
    const reopened = await request(app)
      .post(`/api/v1/gaps/${gap.id}/reopen`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "The evidence did not cover the whole period." })
      .expect(200);
    expect(reopened.body.data.status).toBe("IN_PROGRESS");
    expect(reopened.body.data.closedAt).toBeNull();
    expect(reopened.body.data.closureNote).toBeNull();
  });

  it("routes every closed-record reopen through the protected action", async () => {
    const gap = await createGap(adminToken);
    await linkQualifyingEvidence("gaps", gap.id);
    const closedGap = await request(app)
      .post(`/api/v1/gaps/${gap.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ closureNote: "Closed after the remediation was evidenced." })
      .expect(200);

    await request(app)
      .post(`/api/v1/gaps/${gap.id}/reopen`)
      .set("Authorization", `Bearer ${writerToken}`)
      .send({ reason: "Writer must not hold reopen authority." })
      .expect(403);
    const gapPatch = await request(app)
      .patch(`/api/v1/gaps/${gap.id}`)
      .set("Authorization", `Bearer ${writerToken}`)
      .send({ title: "A closed Gap cannot be edited through generic PATCH" })
      .expect(409);
    expect(gapPatch.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const persistedGap = await request(app)
      .get(`/api/v1/gaps/${gap.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(persistedGap.body.data).toMatchObject({
      status: "CLOSED",
      closedAt: closedGap.body.data.closedAt,
      closureNote: closedGap.body.data.closureNote,
    });

    const capa = await createCapa(adminToken);
    await linkQualifyingEvidence("capas", capa.id);
    const closedCapa = await request(app)
      .post(`/api/v1/capas/${capa.id}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        closureNote: "Closed after the corrective action was evidenced.",
      })
      .expect(200);

    await request(app)
      .post(`/api/v1/capas/${capa.id}/reopen`)
      .set("Authorization", `Bearer ${writerToken}`)
      .send({ reason: "Writer must not hold reopen authority." })
      .expect(403);
    const capaPatch = await request(app)
      .patch(`/api/v1/capas/${capa.id}`)
      .set("Authorization", `Bearer ${writerToken}`)
      .send({ completionPercentage: 40 })
      .expect(409);
    expect(capaPatch.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const persistedCapa = await request(app)
      .get(`/api/v1/capas/${capa.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(persistedCapa.body.data).toMatchObject({
      status: "CLOSED",
      closedAt: closedCapa.body.data.closedAt,
      closureNote: closedCapa.body.data.closureNote,
      completionPercentage: 100,
    });
  });

  it("serializes Gap closure ahead of a concurrent write-only status patch", async () => {
    const gap = await createGap(adminToken);
    await linkQualifyingEvidence("gaps", gap.id);
    const closureNote = "Concurrent closure preserves the authorised sign-off.";
    const beforeUpdateAudits = await prisma.auditEvent.count({
      where: { entityType: "GAP", entityId: gap.id, action: "GAP_UPDATED" },
    });

    const [closed, patch] = await serializeBehindExternalLock({
      table: "gaps",
      id: gap.id,
      startClose: () =>
        request(app)
          .post(`/api/v1/gaps/${gap.id}/close`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ closureNote })
          .then((response) => response),
      startPatch: () =>
        request(app)
          .patch(`/api/v1/gaps/${gap.id}`)
          .set("Authorization", `Bearer ${writerToken}`)
          .send({ title: "Concurrent write must not alter a closed Gap" })
          .then((response) => response),
    });

    expect(closed.status).toBe(200);
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    const persisted = await prisma.gap.findUniqueOrThrow({
      where: { id: gap.id },
      select: { status: true, closedAt: true, closureNote: true },
    });
    expect(persisted).toMatchObject({
      status: "CLOSED",
      closureNote,
    });
    expect(persisted.closedAt).not.toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { entityType: "GAP", entityId: gap.id, action: "GAP_UPDATED" },
      }),
    ).toBe(beforeUpdateAudits);
  });

  it("serializes Gap closure ahead of concurrent CAPA creation", async () => {
    const gap = await createGap(adminToken);
    await linkQualifyingEvidence("gaps", gap.id);
    const closureNote = "Concurrent closure prevents new corrective work.";

    const [closed, create] = await serializeBehindExternalLock({
      table: "gaps",
      id: gap.id,
      secondLockClause: "FOR SHARE",
      startClose: () =>
        request(app)
          .post(`/api/v1/gaps/${gap.id}/close`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ closureNote })
          .then((response) => response),
      startPatch: () =>
        request(app)
          .post("/api/v1/capas")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            title: "Concurrent CAPA must not attach after closure",
            priority: "HIGH",
            gapId: gap.id,
          })
          .then((response) => response),
    });

    expect(closed.status).toBe(200);
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(
      await prisma.capa.count({
        where: { tenantId: companyOneId, gapId: gap.id, deletedAt: null },
      }),
    ).toBe(0);
    const persisted = await prisma.gap.findUniqueOrThrow({
      where: { id: gap.id },
      select: { status: true, closureNote: true },
    });
    expect(persisted).toEqual({ status: "CLOSED", closureNote });
  });

  it("serializes CAPA closure ahead of a concurrent write-only status patch", async () => {
    const capa = await createCapa(adminToken, { completionPercentage: 35 });
    await linkQualifyingEvidence("capas", capa.id);
    const closureNote =
      "Concurrent closure preserves the authorised CAPA sign-off.";
    const beforeUpdateAudits = await prisma.auditEvent.count({
      where: { entityType: "CAPA", entityId: capa.id, action: "CAPA_UPDATED" },
    });

    const [closed, patch] = await serializeBehindExternalLock({
      table: "capas",
      id: capa.id,
      startClose: () =>
        request(app)
          .post(`/api/v1/capas/${capa.id}/close`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ closureNote })
          .then((response) => response),
      startPatch: () =>
        request(app)
          .patch(`/api/v1/capas/${capa.id}`)
          .set("Authorization", `Bearer ${writerToken}`)
          .send({ completionPercentage: 40 })
          .then((response) => response),
    });

    expect(closed.status).toBe(200);
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    const persisted = await prisma.capa.findUniqueOrThrow({
      where: { id: capa.id },
      select: {
        status: true,
        closedAt: true,
        closureNote: true,
        completionPercentage: true,
      },
    });
    expect(persisted).toMatchObject({
      status: "CLOSED",
      closureNote,
      completionPercentage: 100,
    });
    expect(persisted.closedAt).not.toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: {
          entityType: "CAPA",
          entityId: capa.id,
          action: "CAPA_UPDATED",
        },
      }),
    ).toBe(beforeUpdateAudits);
  });

  it("routes closure through the close endpoint, not a status patch", async () => {
    const gap = await createGap(adminToken);
    await request(app)
      .patch(`/api/v1/gaps/${gap.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CLOSED" })
      .expect(400);
  });

  it("links Evidence to a gap and never claims a missing file is present", async () => {
    const gap = await createGap(adminToken);
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const evidence = await prisma.evidence.create({
      data: {
        tenantId: company.id,
        code: `EVD-GAPLINK-${Date.now()}`,
        title: "Imported access review register",
        // Metadata only: a workbook path, with no stored file.
        sourceFileReference: "/evidence/access-review-2026.pdf",
        createdById: adminUserId,
        updatedById: adminUserId,
      },
      select: { id: true },
    });
    const linked = await request(app)
      .post(`/api/v1/gaps/${gap.id}/evidence`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ evidenceId: evidence.id, linkReason: "Supports the finding" })
      .expect(201);
    const entry = (
      linked.body.data.evidence as {
        id: string;
        file: { available: boolean; sourceReference: string | null };
      }[]
    ).find((item) => item.id === evidence.id);
    expect(entry).toBeDefined();
    expect(entry!.file.available).toBe(false);
    expect(entry!.file.sourceReference).toBe(
      "/evidence/access-review-2026.pdf",
    );

    await request(app)
      .delete(`/api/v1/gaps/${gap.id}/evidence/${evidence.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
  });

  it("refuses Evidence from another company", async () => {
    const gap = await createGap(adminToken);
    const otherCompany = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const foreignEvidence = await prisma.evidence.create({
      data: {
        tenantId: otherCompany.id,
        code: `EVD-FOREIGN-${Date.now()}`,
        title: "Another company's evidence",
        createdById: adminUserId,
        updatedById: adminUserId,
      },
      select: { id: true },
    });
    const response = await request(app)
      .post(`/api/v1/gaps/${gap.id}/evidence`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ evidenceId: foreignEvidence.id })
      .expect(400);
    expect(response.body.error.details.fields).toContain("evidenceId");
  });

  it("writes an append-only audit event for each lifecycle step", async () => {
    const gap = await createGap(adminToken);
    await request(app)
      .patch(`/api/v1/gaps/${gap.id}/owner`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ownerId: adminUserId })
      .expect(200);
    const events = await prisma.auditEvent.findMany({
      where: { entityType: "GAP", entityId: gap.id },
      select: { action: true, source: true },
    });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["GAP_CREATED", "GAP_OWNER_ASSIGNED"]),
    );
    // Platform activity is SYSTEM; only replayed workbook history is IMPORT.
    expect(events.every((event) => event.source === "SYSTEM")).toBe(true);
  });

  it("computes overdue in the backend rather than trusting stored state", async () => {
    const overdue = await createGap(adminToken, { dueDate: "2020-01-01" });
    expect(overdue.overdue).toBe(true);
    const future = await createGap(adminToken, { dueDate: "2099-01-01" });
    expect(future.overdue).toBe(false);

    const filtered = await request(app)
      .get("/api/v1/gaps?overdue=true&pageSize=100")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const ids = (filtered.body.data as { id: string }[]).map((item) => item.id);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(future.id);
  });
});
