import {
  Prisma,
  type GovernanceRecordStatus,
  type KpiFrequency,
  type PrismaClient,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../governance/code-generation.js";
import type { CheckpointListQuery } from "./validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

const personSelect = { id: true, code: true, fullName: true } as const;
const departmentSelect = { id: true, code: true, name: true } as const;
const controlSelect = {
  id: true,
  code: true,
  title: true,
  lifecycleStatus: true,
} as const;
const latestReviewSelect = {
  id: true,
  reviewPeriod: true,
  reviewDate: true,
  outcome: true,
  nextReviewDate: true,
  submittedAt: true,
  reviewerId: true,
  reviewer: { select: personSelect },
} as const;

export const checkpointDetailInclude =
  Prisma.validator<Prisma.CheckpointInclude>()({
    owner: { select: personSelect },
    department: { select: departmentSelect },
    control: { select: controlSelect },
    latestReview: { select: latestReviewSelect },
  });

export const checkpointReviewInclude =
  Prisma.validator<Prisma.CheckpointReviewInclude>()({
    reviewer: { select: personSelect },
  });

export type CheckpointRecord = Prisma.CheckpointGetPayload<{
  include: typeof checkpointDetailInclude;
}>;

export type CheckpointReviewRecord = Prisma.CheckpointReviewGetPayload<{
  include: typeof checkpointReviewInclude;
}>;

export type CheckpointCounts = {
  totalReviewCount: number;
  activePolicyVersionMappingCount: number;
  activeFrameworkMappingCount: number;
  activeFrameworkRuleMappingCount: number;
};

const writeAudit = (
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: "CHECKPOINT";
    entityId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  },
) =>
  transaction.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ...(input.context.ip ? { ipAddress: input.context.ip } : {}),
      ...(input.context.userAgent
        ? { userAgent: input.context.userAgent }
        : {}),
    },
  });

export class CheckpointRepository {
  constructor(private readonly db: PrismaClient) {}

  findTenantUser(tenantId: string, userId: string) {
    return this.db.userCompany.findFirst({
      where: {
        tenantId,
        userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
  }

  findDepartment(tenantId: string, id: string) {
    return this.db.orgDepartment.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findCheckpoint(
    tenantId: string,
    checkpointId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.checkpoint.findFirst({
      where: { tenantId, id: checkpointId },
      include: checkpointDetailInclude,
    });
  }

  findReview(
    tenantId: string,
    checkpointId: string,
    reviewId: string,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return client.checkpointReview.findFirst({
      where: { tenantId, checkpointId, id: reviewId },
      include: checkpointReviewInclude,
    });
  }

  async getCheckpointCounts(
    tenantId: string,
    checkpoints: Array<{ id: string; controlId: string }>,
    client: Prisma.TransactionClient | PrismaClient = this.db,
  ): Promise<Map<string, CheckpointCounts>> {
    const empty = (): CheckpointCounts => ({
      totalReviewCount: 0,
      activePolicyVersionMappingCount: 0,
      activeFrameworkMappingCount: 0,
      activeFrameworkRuleMappingCount: 0,
    });
    const result = new Map<string, CheckpointCounts>(
      checkpoints.map((item) => [item.id, empty()]),
    );
    if (checkpoints.length === 0) return result;

    const checkpointIds = checkpoints.map((item) => item.id);
    const controlIds = [...new Set(checkpoints.map((item) => item.controlId))];
    const controlToCheckpoints = new Map<string, string[]>();
    for (const item of checkpoints) {
      const list = controlToCheckpoints.get(item.controlId) ?? [];
      list.push(item.id);
      controlToCheckpoints.set(item.controlId, list);
    }

    const [reviewCounts, policyCounts, frameworkCounts, ruleCounts] =
      await Promise.all([
        client.checkpointReview.groupBy({
          by: ["checkpointId"],
          where: { tenantId, checkpointId: { in: checkpointIds } },
          _count: { _all: true },
        }),
        client.controlPolicyVersion.groupBy({
          by: ["controlId"],
          where: {
            tenantId,
            controlId: { in: controlIds },
            isActive: true,
          },
          _count: { _all: true },
        }),
        client.controlFramework.groupBy({
          by: ["controlId"],
          where: {
            tenantId,
            controlId: { in: controlIds },
            isActive: true,
          },
          _count: { _all: true },
        }),
        client.ruleControl.groupBy({
          by: ["controlId"],
          where: {
            tenantId,
            controlId: { in: controlIds },
            isActive: true,
          },
          _count: { _all: true },
        }),
      ]);

    for (const row of reviewCounts) {
      const counts = result.get(row.checkpointId);
      if (counts) counts.totalReviewCount = row._count._all;
    }
    for (const row of policyCounts) {
      for (const checkpointId of controlToCheckpoints.get(row.controlId) ?? []) {
        const counts = result.get(checkpointId);
        if (counts) {
          counts.activePolicyVersionMappingCount = row._count._all;
        }
      }
    }
    for (const row of frameworkCounts) {
      for (const checkpointId of controlToCheckpoints.get(row.controlId) ?? []) {
        const counts = result.get(checkpointId);
        if (counts) {
          counts.activeFrameworkMappingCount = row._count._all;
        }
      }
    }
    for (const row of ruleCounts) {
      for (const checkpointId of controlToCheckpoints.get(row.controlId) ?? []) {
        const counts = result.get(checkpointId);
        if (counts) {
          counts.activeFrameworkRuleMappingCount = row._count._all;
        }
      }
    }
    return result;
  }

  private checkpointListWhere(
    tenantId: string,
    query: CheckpointListQuery,
  ): Prisma.CheckpointWhereInput {
    return {
      tenantId,
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.controlId ? { controlId: query.controlId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.verificationFrequency
        ? { verificationFrequency: query.verificationFrequency }
        : {}),
      ...(query.evidenceRequired !== undefined
        ? { evidenceRequired: query.evidenceRequired }
        : {}),
      ...(query.code
        ? { code: { equals: query.code, mode: "insensitive" } }
        : {}),
      ...(query.title
        ? { title: { contains: query.title, mode: "insensitive" } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { title: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            nextReviewDate: {
              ...(query.dueFrom
                ? { gte: new Date(`${query.dueFrom}T00:00:00.000Z`) }
                : {}),
              ...(query.dueTo
                ? { lte: new Date(`${query.dueTo}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.hasReviews === true
        ? { reviews: { some: { tenantId } } }
        : {}),
      ...(query.hasReviews === false
        ? { reviews: { none: { tenantId } } }
        : {}),
      ...(query.latestOutcome
        ? {
            latestReview: {
              outcome: query.latestOutcome,
            },
          }
        : {}),
      ...(query.reviewPeriod
        ? {
            reviews: {
              some: {
                tenantId,
                reviewPeriod: query.reviewPeriod,
              },
            },
          }
        : {}),
      ...(query.controlLifecycleStatus
        ? {
            control: {
              tenantId,
              lifecycleStatus: query.controlLifecycleStatus,
            },
          }
        : {}),
      ...(query.frameworkId
        ? {
            control: {
              tenantId,
              frameworkMappings: {
                some: {
                  tenantId,
                  frameworkId: query.frameworkId,
                  isActive: true,
                },
              },
            },
          }
        : {}),
      ...(query.policyId
        ? {
            control: {
              tenantId,
              policyVersionMappings: {
                some: {
                  tenantId,
                  policyId: query.policyId,
                  isActive: true,
                },
              },
            },
          }
        : {}),
    };
  }

  async listCheckpoints(tenantId: string, query: CheckpointListQuery) {
    const where = this.checkpointListWhere(tenantId, query);
    const [items, total] = await this.db.$transaction([
      this.db.checkpoint.findMany({
        where,
        include: checkpointDetailInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ code: "asc" }, { id: "asc" }],
      }),
      this.db.checkpoint.count({ where }),
    ]);
    const counts = await this.getCheckpointCounts(
      tenantId,
      items.map((item) => ({ id: item.id, controlId: item.controlId })),
    );
    return {
      items: items as CheckpointRecord[],
      total,
      counts,
    };
  }

  async listReviews(
    tenantId: string,
    checkpointId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.CheckpointReviewWhereInput = {
      tenantId,
      checkpointId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.checkpointReview.findMany({
        where,
        include: checkpointReviewInclude,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.checkpointReview.count({ where }),
    ]);
    return { items: items as CheckpointReviewRecord[], total };
  }

  async listAuditEvents(
    tenantId: string,
    checkpointId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      entityType: "CHECKPOINT",
      entityId: checkpointId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return { items, total };
  }

  async getTraceability(tenantId: string, checkpointId: string) {
    const checkpoint = await this.findCheckpoint(tenantId, checkpointId);
    if (!checkpoint) return null;

    const [policyMappings, frameworkMappings, ruleMappings, counts] =
      await Promise.all([
        this.db.controlPolicyVersion.findMany({
          where: { tenantId, controlId: checkpoint.controlId },
          include: {
            policyVersion: {
              select: {
                id: true,
                policyId: true,
                status: true,
                versionMajor: true,
                versionMinor: true,
                sequence: true,
                policy: {
                  select: { id: true, code: true, title: true },
                },
              },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.db.controlFramework.findMany({
          where: { tenantId, controlId: checkpoint.controlId },
          include: {
            framework: {
              select: { id: true, code: true, name: true, version: true },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.db.ruleControl.findMany({
          where: { tenantId, controlId: checkpoint.controlId },
          include: {
            frameworkRule: {
              select: {
                id: true,
                frameworkId: true,
                code: true,
                title: true,
              },
            },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        }),
        this.getCheckpointCounts(tenantId, [
          { id: checkpointId, controlId: checkpoint.controlId },
        ]),
      ]);

    return {
      checkpoint,
      policyMappings,
      frameworkMappings,
      ruleMappings,
      counts: counts.get(checkpointId)!,
    };
  }

  async createCheckpoint(input: {
    tenantId: string;
    actorUserId: string;
    controlId: string;
    title: string;
    description: string | null;
    verificationFrequency: KpiFrequency;
    ownerId: string | null;
    departmentId: string | null;
    expectedResult: string;
    evidenceRequired: boolean;
    initialReviewDate: Date | null;
    context: AuditContext;
  }): Promise<
    | { error: "CONTROL_NOT_FOUND" | "CONTROL_ARCHIVED" }
    | { checkpoint: CheckpointRecord | null }
  > {
    type CreateTxnResult =
      | { error: "CONTROL_NOT_FOUND" | "CONTROL_ARCHIVED" }
      | { checkpointId: string };

    const result = await this.db.$transaction(
      async (transaction): Promise<CreateTxnResult> => {
        const lockedControls = await this.lockControl(
          transaction,
          input.tenantId,
          input.controlId,
        );
        if (!lockedControls[0]) return { error: "CONTROL_NOT_FOUND" };
        if (lockedControls[0].lifecycle_status === "ARCHIVED") {
          return { error: "CONTROL_ARCHIVED" };
        }

        const codes = new GovernanceCodeRepository(transaction);
        const existingCodes = await transaction.checkpoint.findMany({
          where: { tenantId: input.tenantId },
          select: { code: true },
        });
        const maxAllocated = existingCodes.reduce((max, row) => {
          const match = /^CHK-(\d+)$/.exec(row.code);
          if (!match) return max;
          return Math.max(max, Number(match[1]));
        }, 0);
        if (maxAllocated > 0) {
          await transaction.tenant.updateMany({
            where: {
              id: input.tenantId,
              nextCheckpointNumber: { lte: maxAllocated },
            },
            data: { nextCheckpointNumber: maxAllocated + 1 },
          });
        }
        const code = await codes.allocateCheckpointCode(input.tenantId);
        const checkpoint = await transaction.checkpoint.create({
          data: {
            tenantId: input.tenantId,
            controlId: input.controlId,
            code,
            title: input.title,
            description: input.description,
            verificationFrequency: input.verificationFrequency,
            ownerId: input.ownerId,
            departmentId: input.departmentId,
            expectedResult: input.expectedResult,
            evidenceRequired: input.evidenceRequired,
            lifecycleStatus: "ACTIVE",
            initialReviewDate: input.initialReviewDate,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
        });
        await writeAudit(transaction, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "CHECKPOINT_CREATED",
          entityType: "CHECKPOINT",
          entityId: checkpoint.id,
          metadata: { code },
          context: input.context,
        });
        return { checkpointId: checkpoint.id };
      },
    );

    if ("error" in result) return { error: result.error };
    return {
      checkpoint: await this.findCheckpoint(input.tenantId, result.checkpointId),
    };
  }

  async runInTransaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(work);
  }

  lockControl(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    return transaction.$queryRaw<
      Array<{
        id: string;
        code: string;
        lifecycle_status: GovernanceRecordStatus;
        title: string;
      }>
    >`
      SELECT id, code, lifecycle_status, title
      FROM controls
      WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      FOR UPDATE
    `;
  }

  lockCheckpoint(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    return transaction.$queryRaw<
      Array<{
        id: string;
        code: string;
        control_id: string;
        title: string;
        description: string | null;
        verification_frequency: KpiFrequency;
        owner_id: string | null;
        department_id: string | null;
        expected_result: string;
        evidence_required: boolean;
        lifecycle_status: GovernanceRecordStatus;
        initial_review_date: Date | null;
        next_review_date: Date | null;
        latest_review_id: string | null;
        last_reviewed_at: Date | null;
      }>
    >`
      SELECT id, code, control_id, title, description, verification_frequency,
             owner_id, department_id, expected_result, evidence_required,
             lifecycle_status, initial_review_date, next_review_date,
             latest_review_id, last_reviewed_at
      FROM checkpoints
      WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      FOR UPDATE
    `;
  }

  countReviews(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    checkpointId: string,
  ) {
    return transaction.checkpointReview.count({
      where: { tenantId, checkpointId },
    });
  }

  writeAudit = writeAudit;
}
