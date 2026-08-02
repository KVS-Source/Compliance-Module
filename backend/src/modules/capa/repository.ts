import { Prisma, type PrismaClient } from "@prisma/client";
import type { CapaListQuery } from "./validators.js";

const personSelect = { id: true, code: true, fullName: true } as const;
const departmentSelect = { id: true, code: true, name: true } as const;

export const capaInclude = Prisma.validator<Prisma.CapaInclude>()({
  owner: { select: personSelect },
  department: { select: departmentSelect },
  framework: { select: { id: true, code: true, name: true, version: true } },
  gap: {
    select: {
      id: true,
      code: true,
      title: true,
      severity: true,
      status: true,
    },
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

export type CapaRecord = Prisma.CapaGetPayload<{ include: typeof capaInclude }>;

export class CapaRepository {
  constructor(private readonly db: PrismaClient) {}

  private scope(tenantId: string, query: CapaListQuery): Prisma.CapaWhereInput {
    const now = new Date();
    return {
      tenantId,
      deletedAt: null,
      ...(query.code
        ? { code: { contains: query.code, mode: "insensitive" } }
        : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.gapId ? { gapId: query.gapId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      ...(query.needsReview === undefined
        ? {}
        : { needsReview: query.needsReview }),
      ...(query.overdue
        ? { dueDate: { lt: now }, status: { notIn: ["CLOSED", "CANCELLED"] } }
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
              { rootCause: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  async list(tenantId: string, query: CapaListQuery) {
    const where = this.scope(tenantId, query);
    const [items, total] = await this.db.$transaction([
      this.db.capa.findMany({
        where,
        include: capaInclude,
        orderBy: [{ createdAt: "desc" }, { code: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.capa.count({ where }),
    ]);
    return { items, total };
  }

  find(tenantId: string, id: string) {
    return this.db.capa.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: capaInclude,
    });
  }

  runTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(handler);
  }
}
