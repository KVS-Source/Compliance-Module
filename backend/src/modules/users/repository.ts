import type { Prisma, PrismaClient, RecordStatus } from "@prisma/client";

export interface CreateUserInput {
  code: string;
  fullName: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  status: RecordStatus;
  departmentId?: string | null;
  defaultTenantId: string;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
  passwordHash?: string;
  status?: RecordStatus;
  departmentId?: string | null;
}

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findInCompany(userId: string, tenantId: string) {
    return this.db.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { tenantId, status: "ACTIVE" } },
      },
      include: {
        memberships: {
          where: { tenantId, status: "ACTIVE" },
          include: { department: true },
        },
        roles: {
          where: { tenantId, status: "ACTIVE", role: { status: "ACTIVE" } },
          include: { role: true },
        },
      },
    });
  }

  findDepartmentInTenant(departmentId: string, tenantId: string) {
    return this.db.orgDepartment.findFirst({
      where: { id: departmentId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
  }

  createInTenant(
    tenantId: string,
    actorUserId: string,
    input: CreateUserInput,
    context: { ip?: string; userAgent?: string },
  ) {
    return this.db.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          code: input.code,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash: input.passwordHash,
          status: input.status,
          defaultTenantId: input.defaultTenantId,
          memberships: {
            create: {
              tenantId,
              status: "ACTIVE",
              ...(input.departmentId
                ? { departmentId: input.departmentId }
                : {}),
            },
          },
        },
        include: {
          memberships: {
            where: { tenantId, status: "ACTIVE" },
            include: { department: true },
          },
          roles: {
            where: { tenantId, status: "ACTIVE", role: { status: "ACTIVE" } },
            include: { role: true },
          },
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "USER_CREATE",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            code: user.code,
            email: user.email,
            status: user.status,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });

      return user;
    });
  }

  updateInTenant(
    userId: string,
    tenantId: string,
    actorUserId: string,
    input: UpdateUserInput,
    context: { ip?: string; userAgent?: string },
  ) {
    return this.db.$transaction(async (transaction) => {
      const existing = await transaction.user.findFirst({
        where: {
          id: userId,
          memberships: { some: { tenantId, status: "ACTIVE" } },
        },
        select: { id: true },
      });
      if (!existing) return null;

      const userData: Prisma.UserUpdateInput = {};
      if (input.fullName !== undefined) userData.fullName = input.fullName;
      if (input.email !== undefined) userData.email = input.email;
      if (input.phone !== undefined) userData.phone = input.phone;
      if (input.passwordHash !== undefined)
        userData.passwordHash = input.passwordHash;
      if (input.status !== undefined) userData.status = input.status;

      if (Object.keys(userData).length > 0) {
        await transaction.user.update({
          where: { id: userId },
          data: userData,
        });
      }

      if (input.departmentId !== undefined) {
        await transaction.userCompany.update({
          where: { userId_tenantId: { userId, tenantId } },
          data: { departmentId: input.departmentId },
        });
      }

      const user = await transaction.user.findFirstOrThrow({
        where: { id: userId },
        include: {
          memberships: {
            where: { tenantId, status: "ACTIVE" },
            include: { department: true },
          },
          roles: {
            where: { tenantId, status: "ACTIVE", role: { status: "ACTIVE" } },
            include: { role: true },
          },
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "USER_UPDATE",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            updatedFields: Object.keys(input).filter(
              (key) => key !== "passwordHash",
            ),
            email: user.email,
            status: user.status,
            passwordChanged: input.passwordHash !== undefined,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });

      return user;
    });
  }
}
