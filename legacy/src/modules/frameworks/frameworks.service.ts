import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { notFound } from '../../utils/errors';
import { ACTIVE_FRAMEWORK_CODES, isActiveFrameworkCode } from '../../utils/framework-scope';

const activeCodes = Array.from(ACTIVE_FRAMEWORK_CODES);

// Default responses contain only the nine current active frameworks. Removed
// frameworks are visible only with includeOutOfScope for admin/historical use.
export function list(includeOutOfScope = false) {
  return prisma.framework.findMany({
    where: includeOutOfScope
      ? undefined
      : { code: { in: activeCodes }, status: 'active', is_active: true },
    orderBy: { code: 'asc' },
  });
}

export async function get(id: string) {
  const framework = await prisma.framework.findUnique({ where: { id } });
  if (!framework) {
    throw notFound('Framework not found');
  }
  return framework;
}

export async function create(
  actor: ActorContext,
  input: { code: string; name: string; version: string; description?: string },
) {
  const active = isActiveFrameworkCode(input.code);
  const data = {
    ...input,
    status: active ? 'active' : 'not_in_current_scope',
    is_active: active,
  };
  return prisma.$transaction(async (tx) => {
    const framework = await tx.framework.create({ data });
    await writeAudit(tx, {
      clientId: actor.user.client_id,
      userId: actor.user.id,
      module: 'framework',
      action: 'create',
      recordId: framework.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return framework;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const existing = await get(id);
  return prisma.$transaction(async (tx) => {
    const framework = await tx.framework.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId: actor.user.client_id,
      userId: actor.user.id,
      module: 'framework',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return framework;
  });
}
