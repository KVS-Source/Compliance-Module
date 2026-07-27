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

describe("Risk review, treatment and closure Slice E", () => {
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

  /**
   * Creates a standalone risk directly. Slice E adds no risk-create route and
   * must not change automatic creation, so fixtures are built in the database.
   */
  const seedRisk = async (
    tenantId: string,
    actorUserId: string,
    overrides: Record<string, unknown> = {},
  ) =>
    prisma.risk.create({
      data: {
        tenantId,
        code: `RSK-E-${randomUUID().slice(0, 8)}`,
        title: "Synthetic Slice E risk",
        description: "Fixture risk for review and treatment tests",
        inherentLikelihood: 4,
        inherentImpact: 4,
        inherentScore: 16,
        kpiRiskClass: "MAJOR",
        generalLevel: "HIGH",
        status: "OPEN",
        createdById: actorUserId,
        updatedById: actorUserId,
        ...overrides,
      },
    });

  it("seeds risk:treat and risk:close for Company Admin and excludes Company User", async () => {
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const admin = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: company.id, code: "COMPANY_ADMIN" } },
      include: { permissions: { include: { permission: true } } },
    });
    const user = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: company.id, code: "COMPANY_USER" } },
      include: { permissions: { include: { permission: true } } },
    });
    const codesOf = (role: typeof admin) =>
      role.permissions.map((entry) => entry.permission.code);

    expect(codesOf(admin)).toEqual(
      expect.arrayContaining(["risk:treat", "risk:close"]),
    );
    expect(codesOf(user)).not.toContain("risk:treat");
    expect(codesOf(user)).not.toContain("risk:close");
  });

  it("records a review, computes the residual score and moves to UNDER_REVIEW", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    const response = await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        comments: "Reassessed after the corrective action.",
        likelihoodAtReview: 2,
        impactAtReview: 4,
      })
      .expect(201);

    // 2 x 4 = 8, which lands in the MEDIUM band.
    expect(response.body.data).toMatchObject({
      status: "UNDER_REVIEW",
      residualLikelihood: 2,
      residualImpact: 4,
      residualScore: 8,
      generalLevel: "MEDIUM",
    });
    expect(response.body.data.reviews).toHaveLength(1);
    expect(response.body.data.reviews[0]).toMatchObject({
      reviewer: { id: admin.user.id },
      comments: "Reassessed after the corrective action.",
      likelihoodAtReview: 2,
      impactAtReview: 4,
    });
    expect(response.body.data).not.toHaveProperty("tenantId");

    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: risk.id, action: "RISK_REVIEWED" },
    });
    expect(audit).toBeTruthy();
  });

  it("keeps a review without a revised assessment from touching the residual", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    const response = await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ comments: "Noted, no reassessment yet." })
      .expect(201);

    expect(response.body.data).toMatchObject({
      status: "UNDER_REVIEW",
      residualLikelihood: null,
      residualImpact: null,
      residualScore: null,
      generalLevel: "HIGH",
    });
  });

  it("rejects a half-supplied revised assessment", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    const response = await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ comments: "Partial", likelihoodAtReview: 3 })
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("records a treatment and completes it by appending a superseding row", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    const treated = await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        strategy: "MITIGATE",
        plan: "Introduce a second reviewer on the survey process.",
        ownerId: admin.user.id,
        dueDate: "2026-09-30",
      })
      .expect(201);

    expect(treated.body.data).toMatchObject({
      status: "TREATED",
      treatmentStrategy: "MITIGATE",
    });
    expect(treated.body.data.treatments).toHaveLength(1);
    const original = treated.body.data.treatments[0];
    expect(original).toMatchObject({
      strategy: "MITIGATE",
      status: "PLANNED",
      dueDate: "2026-09-30",
      supersedesId: null,
      owner: { id: admin.user.id },
    });

    const completed = await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments/${original.id}/complete`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ effectivenessNotes: "Second reviewer in place since August." })
      .expect(201);

    // Completion is a new entry, never an edit of the original.
    expect(completed.body.data.treatments).toHaveLength(2);
    const [first, second] = completed.body.data.treatments;
    expect(first).toMatchObject({ id: original.id, status: "PLANNED" });
    expect(second).toMatchObject({
      status: "COMPLETED",
      supersedesId: original.id,
      effectivenessNotes: "Second reviewer in place since August.",
    });
    expect(second.completedAt).toBeTruthy();

    // Completing the same entry twice is refused.
    await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments/${original.id}/complete`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409);
  });

  it("enforces append-only reviews and treatments at the database", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ comments: "Immutability check" })
      .expect(201);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ strategy: "ACCEPT", plan: "Accept within appetite." })
      .expect(201);

    const review = await prisma.riskReview.findFirstOrThrow({
      where: { riskId: risk.id },
    });
    const treatment = await prisma.riskTreatment.findFirstOrThrow({
      where: { riskId: risk.id },
    });

    await expect(
      prisma.riskReview.update({
        where: { id: review.id },
        data: { comments: "Rewritten" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.riskReview.delete({ where: { id: review.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.riskTreatment.update({
        where: { id: treatment.id },
        data: { plan: "Rewritten" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.riskTreatment.delete({ where: { id: treatment.id } }),
    ).rejects.toThrow();
  });

  it("enforces the residual score equality and all-or-none check", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    await expect(
      prisma.risk.update({
        where: { id: risk.id },
        data: { residualLikelihood: 2, residualImpact: 3, residualScore: 7 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.risk.update({
        where: { id: risk.id },
        data: { residualLikelihood: 2, residualImpact: null, residualScore: null },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.risk.update({
        where: { id: risk.id },
        data: { residualLikelihood: 2, residualImpact: 3, residualScore: 6 },
      }),
    ).resolves.toBeTruthy();
  });

  it("requires a reason to close and records a closure audit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "   " })
      .expect(400);

    const closed = await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "Mitigated and verified by the compliance team." })
      .expect(200);
    expect(closed.body.data).toMatchObject({
      status: "CLOSED",
      closureReason: "Mitigated and verified by the compliance team.",
    });
    expect(closed.body.data.closedAt).toBeTruthy();

    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: risk.id, action: "RISK_CLOSED" },
    });
    expect(audit).toBeTruthy();

    // A closed risk accepts no further decisions until it is reopened.
    await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ comments: "Late note" })
      .expect(409);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "Again" })
      .expect(409);
  });

  it("reopens a closed risk back to UNDER_REVIEW with an audit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id, {
      status: "CLOSED",
      closedAt: new Date(),
      closureReason: "Closed for the reopen test",
    });

    const reopened = await request(app)
      .post(`/api/v1/risks/${risk.id}/reopen`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "New evidence contradicts the closure." })
      .expect(200);
    expect(reopened.body.data).toMatchObject({
      status: "UNDER_REVIEW",
      closedAt: null,
      closureReason: null,
    });

    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: risk.id, action: "RISK_REOPENED" },
    });
    expect(audit).toBeTruthy();

    // Reopening something that is not closed is refused.
    await request(app)
      .post(`/api/v1/risks/${risk.id}/reopen`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "Again" })
      .expect(409);
  });

  /**
   * The conflicting state is not reachable through the API: risk creation
   * happens once per KPI actual inside the submission transaction, and a later
   * submission creates a new actual row with a new id. It is reachable by
   * direct database writes and would become reachable through a future manual
   * risk workflow, so the guard is proved here rather than assumed.
   */
  it("refuses a reopen that would breach risks_one_active_per_kpi_actual", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;

    const actual = await prisma.kpiActual.findFirst({
      where: { tenantId, deletedAt: null },
      select: { id: true, kpiConfigurationId: true, kpiTargetId: true },
    });
    if (!actual) {
      throw new Error("Fixture requires at least one KPI actual in COM-001");
    }
    const lineage = {
      kpiActualId: actual.id,
      kpiConfigurationId: actual.kpiConfigurationId,
      kpiTargetId: actual.kpiTargetId,
    };

    // Any pre-existing live risk for this actual would block the fixture.
    await prisma.risk.updateMany({
      where: {
        tenantId,
        kpiActualId: actual.id,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
        deletedAt: null,
      },
      data: { status: "CLOSED", closedAt: new Date(), closureReason: "Fixture" },
    });

    const closedRisk = await seedRisk(tenantId, admin.user.id, {
      ...lineage,
      status: "CLOSED",
      closedAt: new Date(),
      closureReason: "Closed before the sibling was raised",
    });
    // Permitted only because the first risk is CLOSED.
    const liveSibling = await seedRisk(tenantId, admin.user.id, {
      ...lineage,
      status: "OPEN",
    });

    const response = await request(app)
      .post(`/api/v1/risks/${closedRisk.id}/reopen`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "Attempting to reopen despite a live sibling." })
      .expect(409);

    expect(response.body.error.code).toBe("RISK_ACTIVE_DUPLICATE_FOR_ACTUAL");
    expect(response.body.error.message).toContain(liveSibling.code);

    // The refused reopen wrote nothing.
    const unchanged = await prisma.risk.findUniqueOrThrow({
      where: { id: closedRisk.id },
    });
    expect(unchanged.status).toBe("CLOSED");
    expect(
      await prisma.auditEvent.count({
        where: { entityId: closedRisk.id, action: "RISK_REOPENED" },
      }),
    ).toBe(0);
  });

  it("assigns and clears the risk owner", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);

    const assigned = await request(app)
      .patch(`/api/v1/risks/${risk.id}/owner`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ ownerId: admin.user.id })
      .expect(200);
    expect(assigned.body.data.owner).toMatchObject({ id: admin.user.id });

    const cleared = await request(app)
      .patch(`/api/v1/risks/${risk.id}/owner`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ ownerId: null })
      .expect(200);
    expect(cleared.body.data.owner).toBeNull();

    expect(
      await prisma.auditEvent.count({
        where: { entityId: risk.id, action: "RISK_OWNER_ASSIGNED" },
      }),
    ).toBe(2);
  });

  it("refuses an owner or reviewer from another Company", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const tenantId = admin.user.activeCompany.id;
    const risk = await seedRisk(tenantId, admin.user.id);

    const outsider = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        memberships: { none: { tenantId, status: "ACTIVE" } },
      },
      select: { id: true },
    });
    if (!outsider) return;

    const response = await request(app)
      .patch(`/api/v1/risks/${risk.id}/owner`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ ownerId: outsider.id })
      .expect(400);
    expect(response.body.error.code).toBe("RELATED_RECORD_INVALID");

    // The database trigger is the backstop if the service check is bypassed.
    await expect(
      prisma.riskTreatment.create({
        data: {
          tenantId,
          riskId: risk.id,
          strategy: "MITIGATE",
          plan: "Cross-tenant owner attempt",
          ownerId: outsider.id,
          recordedById: admin.user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("prevents cross-tenant review, treatment, closure and reopen", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const company2 = admin.user.companies.find(
      (company) => company.code === "COM-002",
    );
    expect(company2).toBeTruthy();
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);
    const closed = await seedRisk(admin.user.activeCompany.id, admin.user.id, {
      status: "CLOSED",
      closedAt: new Date(),
      closureReason: "Closed in Company 001",
    });

    const company2Token = await switchCompany(admin.accessToken, company2!.id);
    const auth = { Authorization: `Bearer ${company2Token}` };

    await request(app)
      .get(`/api/v1/risks/${risk.id}`)
      .set(auth)
      .expect(404);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set(auth)
      .send({ comments: "Cross-tenant" })
      .expect(404);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments`)
      .set(auth)
      .send({ strategy: "ACCEPT", plan: "Cross-tenant" })
      .expect(404);
    await request(app)
      .patch(`/api/v1/risks/${risk.id}/owner`)
      .set(auth)
      .send({ ownerId: admin.user.id })
      .expect(404);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .set(auth)
      .send({ reason: "Cross-tenant" })
      .expect(404);
    await request(app)
      .post(`/api/v1/risks/${closed.id}/reopen`)
      .set(auth)
      .send({ reason: "Cross-tenant" })
      .expect(404);

    // Nothing leaked into the other Company.
    expect(
      await prisma.riskReview.count({ where: { riskId: risk.id } }),
    ).toBe(0);
    expect(
      await prisma.riskTreatment.count({ where: { riskId: risk.id } }),
    ).toBe(0);
  });

  it("requires risk:treat and risk:close and rejects anonymous callers", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const risk = await seedRisk(admin.user.activeCompany.id, admin.user.id);
    const reader = await loginAs("user001@example.test", "User001!Secure");
    expect(reader.user.permissions).not.toContain("risk:treat");
    expect(reader.user.permissions).not.toContain("risk:close");

    const readerAuth = { Authorization: `Bearer ${reader.accessToken}` };
    await request(app)
      .post(`/api/v1/risks/${risk.id}/reviews`)
      .set(readerAuth)
      .send({ comments: "Denied" })
      .expect(403);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/treatments`)
      .set(readerAuth)
      .send({ strategy: "ACCEPT", plan: "Denied" })
      .expect(403);
    await request(app)
      .patch(`/api/v1/risks/${risk.id}/owner`)
      .set(readerAuth)
      .send({ ownerId: reader.user.id })
      .expect(403);
    await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .set(readerAuth)
      .send({ reason: "Denied" })
      .expect(403);

    await request(app)
      .post(`/api/v1/risks/${risk.id}/close`)
      .send({ reason: "Anonymous" })
      .expect(401);
  });
});
