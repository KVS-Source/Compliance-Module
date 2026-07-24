import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

interface ActiveRoleAssignmentInput {
  userId: string;
  roleId: string;
  tenantId: string;
  assignedBy?: string | undefined;
}

export class RoleAssignmentService {
  constructor(private readonly db: PrismaClient) {}

  async upsertActive({
    userId,
    roleId,
    tenantId,
    assignedBy,
  }: ActiveRoleAssignmentInput) {
    const [membership, role] = await Promise.all([
      this.db.userCompany.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { status: true },
      }),
      this.db.role.findUnique({
        where: { id: roleId },
        select: { tenantId: true, status: true },
      }),
    ]);
    if (!membership || membership.status !== "ACTIVE") {
      throw new AppError(
        409,
        "INVALID_ROLE_ASSIGNMENT",
        "An active Company membership is required for role assignment",
      );
    }
    if (!role || role.status !== "ACTIVE" || role.tenantId !== tenantId) {
      throw new AppError(
        409,
        "INVALID_ROLE_ASSIGNMENT",
        "The role is not active in the selected Company",
      );
    }

    return this.db.userRole.upsert({
      where: {
        userId_roleId_tenantId: { userId, roleId, tenantId },
      },
      update: {
        status: "ACTIVE",
        ...(assignedBy ? { assignedBy } : {}),
      },
      create: {
        userId,
        roleId,
        tenantId,
        status: "ACTIVE",
        ...(assignedBy ? { assignedBy } : {}),
      },
    });
  }
}
