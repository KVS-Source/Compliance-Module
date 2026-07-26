import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { assertApprovedEvidence } from '../../utils/evidence';
import { conflict, notFound } from '../../utils/errors';
import { computeRiskScore, riskLevelFromScore } from '../../utils/risk';
import { assertTenantReference, findTenantOr404 } from '../../utils/tenant';

export function list(
  clientId: string,
  opts: { skip?: number; take?: number; status?: string; classification?: string; kpi_id?: string } = {},
) {
  return prisma.risk.findMany({
    where: {
      client_id: clientId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.classification ? { classification: opts.classification } : {}),
      ...(opts.kpi_id ? { kpi_id: opts.kpi_id } : {}),
    },
    include: { kpi: true, kpi_target: true, kpi_actual: true },
    orderBy: { risk_code: 'asc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export async function get(clientId: string, id: string) {
  const risk = await prisma.risk.findFirst({
    where: { id, client_id: clientId },
    include: { kpi: true, kpi_target: true, kpi_actual: true },
  });
  if (!risk) throw notFound('Risk not found');
  return risk;
}

async function validateRefs(clientId: string, data: Record<string, unknown>) {
  await assertTenantReference(prisma.department, data.department_id as string | undefined, clientId, 'Department');
  await assertTenantReference(prisma.user, data.owner_id as string | undefined, clientId, 'Owner');
  await assertTenantReference(prisma.kpi, data.kpi_id as string | undefined, clientId, 'KPI');
  await assertTenantReference(prisma.kpiTarget, data.kpi_target_id as string | undefined, clientId, 'KPI target');
  await assertTenantReference(prisma.kpiActual, data.kpi_actual_id as string | undefined, clientId, 'KPI actual');

  if (data.kpi_target_id) {
    const target = await prisma.kpiTarget.findFirst({
      where: {
        id: String(data.kpi_target_id),
        client_id: clientId,
        ...(data.kpi_id ? { kpi_id: String(data.kpi_id) } : {}),
      },
    });
    if (!target) throw conflict('KPI target must belong to the selected KPI and client');
  }
  if (data.kpi_actual_id) {
    const actual = await prisma.kpiActual.findFirst({
      where: {
        id: String(data.kpi_actual_id),
        client_id: clientId,
        ...(data.kpi_id ? { kpi_id: String(data.kpi_id) } : {}),
        ...(data.kpi_target_id ? { kpi_target_id: String(data.kpi_target_id) } : {}),
      },
    });
    if (!actual) throw conflict('KPI actual must belong to the selected KPI target and client');
  }
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  await validateRefs(clientId, data);

  const probability = data.probability as number;
  const impact = data.impact as number;
  const risk_score = computeRiskScore(probability, impact);
  const payload = { ...data, risk_score, risk_level: riskLevelFromScore(risk_score) };

  return prisma.$transaction(async (tx) => {
    const risk = await tx.risk.create({
      data: { client_id: clientId, ...payload } as Prisma.RiskUncheckedCreateInput,
    });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'risk',
      action: 'create',
      recordId: risk.id,
      newValue: payload,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return risk;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await findTenantOr404<{
    probability: number;
    impact: number;
    kpi_id: string | null;
    kpi_target_id: string | null;
    kpi_actual_id: string | null;
  }>(
    prisma.risk,
    id,
    clientId,
    'Risk',
  );
  await validateRefs(clientId, {
    ...data,
    kpi_id: data.kpi_id !== undefined ? data.kpi_id : existing.kpi_id,
    kpi_target_id:
      data.kpi_target_id !== undefined ? data.kpi_target_id : existing.kpi_target_id,
    kpi_actual_id:
      data.kpi_actual_id !== undefined ? data.kpi_actual_id : existing.kpi_actual_id,
  });

  if (data.status === 'closed') {
    await assertApprovedEvidence(prisma, { clientId, entityType: 'risk', entityId: id });
  }

  const payload: Record<string, unknown> = { ...data };
  if (data.probability !== undefined || data.impact !== undefined) {
    const probability = (data.probability as number | undefined) ?? existing.probability;
    const impact = (data.impact as number | undefined) ?? existing.impact;
    payload.risk_score = computeRiskScore(probability, impact);
    payload.risk_level = riskLevelFromScore(payload.risk_score as number);
  }
  if (data.status === 'closed') {
    payload.closed_at = new Date();
  } else if ('status' in data) {
    payload.closed_at = null;
  }

  return prisma.$transaction(async (tx) => {
    const risk = await tx.risk.update({ where: { id }, data: payload });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'risk',
      action: data.status === 'closed' ? 'close' : 'update',
      recordId: id,
      oldValue: existing,
      newValue: payload,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return risk;
  });
}
