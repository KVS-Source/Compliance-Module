import type {
  Prisma,
  PrismaClient,
  TaskLinkType,
  TaskStatus,
} from "@prisma/client";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type {
  CreateTaskBody,
  TaskListQuery,
  UpdateTaskBody,
} from "./validators.js";

type AuditContext = { ip?: string; userAgent?: string };
type LinkSummary = { type: TaskLinkType; id: string; code: string; title: string };

const taskInclude = {
  owner: { select: { id: true, code: true, fullName: true } },
  createdBy: { select: { id: true, code: true, fullName: true } },
} satisfies Prisma.TaskInclude;

type TaskRecord = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const dateOnly = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;
const person = (value: { id: string; code: string; fullName: string } | null) =>
  value ? { id: value.id, code: value.code, name: value.fullName } : null;

const dto = (task: TaskRecord, linked: LinkSummary) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  dueDate: dateOnly(task.dueDate),
  overdue:
    task.dueDate !== null &&
    task.dueDate < new Date(new Date().toISOString().slice(0, 10)) &&
    !["COMPLETED", "CANCELLED"].includes(task.status),
  owner: person(task.owner),
  linked,
  createdBy: person(task.createdBy),
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const invalidLink = () =>
  new AppError(
    400,
    "TASK_LINK_INVALID",
    "The linked record is not available in this Company",
  );

export class TaskService {
  constructor(private readonly db: PrismaClient) {}

  private async assertOwner(tenantId: string, ownerId: string | null) {
    if (!ownerId) return;
    const membership = await this.db.userCompany.findFirst({
      where: {
        tenantId,
        userId: ownerId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new AppError(
        400,
        "TASK_OWNER_INVALID",
        "The owner is not an active member of this Company",
      );
    }
  }

  private async resolveLink(
    tenantId: string,
    type: TaskLinkType,
    id: string,
  ): Promise<LinkSummary> {
    if (type === "GAP") {
      const row = await this.db.gap.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true, title: true },
      });
      if (!row) throw invalidLink();
      return { type, ...row };
    }
    if (type === "CAPA") {
      const row = await this.db.capa.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true, title: true },
      });
      if (!row) throw invalidLink();
      return { type, ...row };
    }
    if (type === "RISK") {
      const row = await this.db.risk.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: { id: true, code: true, title: true },
      });
      if (!row) throw invalidLink();
      return { type, ...row };
    }
    const row = await this.db.auditEvent.findFirst({
      where: { tenantId, id },
      select: { id: true, action: true, entityType: true },
    });
    if (!row) throw invalidLink();
    return {
      type,
      id: row.id,
      code: row.action,
      title: `${row.entityType} audit event`,
    };
  }

  private async find(tenantId: string, id: string) {
    const task = await this.db.task.findFirst({
      where: { tenantId, id },
      include: taskInclude,
    });
    if (!task) throw notFound("Task not found");
    return task;
  }

  async list(tenantId: string, query: TaskListQuery) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const where = {
      tenantId,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" as const } },
              {
                description: {
                  contains: query.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.linkedEntityType
        ? { linkedEntityType: query.linkedEntityType }
        : {}),
      ...(query.overdue
        ? {
            dueDate: { lt: today },
            status: { in: ["TODO", "IN_PROGRESS"] as TaskStatus[] },
          }
        : {}),
    } satisfies Prisma.TaskWhereInput;
    const orderBy = query.orderBy
      ? [{ [query.orderBy]: query.order }, { id: "asc" as const }]
      : [{ dueDate: "asc" as const }, { createdAt: "desc" as const }];
    const [items, total] = await Promise.all([
      this.db.task.findMany({
        where,
        include: taskInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.task.count({ where }),
    ]);
    const linked = await Promise.all(
      items.map((item) =>
        this.resolveLink(tenantId, item.linkedEntityType, item.linkedEntityId),
      ),
    );
    return {
      data: items.map((item, index) => dto(item, linked[index]!)),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async get(tenantId: string, id: string) {
    const task = await this.find(tenantId, id);
    return dto(
      task,
      await this.resolveLink(
        tenantId,
        task.linkedEntityType,
        task.linkedEntityId,
      ),
    );
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateTaskBody,
    context: AuditContext,
  ) {
    await Promise.all([
      this.assertOwner(tenantId, body.ownerId ?? null),
      this.resolveLink(tenantId, body.linkedEntityType, body.linkedEntityId),
    ]);
    const task = await this.db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          tenantId,
          title: body.title,
          description: body.description ?? null,
          status: body.status ?? "TODO",
          dueDate: body.dueDate
            ? new Date(`${body.dueDate}T00:00:00.000Z`)
            : null,
          ownerId: body.ownerId ?? null,
          linkedEntityType: body.linkedEntityType,
          linkedEntityId: body.linkedEntityId,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        include: taskInclude,
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "TASK_CREATED",
          entityType: "TASK",
          entityId: created.id,
          metadata: {
            linkedEntityType: created.linkedEntityType,
            linkedEntityId: created.linkedEntityId,
            ownerId: created.ownerId,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return created;
    });
    return dto(
      task,
      await this.resolveLink(
        tenantId,
        task.linkedEntityType,
        task.linkedEntityId,
      ),
    );
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    body: UpdateTaskBody,
    context: AuditContext,
  ) {
    const current = await this.find(tenantId, id);
    const linkType = body.linkedEntityType ?? current.linkedEntityType;
    const linkId = body.linkedEntityId ?? current.linkedEntityId;
    await Promise.all([
      body.ownerId === undefined
        ? Promise.resolve()
        : this.assertOwner(tenantId, body.ownerId),
      this.resolveLink(tenantId, linkType, linkId),
    ]);
    const task = await this.db.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined
            ? {}
            : { description: body.description }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(body.dueDate === undefined
            ? {}
            : {
                dueDate: body.dueDate
                  ? new Date(`${body.dueDate}T00:00:00.000Z`)
                  : null,
              }),
          ...(body.ownerId === undefined ? {} : { ownerId: body.ownerId }),
          ...(body.linkedEntityType === undefined
            ? {}
            : { linkedEntityType: body.linkedEntityType }),
          ...(body.linkedEntityId === undefined
            ? {}
            : { linkedEntityId: body.linkedEntityId }),
          updatedById: actorUserId,
        },
        include: taskInclude,
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "TASK_UPDATED",
          entityType: "TASK",
          entityId: id,
          metadata: { fields: Object.keys(body) } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return updated;
    });
    return dto(task, await this.resolveLink(tenantId, linkType, linkId));
  }

  async delete(
    tenantId: string,
    id: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const current = await this.find(tenantId, id);
    return this.db.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "TASK_DELETED",
          entityType: "TASK",
          entityId: id,
          metadata: {
            title: current.title,
            linkedEntityType: current.linkedEntityType,
            linkedEntityId: current.linkedEntityId,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return { deleted: true as const, id };
    });
  }
}
