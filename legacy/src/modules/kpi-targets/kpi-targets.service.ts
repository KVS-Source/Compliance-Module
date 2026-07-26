import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { conflict } from '../../utils/errors';
import { assertTenantReference, findTenantOr404 } from '../../utils/tenant';

export function list(clientId: string, opts: { skip?: number; take?: number; kpi_id?: string } = {}) {
  return prisma.kpiTarget.findMany({
    where: { client_id: clientId, ...(opts.kpi_id ? { kpi_id: opts.kpi_id } : {}) },
    include: { kpi: true },
    orderBy: { created_at: 'desc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function get(clientId: string, id: string) {
  return findTenantOr404(prisma.kpiTarget, id, clientId, 'KPI target');
}

async function validate(clientId: string, data: Record<string, unknown>, currentKpiId?: string) {
  const kpiId = (data.kpi_id as string | undefined) ?? currentKpiId;
  if (kpiId) {
    const kpi = await prisma.kpi.findFirst({ where: { id: kpiId, client_id: clientId } });
    if (!kpi) throw conflict('The selected KPI does not belong to this client');
    if (!kpi.use_in_scope || kpi.status !== 'active') {
      throw conflict('Targets cannot be configured for an out-of-scope or inactive KPI');
    }
  }
  await assertTenantReference(prisma.user, data.owner_id as string | undefined, clientId, 'Owner');
  await assertTenantReference(
    prisma.department,
    data.department_id as string | undefined,
    clientId,
    'Department',
  );
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  await validate(clientId, data);
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpiTarget.create({
      data: { client_id: clientId, ...data } as Prisma.KpiTargetUncheckedCreateInput,
    });
    await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_target', action: 'create', recordId: row.id, newValue: data, ip: actor.ip, userAgent: actor.userAgent });
    return row;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await findTenantOr404<{ kpi_id: string }>(prisma.kpiTarget, id, clientId, 'KPI target');
  await validate(clientId, data, existing.kpi_id);
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpiTarget.update({ where: { id }, data });
    await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_target', action: 'update', recordId: id, oldValue: existing, newValue: data, ip: actor.ip, userAgent: actor.userAgent });
    return row;
  });
}
