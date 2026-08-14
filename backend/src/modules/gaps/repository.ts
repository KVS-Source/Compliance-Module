import { Prisma, type GapStatus, type PrismaClient } from "@prisma/client";
import type { GapListQuery } from "./validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

const personSelect = { id: true, code: true, fullName: true } as const;
const departmentSelect = { id: true, code: true, name: true } as const;

export const gapInclude = Prisma.validator<Prisma.GapInclude>()({
  owner: { select: personSelect },
  department: { select: departmentSelect },
  framework: { select: { id: true, code: true, name: true, version: true } },
  frameworkRule: { select: { id: true, code: true, title: true } },
  control: { select: { id: true, code: true, title: true } },
  checkpoint: { select: { id: true, code: true, title: true } },
  capas: {
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completionPercentage: true,
    },
    orderBy: { code: "asc" },
  },
  evidenceLinks: {
    where: { isActive: true },
    select: {
      id: true,
      linkReason: true,
      createdAt: true,
      evidence: {
        select: {
          id: true,
          code: true,
          title: true,
          lifecycleStatus: true,
          storageKey: true,
          sourceFileReference: true,
        },
      },
    },
  },
});

export type GapRecord = Prisma.GapGetPayload<{ include: typeof gapInclude }>;

export type LockedGapLifecycle = {
  id: string;
  code: string;
  status: GapStatus;
};

/**
 * Writes an audit event for a gap or CAPA change. Events are append-only, so
 * this is the only history these records carry.
 */
export const writeAudit = async (
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  },
) => {
  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ipAddress: input.context.ip ?? null,
      userAgent: input.context.userAgent ?? null,
      source: "SYSTEM",
    },
  });
};

export class GapRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Every query starts from the authenticated company; there is no unscoped read. */
  private scope(tenantId: string, query: GapListQuery): Prisma.GapWhereInput {
    const now = new Date();
    return {
      tenantId,
      deletedAt: null,
      ...(query.code
        ? { code: { contains: query.code, mode: "insensitive" } }
        : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      ...(query.needsReview === undefined
        ? {}
        : { needsReview: query.needsReview }),
      ...(query.overdue
        ? {
            dueDate: { lt: now },
            status: { notIn: ["CLOSED", "CANCELLED"] },
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueDate: {
              ...(query.dueFrom
                ? { gte: new Date(`${query.dueFrom}T00:00:00.000Z`) }
                : {}),
              ...(query.dueTo
                ? { lte: new Date(`${query.dueTo}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { code: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  async list(tenantId: string, query: GapListQuery) {
    const where = this.scope(tenantId, query);
    const direction = query.order ?? "asc";
    const orderBy =
      query.orderBy === undefined
        ? ([{ createdAt: "desc" }, { code: "asc" }] as const)
        : ([
            { [query.orderBy]: direction },
            { code: "asc" },
          ] as const);
    const [items, total] = await this.db.$transaction([
      this.db.gap.findMany({
        where,
        include: gapInclude,
        orderBy: [...orderBy],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.gap.count({ where }),
    ]);
    return { items, total };
  }

  find(tenantId: string, id: string) {
    return this.db.gap.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: gapInclude,
    });
  }

  /** Serializes every lifecycle decision for one tenant-scoped Gap row. */
  async lockLifecycle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const rows = await tx.$queryRaw<LockedGapLifecycle[]>`
      SELECT id, code, status
      FROM gaps
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  runTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(handler);
  }
}
