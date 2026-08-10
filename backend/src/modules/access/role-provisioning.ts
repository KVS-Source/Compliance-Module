import type { Prisma } from "@prisma/client";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
  type ProductionRoleCode,
} from "../../production/access-profile.js";
import { RoleAssignmentService } from "./role-assignment-service.js";

/**
 * Provisioning and binding of the sanctioned production access profiles.
 *
 * Extracted from `AccessProfileService.assignUserRole` so single assignment
 * (`PUT /access/users/:id/roles`) and bulk user import bind users through the
 * same code rather than a second, drifting copy.
 *
 * `provisionProductionRole` is the expensive half — one upsert per published
 * permission — so a bulk caller runs it once per distinct role code instead of
 * once per user. `bindUserToProductionRole` is the per-user half and stays one
 * governed write per record.
 */
export const provisionProductionRole = async (
  transaction: Prisma.TransactionClient,
  tenantId: string,
  roleCode: ProductionRoleCode,
) => {
  const profile = PRODUCTION_ACCESS_PROFILES[roleCode];
  const permissionIds = new Map<string, string>();
  for (const [code, description] of PRODUCTION_PERMISSIONS) {
    const permission = await transaction.permission.upsert({
      where: { code },
      update: { name: description },
      create: { code, name: description },
    });
    permissionIds.set(code, permission.id);
  }

  const role = await transaction.role.upsert({
    where: { tenantId_code: { tenantId, code: roleCode } },
    update: {
      name: profile.name,
      description: profile.description,
      status: "ACTIVE",
    },
    create: {
      tenantId,
      code: roleCode,
      name: profile.name,
      description: profile.description,
      status: "ACTIVE",
    },
  });

  await transaction.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permission: { code: { notIn: [...profile.permissions] } },
    },
  });
  for (const permissionCode of profile.permissions) {
    const permissionId = permissionIds.get(permissionCode);
    if (!permissionId) {
      throw new Error(`Permission catalogue is incomplete: ${permissionCode}`);
    }
    await transaction.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId } },
      update: {},
      create: { roleId: role.id, permissionId },
    });
  }

  return role;
};

/**
 * Makes the named role the user's single active assignment in the Company.
 * Any other active assignment is disabled so a profile change never leaves a
 * person holding two permission sets at once.
 */
export const bindUserToProductionRole = async (
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    tenantId: string;
    roleId: string;
    assignedBy: string;
  },
) => {
  const disabled = await transaction.userRole.updateMany({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      roleId: { not: input.roleId },
      status: "ACTIVE",
    },
    data: { status: "DISABLED" },
  });
  const assignment = await new RoleAssignmentService(transaction).upsertActive({
    userId: input.userId,
    roleId: input.roleId,
    tenantId: input.tenantId,
    assignedBy: input.assignedBy,
  });
  return { assignment, disabledAssignmentCount: disabled.count };
};
