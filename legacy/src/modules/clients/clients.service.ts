import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { notFound } from '../../utils/errors';

export function listAll() {
  return prisma.client.findMany({ orderBy: { name: 'asc' } });
}

export function getMe(clientId: string) {
  return prisma.client.findUnique({ where: { id: clientId } });
}

export async function getById(id: string) {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    throw notFound('Client not found');
  }
  return client;
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: data as Prisma.ClientUncheckedCreateInput });
    await writeAudit(tx, {
      clientId: client.id,
      userId: actor.user.id,
      module: 'client',
      action: 'create',
      recordId: client.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return client;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const existing = await getById(id);
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId: id,
      userId: actor.user.id,
      module: 'client',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return client;
  });
}
