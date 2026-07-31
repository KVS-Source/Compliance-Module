import type { PrismaClient } from "@prisma/client";

/**
 * Test-only helper: temporarily grant a permission to a role with ownership
 * tracking so cleanup never strips a pre-existing assignment.
 *
 * Integration tests must use the isolated PostgreSQL runner; this helper does
 * not change production permission logic.
 */
export type OwnedRolePermissionGrant = {
  /** True only when this call inserted the role_permission row. */
  addedByCaller: boolean;
  roleId: string;
  permissionId: string;
  assignmentId: string | null;
  /** Revokes only when addedByCaller is true; otherwise preserves existing. */
  revoke: () => Promise<void>;
};

export async function grantRolePermissionIfAbsent(
  prisma: PrismaClient,
  options: {
    tenantCode: string;
    roleCode: string;
    permissionCode: string;
  },
): Promise<OwnedRolePermissionGrant> {
  const company = await prisma.tenant.findUniqueOrThrow({
    where: { code: options.tenantCode },
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: {
      tenantId_code: { tenantId: company.id, code: options.roleCode },
    },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: options.permissionCode },
  });
  const existing = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
  });
  if (existing) {
    return {
      addedByCaller: false,
      roleId: role.id,
      permissionId: permission.id,
      assignmentId: existing.id,
      revoke: async () => {
        // Preserve pre-existing permission — intentionally no-op.
      },
    };
  }
  const assignment = await prisma.rolePermission.create({
    data: { roleId: role.id, permissionId: permission.id },
  });
  return {
    addedByCaller: true,
    roleId: role.id,
    permissionId: permission.id,
    assignmentId: assignment.id,
    revoke: async () => {
      await prisma.rolePermission.deleteMany({
        where: { id: assignment.id },
      });
    },
  };
}

export async function companyUserHasPermission(
  prisma: PrismaClient,
  options: {
    tenantCode: string;
    permissionCode: string;
  },
): Promise<boolean> {
  const company = await prisma.tenant.findUniqueOrThrow({
    where: { code: options.tenantCode },
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: {
      tenantId_code: { tenantId: company.id, code: "COMPANY_USER" },
    },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: options.permissionCode },
  });
  const existing = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
  });
  return Boolean(existing);
}
