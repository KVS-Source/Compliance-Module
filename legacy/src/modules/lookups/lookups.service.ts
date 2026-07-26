import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { notFound } from '../../utils/errors';

// Lists global lookups (client_id is null) plus this client's own lookups.
export function list(clientId: string, category?: string) {
  return prisma.lookup.findMany({
    where: {
      OR: [{ client_id: null }, { client_id: clientId }],
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { sort_order: 'asc' }, { code: 'asc' }],
  });
}

export async function get(clientId: string, id: string) {
  const lookup = await prisma.lookup.findFirst({
    where: { id, OR: [{ client_id: null }, { client_id: clientId }] },
  });
  if (!lookup) {
    throw notFound('Lookup not found');
  }
  return lookup;
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  // client_id always comes from the JWT; global lookups are seeded/managed separately.
  return prisma.$transaction(async (tx) => {
    const lookup = await tx.lookup.create({
      data: { client_id: clientId, ...data } as Prisma.LookupUncheckedCreateInput,
    });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'lookup',
      action: 'create',
      recordId: lookup.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return lookup;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  // Only this client's own lookups are editable; global lookups stay read-only here.
  const existing = await prisma.lookup.findFirst({ where: { id, client_id: clientId } });
  if (!existing) {
    throw notFound('Lookup not found');
  }
  return prisma.$transaction(async (tx) => {
    const lookup = await tx.lookup.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'lookup',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return lookup;
  });
}
