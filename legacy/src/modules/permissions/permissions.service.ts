import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { conflict, notFound } from '../../utils/errors';
import { findTenantOr404 } from '../../utils/tenant';

// Permissions are a global catalog identified by unique code.
export function listPermissions() {
  return prisma.permission.findMany({ orderBy: { code: 'asc' } });
}

export async function createPermission(
  actor: ActorContext,
  data: { code: string; name: string; description?: string },
) {
  return prisma.$transaction(async (tx) => {
    const permission = await tx.permission.create({ data });
    await writeAudit(tx, {
      clientId: actor.user.client_id,
      userId: actor.user.id,
      module: 'permission',
      action: 'create',
      recordId: permission.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return permission;
  });
}

export async function listRolePermissions(clientId: string, roleId: string) {
  await findTenantOr404(prisma.role, roleId, clientId, 'Role');
  return prisma.permission.findMany({
    where: { role_permissions: { some: { role_id: roleId, client_id: clientId } } },
    orderBy: { code: 'asc' },
  });
}

export async function assignPermission(actor: ActorContext, roleId: string, permissionId: string) {
  const clientId = actor.user.client_id;
  await findTenantOr404(prisma.role, roleId, clientId, 'Role');
  const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
  if (!permission) {
    throw notFound('Permission not found');
  }

  const existing = await prisma.rolePermission.findFirst({
    where: { client_id: clientId, role_id: roleId, permission_id: permissionId },
  });
  if (existing) {
    throw conflict('This permission is already assigned to the role');
  }

  return prisma.$transaction(async (tx) => {
    const link = await tx.rolePermission.create({
      data: { client_id: clientId, role_id: roleId, permission_id: permissionId },
    });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'role_permission',
      action: 'assign_permission',
      recordId: link.id,
      newValue: { role_id: roleId, permission_id: permissionId },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return link;
  });
}

export async function removePermission(actor: ActorContext, roleId: string, permissionId: string) {
  const clientId = actor.user.client_id;
  await findTenantOr404(prisma.role, roleId, clientId, 'Role');
  const existing = await prisma.rolePermission.findFirst({
    where: { client_id: clientId, role_id: roleId, permission_id: permissionId },
  });
  if (!existing) {
    throw notFound('Role permission not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.delete({ where: { id: existing.id } });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'role_permission',
      action: 'remove_permission',
      recordId: existing.id,
      oldValue: existing,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  });
}
