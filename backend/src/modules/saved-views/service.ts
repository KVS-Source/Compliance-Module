import type { Prisma, PrismaClient } from "@prisma/client";
import { forbidden, notFound } from "../../common/errors/app-error.js";
import { permissionAllowed } from "../../common/middleware/http.js";
import type {
  CreateSavedViewBody,
  SavedViewRegisterKey,
  UpdateSavedViewBody,
} from "./validators.js";

type AuditContext = { ip?: string; userAgent?: string };

const REGISTER_PERMISSION: Record<SavedViewRegisterKey, string> = {
  GAPS: "gaps:read",
  CAPAS: "capa:read",
  RISKS: "risk:read",
  POLICIES: "policies:read",
  CONTROLS: "controls:read",
  CHECKPOINTS: "checkpoints:read",
  EVIDENCE: "evidence:read",
  KPI_ACTUALS: "kpis:read",
  KPI_TARGETS: "kpis:read",
  OPERATIONAL_REGISTERS: "registers:read",
  TASKS: "registers:read",
};

const dto = (view: {
  id: string;
  registerKey: string;
  name: string;
  query: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: view.id,
  registerKey: view.registerKey,
  name: view.name,
  query: view.query,
  createdAt: view.createdAt,
  updatedAt: view.updatedAt,
});

export class SavedViewService {
  constructor(private readonly db: PrismaClient) {}

  private requirePermission(
    permissions: readonly string[],
    registerKey: SavedViewRegisterKey,
  ) {
    if (!permissionAllowed(permissions, REGISTER_PERMISSION[registerKey])) {
      throw forbidden();
    }
  }

  private async owned(tenantId: string, userId: string, id: string) {
    const view = await this.db.savedView.findFirst({
      where: { tenantId, userId, id },
    });
    if (!view) throw notFound("Saved view not found");
    return view;
  }

  async list(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    registerKey: SavedViewRegisterKey,
  ) {
    this.requirePermission(permissions, registerKey);
    const views = await this.db.savedView.findMany({
      where: { tenantId, userId, registerKey },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return views.map(dto);
  }

  async create(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    body: CreateSavedViewBody,
    context: AuditContext,
  ) {
    this.requirePermission(permissions, body.registerKey);
    return this.db.$transaction(async (tx) => {
      const view = await tx.savedView.create({
        data: {
          tenantId,
          userId,
          registerKey: body.registerKey,
          name: body.name,
          query: body.query,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId,
          action: "SAVED_VIEW_CREATED",
          entityType: "SAVED_VIEW",
          entityId: view.id,
          metadata: {
            registerKey: view.registerKey,
            name: view.name,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return dto(view);
    });
  }

  async update(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    id: string,
    body: UpdateSavedViewBody,
    context: AuditContext,
  ) {
    const current = await this.owned(tenantId, userId, id);
    this.requirePermission(
      permissions,
      current.registerKey as SavedViewRegisterKey,
    );
    return this.db.$transaction(async (tx) => {
      const view = await tx.savedView.update({
        where: { id },
        data: {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.query === undefined ? {} : { query: body.query }),
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId,
          action: "SAVED_VIEW_UPDATED",
          entityType: "SAVED_VIEW",
          entityId: view.id,
          metadata: {
            registerKey: view.registerKey,
            fields: Object.keys(body),
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return dto(view);
    });
  }

  async delete(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    id: string,
    context: AuditContext,
  ) {
    const current = await this.owned(tenantId, userId, id);
    this.requirePermission(
      permissions,
      current.registerKey as SavedViewRegisterKey,
    );
    return this.db.$transaction(async (tx) => {
      await tx.savedView.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          userId,
          action: "SAVED_VIEW_DELETED",
          entityType: "SAVED_VIEW",
          entityId: id,
          metadata: {
            registerKey: current.registerKey,
            name: current.name,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return { deleted: true as const, id };
    });
  }
}
