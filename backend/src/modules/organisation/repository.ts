import type { Prisma, PrismaClient, RecordStatus } from "@prisma/client";

type AuditContext = { ip?: string; userAgent?: string };

export interface CreateDepartmentInput {
  code: string;
  name: string;
  headName?: string | null;
  status: RecordStatus;
}

export interface UpdateDepartmentInput {
  name?: string;
  headName?: string | null;
  status?: RecordStatus;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  type?: string | null;
  status: RecordStatus;
}

export interface UpdateLocationInput {
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  type?: string | null;
  status?: RecordStatus;
}

export interface CreateUnitInput {
  code: string;
  name: string;
  status: RecordStatus;
}

export interface UpdateUnitInput {
  name?: string;
  status?: RecordStatus;
}

export class OrganisationRepository {
  constructor(private readonly db: PrismaClient) {}

  findDepartmentInTenant(id: string, tenantId: string) {
    return this.db.orgDepartment.findFirst({ where: { id, tenantId } });
  }

  findLocationInTenant(id: string, tenantId: string) {
    return this.db.orgLocation.findFirst({ where: { id, tenantId } });
  }

  findUnitInTenant(id: string, tenantId: string) {
    return this.db.orgUnit.findFirst({ where: { id, tenantId } });
  }

  createDepartment(
    tenantId: string,
    actorUserId: string,
    input: CreateDepartmentInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const department = await transaction.orgDepartment.create({
        data: {
          tenantId,
          code: input.code,
          name: input.name,
          headName: input.headName ?? null,
          status: input.status,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "DEPARTMENT_CREATE",
          entityType: "DEPARTMENT",
          entityId: department.id,
          metadata: {
            code: department.code,
            name: department.name,
            status: department.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return department;
    });
  }

  updateDepartment(
    id: string,
    tenantId: string,
    actorUserId: string,
    input: UpdateDepartmentInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.orgDepartment.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return null;

      const department = await transaction.orgDepartment.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.headName !== undefined ? { headName: input.headName } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "DEPARTMENT_UPDATE",
          entityType: "DEPARTMENT",
          entityId: department.id,
          metadata: {
            updatedFields: Object.keys(input),
            code: department.code,
            name: department.name,
            status: department.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return department;
    });
  }

  createLocation(
    tenantId: string,
    actorUserId: string,
    input: CreateLocationInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const location = await transaction.orgLocation.create({
        data: {
          tenantId,
          code: input.code,
          name: input.name,
          city: input.city ?? null,
          state: input.state ?? null,
          country: input.country ?? null,
          type: input.type ?? null,
          status: input.status,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "LOCATION_CREATE",
          entityType: "LOCATION",
          entityId: location.id,
          metadata: {
            code: location.code,
            name: location.name,
            status: location.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return location;
    });
  }

  updateLocation(
    id: string,
    tenantId: string,
    actorUserId: string,
    input: UpdateLocationInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.orgLocation.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return null;

      const location = await transaction.orgLocation.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "LOCATION_UPDATE",
          entityType: "LOCATION",
          entityId: location.id,
          metadata: {
            updatedFields: Object.keys(input),
            code: location.code,
            name: location.name,
            status: location.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return location;
    });
  }

  createUnit(
    tenantId: string,
    actorUserId: string,
    input: CreateUnitInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const unit = await transaction.orgUnit.create({
        data: {
          tenantId,
          code: input.code,
          name: input.name,
          status: input.status,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "UNIT_CREATE",
          entityType: "UNIT",
          entityId: unit.id,
          metadata: {
            code: unit.code,
            name: unit.name,
            status: unit.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return unit;
    });
  }

  updateUnit(
    id: string,
    tenantId: string,
    actorUserId: string,
    input: UpdateUnitInput,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.orgUnit.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return null;

      const unit = await transaction.orgUnit.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "UNIT_UPDATE",
          entityType: "UNIT",
          entityId: unit.id,
          metadata: {
            updatedFields: Object.keys(input),
            code: unit.code,
            name: unit.name,
            status: unit.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      return unit;
    });
  }
}
