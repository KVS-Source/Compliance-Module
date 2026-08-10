import type { NotificationKind, Prisma, PrismaClient } from "@prisma/client";
import { notFound } from "../../common/errors/app-error.js";
import { permissionAllowed } from "../../common/middleware/http.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { NotificationListQuery } from "./validators.js";

type AuditContext = { ip?: string; userAgent?: string };
type Candidate = {
  tenantId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  targetPath: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
};

const dto = (notification: {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  targetPath: string;
  sourceType: string;
  sourceId: string;
  readAt: Date | null;
  createdAt: Date;
}) => ({
  id: notification.id,
  kind: notification.kind,
  title: notification.title,
  message: notification.message,
  targetPath: notification.targetPath,
  sourceType: notification.sourceType,
  sourceId: notification.sourceId,
  read: notification.readAt !== null,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

export class NotificationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Reconciles actionable Company state into durable personal notifications.
   * Unique dedupe keys make repeated bell refreshes safe and preserve read state.
   */
  private async generate(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
  ) {
    const canTargetApprove = permissionAllowed(
      permissions,
      "kpi-target:approve",
    );
    const canActualApprove = permissionAllowed(
      permissions,
      "kpi-actual:approve",
    );
    const canPolicyApprove = permissionAllowed(permissions, "policies:approve");
    const canEvidenceReview = permissionAllowed(permissions, "evidence:review");
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [
      targets,
      actuals,
      policyVersions,
      evidence,
      gaps,
      capas,
      risks,
      tasks,
      overdueGaps,
      overdueCapas,
    ] = await Promise.all([
      canTargetApprove
        ? this.db.kpiTarget.findMany({
            where: {
              tenantId,
              approvalStatus: "PENDING_APPROVAL",
              deletedAt: null,
              submittedById: { not: userId },
              configuration: {
                OR: [{ approverId: userId }, { approverId: null }],
              },
            },
            select: {
              id: true,
              code: true,
              period: true,
              configuration: { select: { definition: { select: { name: true } } } },
            },
          })
        : [],
      canActualApprove
        ? this.db.kpiActual.findMany({
            where: {
              tenantId,
              approvalStatus: { in: ["SUBMITTED", "PENDING_APPROVAL"] },
              deletedAt: null,
              submittedById: { not: userId },
              configuration: {
                OR: [{ approverId: userId }, { approverId: null }],
              },
            },
            select: {
              id: true,
              code: true,
              period: true,
              configuration: { select: { definition: { select: { name: true } } } },
            },
          })
        : [],
      canPolicyApprove
        ? this.db.policyVersion.findMany({
            where: {
              tenantId,
              status: "SUBMITTED",
              submittedById: { not: userId },
              OR: [{ requestedApproverId: userId }, { requestedApproverId: null }],
            },
            select: {
              id: true,
              versionMajor: true,
              versionMinor: true,
              policy: { select: { id: true, code: true, title: true } },
            },
          })
        : [],
      canEvidenceReview
        ? this.db.evidence.findMany({
            where: {
              tenantId,
              lifecycleStatus: "SUBMITTED",
              submittedById: { not: userId },
            },
            select: { id: true, code: true, title: true },
          })
        : [],
      this.db.gap.findMany({
        where: {
          tenantId,
          ownerId: userId,
          deletedAt: null,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        select: { id: true, code: true, title: true },
      }),
      this.db.capa.findMany({
        where: {
          tenantId,
          ownerId: userId,
          deletedAt: null,
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION"] },
        },
        select: { id: true, code: true, title: true },
      }),
      this.db.risk.findMany({
        where: {
          tenantId,
          ownerId: userId,
          deletedAt: null,
          status: { notIn: ["CLOSED", "ARCHIVED"] },
        },
        select: { id: true, code: true, title: true },
      }),
      this.db.task.findMany({
        where: {
          tenantId,
          ownerId: userId,
          status: { in: ["TODO", "IN_PROGRESS"] },
        },
        select: { id: true, title: true },
      }),
      this.db.gap.findMany({
        where: {
          tenantId,
          ownerId: userId,
          deletedAt: null,
          dueDate: { lt: startOfToday },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        select: { id: true, code: true, title: true },
      }),
      this.db.capa.findMany({
        where: {
          tenantId,
          ownerId: userId,
          deletedAt: null,
          dueDate: { lt: startOfToday },
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VERIFICATION"] },
        },
        select: { id: true, code: true, title: true },
      }),
    ]);

    const candidates: Candidate[] = [];
    for (const item of targets) {
      candidates.push({
        tenantId,
        userId,
        kind: "APPROVAL_REQUEST",
        title: "KPI target awaiting approval",
        message: `${item.code} · ${item.configuration.definition.name} · ${item.period}`,
        targetPath: "/kpi/targets",
        sourceType: "KPI_TARGET",
        sourceId: item.id,
        dedupeKey: `approval:kpi-target:${item.id}`,
      });
    }
    for (const item of actuals) {
      candidates.push({
        tenantId,
        userId,
        kind: "APPROVAL_REQUEST",
        title: "KPI actual awaiting approval",
        message: `${item.code} · ${item.configuration.definition.name} · ${item.period}`,
        targetPath: "/kpi/approval",
        sourceType: "KPI_ACTUAL",
        sourceId: item.id,
        dedupeKey: `approval:kpi-actual:${item.id}`,
      });
    }
    for (const item of policyVersions) {
      candidates.push({
        tenantId,
        userId,
        kind: "APPROVAL_REQUEST",
        title: "Policy Version awaiting approval",
        message: `${item.policy.code} · ${item.policy.title} · v${item.versionMajor}.${item.versionMinor}`,
        targetPath: `/compliance/policies/${item.policy.id}`,
        sourceType: "POLICY_VERSION",
        sourceId: item.id,
        dedupeKey: `approval:policy-version:${item.id}`,
      });
    }
    for (const item of evidence) {
      candidates.push({
        tenantId,
        userId,
        kind: "APPROVAL_REQUEST",
        title: "Evidence awaiting review",
        message: `${item.code} · ${item.title}`,
        targetPath: "/evidence/review",
        sourceType: "EVIDENCE",
        sourceId: item.id,
        dedupeKey: `approval:evidence:${item.id}`,
      });
    }
    for (const item of gaps) {
      candidates.push({
        tenantId,
        userId,
        kind: "OWNERSHIP_ASSIGNMENT",
        title: "Gap assigned to you",
        message: `${item.code} · ${item.title}`,
        targetPath: `/compliance/gaps/${item.id}`,
        sourceType: "GAP",
        sourceId: item.id,
        dedupeKey: `owner:gap:${item.id}`,
      });
    }
    for (const item of capas) {
      candidates.push({
        tenantId,
        userId,
        kind: "OWNERSHIP_ASSIGNMENT",
        title: "CAPA assigned to you",
        message: `${item.code} · ${item.title}`,
        targetPath: `/compliance/capa/${item.id}`,
        sourceType: "CAPA",
        sourceId: item.id,
        dedupeKey: `owner:capa:${item.id}`,
      });
    }
    for (const item of risks) {
      candidates.push({
        tenantId,
        userId,
        kind: "OWNERSHIP_ASSIGNMENT",
        title: "Risk assigned to you",
        message: `${item.code} · ${item.title}`,
        targetPath: `/compliance/risks/${item.id}`,
        sourceType: "RISK",
        sourceId: item.id,
        dedupeKey: `owner:risk:${item.id}`,
      });
    }
    for (const item of tasks) {
      candidates.push({
        tenantId,
        userId,
        kind: "OWNERSHIP_ASSIGNMENT",
        title: "Task assigned to you",
        message: item.title,
        targetPath: "/tasks",
        sourceType: "TASK",
        sourceId: item.id,
        dedupeKey: `owner:task:${item.id}`,
      });
    }
    for (const item of overdueGaps) {
      candidates.push({
        tenantId,
        userId,
        kind: "OVERDUE_GAP",
        title: "Gap is overdue",
        message: `${item.code} · ${item.title}`,
        targetPath: `/compliance/gaps/${item.id}`,
        sourceType: "GAP",
        sourceId: item.id,
        dedupeKey: `overdue:gap:${item.id}`,
      });
    }
    for (const item of overdueCapas) {
      candidates.push({
        tenantId,
        userId,
        kind: "OVERDUE_CAPA",
        title: "CAPA is overdue",
        message: `${item.code} · ${item.title}`,
        targetPath: `/compliance/capa/${item.id}`,
        sourceType: "CAPA",
        sourceId: item.id,
        dedupeKey: `overdue:capa:${item.id}`,
      });
    }

    if (candidates.length > 0) {
      await this.db.notification.createMany({
        data: candidates,
        skipDuplicates: true,
      });
    }
  }

  async list(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    query: NotificationListQuery,
  ) {
    await this.generate(tenantId, userId, permissions);
    const where = {
      tenantId,
      userId,
      ...(query.unread === true ? { readAt: null } : {}),
      ...(query.unread === false ? { readAt: { not: null } } : {}),
    } satisfies Prisma.NotificationWhereInput;
    const [items, total, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { tenantId, userId, readAt: null } }),
    ]);
    return {
      data: { items: items.map(dto), unreadCount },
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async markRead(
    tenantId: string,
    userId: string,
    id: string,
    context: AuditContext,
  ) {
    const current = await this.db.notification.findFirst({
      where: { tenantId, userId, id },
    });
    if (!current) throw notFound("Notification not found");
    if (current.readAt) return dto(current);

    return this.db.$transaction(async (tx) => {
      const notification = await tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId,
          action: "NOTIFICATION_READ",
          entityType: "NOTIFICATION",
          entityId: id,
          metadata: {
            kind: notification.kind,
            sourceType: notification.sourceType,
            sourceId: notification.sourceId,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return dto(notification);
    });
  }
}
