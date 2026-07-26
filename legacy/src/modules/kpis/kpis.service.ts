import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { assertTenantReference, findTenantOr404 } from '../../utils/tenant';

export function list(
  clientId: string,
  opts: { skip?: number; take?: number; status?: string; in_scope?: boolean } = {},
) {
  return prisma.kpi.findMany({
    where: {
      client_id: clientId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.in_scope === undefined ? {} : { use_in_scope: opts.in_scope }),
    },
    orderBy: { kpi_code: 'asc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function get(clientId: string, id: string) {
  return findTenantOr404(prisma.kpi, id, clientId, 'KPI');
}

async function validateReferences(clientId: string, data: Record<string, unknown>) {
  await assertTenantReference(prisma.user, data.owner_id as string | undefined, clientId, 'KPI owner');
  await assertTenantReference(
    prisma.department,
    data.department_id as string | undefined,
    clientId,
    'Department',
  );
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  await validateReferences(clientId, data);
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpi.create({
      data: { client_id: clientId, ...data } as Prisma.KpiUncheckedCreateInput,
    });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'kpi',
      action: 'create',
      recordId: row.id,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return row;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await findTenantOr404(prisma.kpi, id, clientId, 'KPI');
  await validateReferences(clientId, data);
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpi.update({ where: { id }, data });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'kpi',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return row;
  });
}
