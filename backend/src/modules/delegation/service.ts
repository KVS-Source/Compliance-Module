import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";

/**
 * Approver delegation — out-of-office routing for maker-checker approvals.
 *
 * A live window lets the delegate act as the configured approver for KPI and
 * Policy decisions. Self-approval remains forbidden: the submitter can never
 * approve their own submission even when they hold a delegation from someone
 * else, and a person cannot create a delegation to themselves.
 */
export class DelegationService {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, actorUserId: string) {
    const rows = await this.db.approverDelegation.findMany({
      where: {
        tenantId,
        OR: [
          { delegatorUserId: actorUserId },
          { delegateUserId: actorUserId },
          // Company admins with users:write can list all; the route gates that.
        ],
      },
      include: {
        delegator: { select: { id: true, code: true, fullName: true, email: true } },
        delegate: { select: { id: true, code: true, fullName: true, email: true } },
      },
      orderBy: [{ startsAt: "desc" }],
      take: 200,
    });
    return rows.map(dto);
  }

  async listForAdmin(tenantId: string) {
    const rows = await this.db.approverDelegation.findMany({
      where: { tenantId },
      include: {
        delegator: { select: { id: true, code: true, fullName: true, email: true } },
        delegate: { select: { id: true, code: true, fullName: true, email: true } },
      },
      orderBy: [{ startsAt: "desc" }],
      take: 500,
    });
    return rows.map(dto);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    input: {
      delegateUserId: string;
      startsAt: Date;
      endsAt: Date;
      reason?: string | null;
    },
    context: { ip?: string; userAgent?: string },
  ) {
    if (input.delegateUserId === actorUserId) {
      throw new AppError(
        400,
        "DELEGATION_SELF_FORBIDDEN",
        "You cannot delegate approvals to yourself",
      );
    }
    if (input.endsAt <= input.startsAt) {
      throw new AppError(
        400,
        "DELEGATION_WINDOW_INVALID",
        "Delegation end must be after start",
      );
    }

    const membership = await this.db.userCompany.findUnique({
      where: {
        userId_tenantId: {
          userId: input.delegateUserId,
          tenantId,
        },
      },
      select: { status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new AppError(
        400,
        "RELATED_RECORD_INVALID",
        "Delegate must be an active member of this Company",
      );
    }

    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.approverDelegation.create({
        data: {
          tenantId,
          delegatorUserId: actorUserId,
          delegateUserId: input.delegateUserId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          reason: input.reason ?? null,
          createdById: actorUserId,
          status: "ACTIVE",
        },
        include: {
          delegator: {
            select: { id: true, code: true, fullName: true, email: true },
          },
          delegate: {
            select: { id: true, code: true, fullName: true, email: true },
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "APPROVER_DELEGATION_CREATE",
          entityType: "APPROVER_DELEGATION",
          entityId: created.id,
          metadata: {
            delegateUserId: input.delegateUserId,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return created;
    });
    return dto(row);
  }

  async revoke(
    tenantId: string,
    actorUserId: string,
    delegationId: string,
    context: { ip?: string; userAgent?: string },
    options: { allowAdmin: boolean } = { allowAdmin: false },
  ) {
    const existing = await this.db.approverDelegation.findFirst({
      where: { id: delegationId, tenantId },
    });
    if (!existing) throw notFound("Delegation not found");
    if (
      existing.delegatorUserId !== actorUserId &&
      !options.allowAdmin
    ) {
      throw notFound("Delegation not found");
    }

    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.approverDelegation.update({
        where: { id: existing.id },
        data: {
          status: "DISABLED",
          revokedAt: new Date(),
          revokedById: actorUserId,
        },
        include: {
          delegator: {
            select: { id: true, code: true, fullName: true, email: true },
          },
          delegate: {
            select: { id: true, code: true, fullName: true, email: true },
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "APPROVER_DELEGATION_REVOKE",
          entityType: "APPROVER_DELEGATION",
          entityId: existing.id,
          metadata: {
            delegatorUserId: existing.delegatorUserId,
            delegateUserId: existing.delegateUserId,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return updated;
    });
    return dto(row);
  }

  /**
   * True when actor may act as the configured approver right now, either
   * because they are the approver or they hold a live delegation from them.
   * Never true when actor is the submitter — call sites must still refuse
   * self-approval separately.
   */
  async mayActAsApprover(
    tenantId: string,
    configuredApproverId: string | null | undefined,
    actorUserId: string,
    at: Date = new Date(),
  ): Promise<boolean> {
    if (!configuredApproverId) return false;
    if (configuredApproverId === actorUserId) return true;

    const live = await this.db.approverDelegation.findFirst({
      where: {
        tenantId,
        status: "ACTIVE",
        delegatorUserId: configuredApproverId,
        delegateUserId: actorUserId,
        startsAt: { lte: at },
        endsAt: { gt: at },
      },
      select: { id: true },
    });
    return live !== null;
  }
}

const dto = (row: {
  id: string;
  tenantId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  reason: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  delegator: { id: string; code: string; fullName: string; email: string };
  delegate: { id: string; code: string; fullName: string; email: string };
}) => ({
  id: row.id,
  tenantId: row.tenantId,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  status: row.status,
  reason: row.reason,
  revokedAt: row.revokedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  delegator: {
    id: row.delegator.id,
    code: row.delegator.code,
    name: row.delegator.fullName,
    email: row.delegator.email,
  },
  delegate: {
    id: row.delegate.id,
    code: row.delegate.code,
    name: row.delegate.fullName,
    email: row.delegate.email,
  },
});
