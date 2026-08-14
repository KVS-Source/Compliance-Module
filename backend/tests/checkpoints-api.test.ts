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

describe("Checkpoint API Slice 4", () => {
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

  const createControl = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app)
      .post("/api/v1/controls")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: `Control for Checkpoint ${randomUUID()}`,
        objective: "Synthetic Control for Checkpoint API tests",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Review synthetic evidence",
        ...overrides,
      })
      .expect(201);
    return response.body.data as { id: string; code: string };
  };

  const checkpointBody = (
    controlId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    controlId,
    title: `Checkpoint ${randomUUID()}`,
    expectedResult: "Synthetic expected result remains true",
    verificationFrequency: "MONTHLY",
    ...overrides,
  });

  const reviewBody = (overrides: Record<string, unknown> = {}) => ({
    reviewPeriod: "2026-07",
    reviewDate: "2026-07-15",
    outcome: "PASS",
    observation: "Synthetic observation",
    recommendation: "Continue monitoring",
    nextReviewDate: "2026-08-15",
    ...overrides,
  });

  it("creates a Checkpoint with server-generated code and ACTIVE lifecycle", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const response = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);

    expect(response.body.data.code).toMatch(/^CHK-/);
    expect(response.body.data.lifecycleStatus).toBe("ACTIVE");
    expect(response.body.data.control.id).toBe(control.id);
    expect(response.body.data.totalReviewCount).toBe(0);
    expect(response.body.data.latestReview).toBeNull();

    const stored = await prisma.checkpoint.findFirstOrThrow({
      where: { id: response.body.data.id },
    });
    expect(stored.code).toBe(response.body.data.code);
    expect(stored.lifecycleStatus).toBe("ACTIVE");
    expect(stored.controlId).toBe(control.id);
  });

  it("allocates distinct Checkpoint codes under concurrency", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/checkpoints")
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send(
            checkpointBody(control.id, {
              title: `Concurrent ${randomUUID()}`,
            }),
          ),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const codes = results.map((result) => result.body.data.code as string);
    expect(new Set(codes).size).toBe(5);
  });

  it("enforces tenant isolation with safe 404 for cross-tenant IDs", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
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
      .get(`/api/v1/checkpoints/${created.body.data.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_NOT_FOUND");
      });
  });

  it("enforces checkpoints:write and checkpoints:review permissions", async () => {
    const user = await loginAs("user001@example.test", "User001!Secure");
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);

    await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(403);

    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);

    await request(app)
      .post(`/api/v1/checkpoints/${created.body.data.id}/reviews`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(reviewBody())
      .expect(403);

    await request(app)
      .get(`/api/v1/checkpoints/${created.body.data.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);
  });

  it("allows creation under INACTIVE Control and rejects ARCHIVED Control", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const inactive = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/controls/${inactive.id}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    const underInactive = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(inactive.id))
      .expect(201);
    expect(underInactive.body.data.lifecycleStatus).toBe("ACTIVE");
    expect(underInactive.body.data.control.lifecycleStatus).toBe("INACTIVE");

    const archived = await createControl(admin.accessToken);
    await request(app)
      .post(`/api/v1/controls/${archived.id}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(archived.id))
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe(
          "CHECKPOINT_PARENT_CONTROL_ARCHIVED",
        );
      });
  });

  it("updates fields, skips no-op audit, freezes frequency and initialReviewDate after Review", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        checkpointBody(control.id, {
          initialReviewDate: "2026-07-01",
          verificationFrequency: "MONTHLY",
        }),
      )
      .expect(201);
    const checkpointId = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        title: "Updated Checkpoint Title",
        verificationFrequency: "QUARTERLY",
        initialReviewDate: "2026-08-01",
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.data.verificationFrequency).toBe("QUARTERLY");
        expect(res.body.data.initialReviewDate).toBe("2026-08-01");
      });

    const beforeNoOp = await prisma.auditEvent.count({
      where: { entityType: "CHECKPOINT", entityId: checkpointId },
    });
    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ title: "Updated Checkpoint Title" })
      .expect(200);
    const afterNoOp = await prisma.auditEvent.count({
      where: { entityType: "CHECKPOINT", entityId: checkpointId },
    });
    expect(afterNoOp).toBe(beforeNoOp);

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ controlId: control.id })
      .expect(400);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        reviewBody({
          reviewPeriod: "2026-Q3",
          reviewDate: "2026-08-15",
          nextReviewDate: "2026-11-15",
        }),
      )
      .expect(201);

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ verificationFrequency: "MONTHLY" })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_INVALID_STATE");
      });

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ initialReviewDate: "2026-09-01" })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_INVALID_STATE");
      });

    // Unchanged frequency after Review remains a no-op.
    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ verificationFrequency: "QUARTERLY" })
      .expect(200);
  });

  it("enforces lifecycle transitions, same-state 409 and archived immutability", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_INVALID_STATE");
      });

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200)
      .expect((res) => {
        expect(res.body.data.lifecycleStatus).toBe("INACTIVE");
      });

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200)
      .expect((res) => {
        expect(res.body.data.lifecycleStatus).toBe("ACTIVE");
      });

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    const stored = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
    });
    expect(stored.lifecycleStatus).toBe("ARCHIVED");
    expect(stored.archivedAt).not.toBeNull();

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ title: "Should fail" })
      .expect(409);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(reviewBody())
      .expect(409);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409);
  });

  it("blocks Control archive while ACTIVE Checkpoint and allows after INACTIVE", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);

    await request(app)
      .post(`/api/v1/controls/${control.id}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CONTROL_HAS_ACTIVE_CHECKPOINTS");
      });

    await request(app)
      .post(`/api/v1/checkpoints/${created.body.data.id}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/controls/${control.id}/archive`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/checkpoints/${created.body.data.id}/activate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe(
          "CHECKPOINT_PARENT_CONTROL_ARCHIVED",
        );
      });
  });

  it("creates Reviews with actor attribution, rejects inactive/archived and duplicates", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    const first = await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(reviewBody({ reviewPeriod: "2026-07" }))
      .expect(201);
    expect(first.body.data.reviewer.id).toBe(admin.user.id);

    const stored = await prisma.checkpointReview.findFirstOrThrow({
      where: { id: first.body.data.id },
    });
    expect(stored.reviewerId).toBe(admin.user.id);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(reviewBody({ reviewPeriod: "2026-07" }))
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_REVIEW_DUPLICATE");
      });

    const second = await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        reviewBody({
          reviewPeriod: "2026-08",
          reviewDate: "2026-08-15",
          nextReviewDate: "2026-09-15",
        }),
      )
      .expect(201);

    const latest = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/latest-review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(latest.body.data.id).toBe(second.body.data.id);
    expect(latest.body.data.observation).toBeTruthy();

    const history = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .query({ page: 1, pageSize: 20 })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0].id).toBe(second.body.data.id);
    expect(history.body.data[0].observation).toBeTruthy();

    await request(app)
      .patch(`/api/v1/checkpoints/${checkpointId}/reviews/${first.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ outcome: "FAIL" })
      .expect(404);

    await request(app)
      .delete(
        `/api/v1/checkpoints/${checkpointId}/reviews/${first.body.data.id}`,
      )
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        reviewBody({
          reviewPeriod: "2026-09",
          reviewDate: "2026-09-15",
          nextReviewDate: "2026-10-15",
        }),
      )
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("CHECKPOINT_INVALID_STATE");
      });
  });

  it("returns null latest-review before Reviews and syncs DB fields after create", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    const empty = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/latest-review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(empty.body.data).toBeNull();

    const review = await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(reviewBody({ reviewPeriod: "2026-07" }))
      .expect(201);

    const checkpoint = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
    });
    expect(checkpoint.latestReviewId).toBe(review.body.data.id);
    expect(dateOnly(checkpoint.lastReviewedAt)).toBe(
      dateOnly(new Date(review.body.data.submittedAt)),
    );
    expect(dateOnly(checkpoint.nextReviewDate)).toBe("2026-08-15");
  });

  it("resolves concurrent duplicate Reviews to one success and one conflict", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    const concurrent = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app)
          .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send(reviewBody({ reviewPeriod: "2026-07" })),
      ),
    );
    const statuses = concurrent.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = concurrent.find((result) => result.status === 409)!;
    expect(conflict.body.error.code).toBe("CHECKPOINT_REVIEW_DUPLICATE");
    expect(
      await prisma.checkpointReview.count({
        where: { checkpointId, reviewPeriod: "2026-07" },
      }),
    ).toBe(1);
    const checkpoint = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
    });
    expect(checkpoint.latestReviewId).toBeTruthy();
  });

  it("applies submitted_at then UUID text latest-review tie-break from the database", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;
    const company = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const sharedSubmittedAt = new Date("2026-07-20T12:00:00.000Z");
    // Run-unique ordered UUIDs (same pattern as governance-foundation): textual
    // order still determines the winner under equal submitted_at, without
    // colliding on append-only checkpoint_reviews across integration reruns.
    const reviewIdPrefix = randomUUID().slice(0, 24);
    const reviewId = (ordinal: number) =>
      `${reviewIdPrefix}${String(ordinal).padStart(12, "0")}`;
    const lowId = reviewId(10);
    const highId = reviewId(20);
    expect(lowId < highId).toBe(true);

    // Insert lower UUID first, then higher UUID with identical submitted_at.
    // Trigger advances latest when latest_review_id::text < NEW.id::text.
    await prisma.checkpointReview.create({
      data: {
        id: lowId,
        tenantId: company.id,
        checkpointId,
        reviewPeriod: "2026-08",
        reviewDate: new Date("2026-08-01T00:00:00.000Z"),
        reviewerId: admin.user.id,
        outcome: "FAIL",
        observation: "Low UUID synthetic",
        submittedAt: sharedSubmittedAt,
        nextReviewDate: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await prisma.checkpointReview.create({
      data: {
        id: highId,
        tenantId: company.id,
        checkpointId,
        reviewPeriod: "2026-09",
        reviewDate: new Date("2026-09-01T00:00:00.000Z"),
        reviewerId: admin.user.id,
        outcome: "PASS",
        observation: "High UUID synthetic wins on text tie-break",
        submittedAt: sharedSubmittedAt,
        nextReviewDate: new Date("2026-10-01T00:00:00.000Z"),
      },
    });

    const reviews = await prisma.checkpointReview.findMany({
      where: { checkpointId, id: { in: [lowId, highId] } },
      orderBy: { id: "asc" },
    });
    expect(reviews).toHaveLength(2);
    expect(reviews[0]!.submittedAt.toISOString()).toBe(
      sharedSubmittedAt.toISOString(),
    );
    expect(reviews[1]!.submittedAt.toISOString()).toBe(
      sharedSubmittedAt.toISOString(),
    );
    expect(reviews[0]!.id < reviews[1]!.id).toBe(true);

    const stored = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
      include: { latestReview: true },
    });
    expect(stored.latestReviewId).toBe(highId);
    expect(stored.latestReview?.id).toBe(highId);
    expect(stored.latestReview?.outcome).toBe("PASS");
    expect(stored.lastReviewedAt?.toISOString()).toBe(
      sharedSubmittedAt.toISOString(),
    );

    const latest = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/latest-review`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(latest.body.data.id).toBe(highId);
    expect(latest.body.data.outcome).toBe("PASS");
    expect(latest.body.data.id).toBe(stored.latestReviewId);
  });

  it("rolls back Review creation when audit write fails mid-transaction", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.checkpointReview.create({
          data: {
            tenantId: admin.user.activeCompany.id,
            checkpointId,
            reviewPeriod: "2026-07",
            reviewDate: new Date("2026-07-15T00:00:00.000Z"),
            reviewerId: admin.user.id,
            outcome: "PASS",
            observation: "Synthetic rollback review",
            nextReviewDate: new Date("2026-08-15T00:00:00.000Z"),
          },
        });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow(/forced rollback/);

    expect(
      await prisma.checkpointReview.count({
        where: { checkpointId, reviewPeriod: "2026-07" },
      }),
    ).toBe(0);
    const checkpoint = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
    });
    expect(checkpoint.latestReviewId).toBeNull();
  });

  it("supports list filters, detail, traceability, audit and no DELETE", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(
        checkpointBody(control.id, {
          title: `Filterable Checkpoint ${randomUUID()}`,
          evidenceRequired: true,
        }),
      )
      .expect(201);
    const checkpointId = created.body.data.id as string;

    // Slice 5.5B: evidenceRequired reviews need qualifying APPROVED linked Evidence.
    const evidence = await prisma.evidence.create({
      data: {
        tenantId: admin.user.activeCompany.id,
        code: `EVD-CHK-${randomUUID().slice(0, 8)}`,
        title: "Filterable checkpoint evidence",
        lifecycleStatus: "APPROVED",
        storageKey: `${admin.user.activeCompany.id}/evidence/${randomUUID()}`,
        contentSha256: (randomUUID() + randomUUID())
          .replace(/-/g, "")
          .slice(0, 64),
        byteSize: 64,
        createdById: admin.user.id,
        updatedById: admin.user.id,
      },
    });
    await prisma.evidenceCheckpointLink.create({
      data: {
        tenantId: admin.user.activeCompany.id,
        evidenceId: evidence.id,
        checkpointId,
        isActive: true,
        createdById: admin.user.id,
        updatedById: admin.user.id,
      },
    });

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/reviews`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(reviewBody({ reviewPeriod: "2026-07", outcome: "PASS" }))
      .expect(201);

    const listed = await request(app)
      .get("/api/v1/checkpoints")
      .query({
        q: "Filterable",
        controlId: control.id,
        hasReviews: "true",
        evidenceRequired: "true",
        latestOutcome: "PASS",
        page: 1,
        pageSize: 20,
      })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    const listRow = listed.body.data.find(
      (row: { id: string }) => row.id === checkpointId,
    );
    expect(listRow).toBeTruthy();
    expect(listRow.description).toBeUndefined();
    expect(listRow.expectedResult).toBeUndefined();
    expect(listRow.observation).toBeUndefined();
    expect(listRow.recommendation).toBeUndefined();
    expect(listRow.latestOutcome).toBe("PASS");

    const detail = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body.data.totalReviewCount).toBe(1);
    expect(detail.body.data.latestReview.outcome).toBe("PASS");
    expect(detail.body.data.reviews).toBeUndefined();

    const trace = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/traceability`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(trace.body.data.control.id).toBe(control.id);
    expect(trace.body.data.totalReviewCount).toBe(1);
    expect(trace.body.data.policyVersionMappings).toBeTruthy();

    const audits = await request(app)
      .get(`/api/v1/checkpoints/${checkpointId}/audit-events`)
      .query({ page: 1, pageSize: 50 })
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      audits.body.data.some(
        (event: { action: string }) => event.action === "CHECKPOINT_CREATED",
      ),
    ).toBe(true);
    expect(
      audits.body.data.some(
        (event: { action: string }) => event.action === "CHECKPOINT_REVIEWED",
      ),
    ).toBe(true);
    for (const event of audits.body.data) {
      expect(JSON.stringify(event.metadata)).not.toMatch(
        /Synthetic observation|Continue monitoring|Filterable Checkpoint/i,
      );
    }

    await request(app)
      .delete(`/api/v1/checkpoints/${checkpointId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it("serializes reciprocal Control archive versus Checkpoint activation", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const control = await createControl(admin.accessToken);
    const created = await request(app)
      .post("/api/v1/checkpoints")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(checkpointBody(control.id))
      .expect(201);
    const checkpointId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/checkpoints/${checkpointId}/deactivate`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({})
      .expect(200);

    const settled = await Promise.allSettled([
      request(app)
        .post(`/api/v1/controls/${control.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({}),
      request(app)
        .post(`/api/v1/checkpoints/${checkpointId}/activate`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({}),
    ]);

    const responses = settled.map((item) =>
      item.status === "fulfilled" ? item.value : null,
    );
    expect(responses.every(Boolean)).toBe(true);
    const statuses = responses.map((item) => item!.status).sort();
    // One wins; the other conflicts. Never leave ACTIVE Checkpoint under ARCHIVED Control.
    expect(statuses).toEqual([200, 409]);

    const finalControl = await prisma.control.findFirstOrThrow({
      where: { id: control.id },
    });
    const finalCheckpoint = await prisma.checkpoint.findFirstOrThrow({
      where: { id: checkpointId },
    });
    if (finalControl.lifecycleStatus === "ARCHIVED") {
      expect(finalCheckpoint.lifecycleStatus).not.toBe("ACTIVE");
    }
    if (finalCheckpoint.lifecycleStatus === "ACTIVE") {
      expect(finalControl.lifecycleStatus).not.toBe("ARCHIVED");
    }
  });
});

const dateOnly = (value: Date | null | undefined) =>
  value == null ? null : value.toISOString().slice(0, 10);
