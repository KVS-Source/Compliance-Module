import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { notFound } from '../../utils/errors';
import { ACTIVE_FRAMEWORK_CODES } from '../../utils/framework-scope';
import { requireActiveFramework } from '../../utils/framework-guard';

const activeCodes = Array.from(ACTIVE_FRAMEWORK_CODES);

export function list(opts: { framework_id?: string; includeOutOfScope?: boolean } = {}) {
  return prisma.control.findMany({
    where: {
      ...(opts.framework_id ? { framework_id: opts.framework_id } : {}),
      ...(opts.includeOutOfScope
        ? {}
        : { framework: { code: { in: activeCodes }, status: 'active', is_active: true } }),
    },
    orderBy: { control_code: 'asc' },
  });
}

export async function get(id: string) {
  const control = await prisma.control.findUnique({ where: { id } });
  if (!control) {
    throw notFound('Control not found');
  }
  return control;
}

export async function create(
  actor: ActorContext,
  input: { framework_id: string; control_code: string; title: string; description?: string },
) {
  await requireActiveFramework(input.framework_id);
  return prisma.$transaction(async (tx) => {
    const control = await tx.control.create({ data: input });
    await writeAudit(tx, {
      clientId: actor.user.client_id,
      userId: actor.user.id,
      module: 'control',
      action: 'create',
      recordId: control.id,
      newValue: input,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return control;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const existing = await get(id);
  await requireActiveFramework(existing.framework_id);
  return prisma.$transaction(async (tx) => {
    const control = await tx.control.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId: actor.user.client_id,
      userId: actor.user.id,
      module: 'control',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return control;
  });
}
