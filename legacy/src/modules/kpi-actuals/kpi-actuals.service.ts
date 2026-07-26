import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { assertApprovedEvidence } from '../../utils/evidence';
import { conflict, notFound } from '../../utils/errors';
import { computeRag, computeVariance } from '../../utils/kpi';
import { findTenantOr404 } from '../../utils/tenant';

export function list(clientId: string, opts: { skip?: number; take?: number; kpi_id?: string; approval_status?: string } = {}) {
  return prisma.kpiActual.findMany({ where: { client_id: clientId, ...(opts.kpi_id ? { kpi_id: opts.kpi_id } : {}), ...(opts.approval_status ? { approval_status: opts.approval_status } : {}) }, include: { kpi: true, kpi_target: true, risks: true }, orderBy: { created_at: 'desc' }, skip: opts.skip, take: opts.take });
}
export async function get(clientId: string, id: string) {
  const row = await prisma.kpiActual.findFirst({
    where: { id, client_id: clientId },
    include: { kpi: true, kpi_target: true, risks: true },
  });
  if (!row) throw notFound('KPI actual not found');
  return row;
}

async function kpiFor(clientId: string, id: string) {
  const kpi = await prisma.kpi.findFirst({ where: { id, client_id: clientId } });
  if (!kpi) throw conflict('The selected KPI does not belong to this client');
  if (!kpi.use_in_scope || kpi.status !== 'active') throw conflict('Actuals cannot be entered for an out-of-scope or inactive KPI');
  return kpi;
}
async function validateTarget(clientId: string, targetId: unknown, kpiId: string) {
  if (!targetId) return;
  const target = await prisma.kpiTarget.findFirst({ where: { id: String(targetId), client_id: clientId, kpi_id: kpiId } });
  if (!target) throw conflict('The KPI target does not belong to this KPI and client');
}
function calculations(direction: string, target: number, actual: number) {
  return { variance: computeVariance(actual, target), rag_status: computeRag(direction, target, actual) };
}
export async function create(actor: ActorContext, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const kpi = await kpiFor(clientId, String(data.kpi_id));
  await validateTarget(clientId, data.kpi_target_id, kpi.id);
  const payload = { ...data, ...calculations(kpi.direction, Number(data.target_value), Number(data.actual_value)) };
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpiActual.create({ data: { client_id: clientId, ...payload } as Prisma.KpiActualUncheckedCreateInput });
    await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_actual', action: 'create', recordId: row.id, newValue: payload, ip: actor.ip, userAgent: actor.userAgent });
    return row;
  });
}
export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await findTenantOr404<any>(prisma.kpiActual, id, clientId, 'KPI actual');
  if (existing.approval_status === 'approved') throw conflict('An approved KPI actual cannot be edited');
  const kpi = await kpiFor(clientId, existing.kpi_id);
  await validateTarget(clientId, data.kpi_target_id, kpi.id);
  const target = Number(data.target_value ?? existing.target_value);
  const actual = Number(data.actual_value ?? existing.actual_value);
  const payload = { ...data, ...calculations(kpi.direction, target, actual) };
  return mutate(actor, existing, payload, 'update');
}
async function mutate(actor: ActorContext, existing: any, data: Record<string, unknown>, action: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpiActual.update({ where: { id: existing.id }, data });
    await writeAudit(tx, { clientId: actor.user.client_id, userId: actor.user.id, module: 'kpi_actual', action, recordId: existing.id, oldValue: existing, newValue: data, ip: actor.ip, userAgent: actor.userAgent });
    return row;
  });
}
export async function submit(actor: ActorContext, id: string) {
  const row = await findTenantOr404<any>(prisma.kpiActual, id, actor.user.client_id, 'KPI actual');
  if (row.approval_status === 'approved') throw conflict('This KPI actual is already approved');
  return mutate(actor, row, { status: 'submitted', approval_status: 'pending', submitted_by: actor.user.id }, 'submit');
}
export async function approve(actor: ActorContext, id: string) {
  const row = await findTenantOr404<any>(prisma.kpiActual, id, actor.user.client_id, 'KPI actual');
  if (row.evidence_required) await assertApprovedEvidence(prisma, { clientId: actor.user.client_id, entityType: 'kpi_actual', entityId: id });
  return mutate(actor, row, { status: 'approved', approval_status: 'approved', reviewed_by: actor.user.id, reviewed_at: new Date() }, 'approve');
}
export async function reject(actor: ActorContext, id: string, reason: string) {
  const row = await findTenantOr404<any>(prisma.kpiActual, id, actor.user.client_id, 'KPI actual');
  return mutate(actor, row, { status: 'rejected', approval_status: 'rejected', reviewed_by: actor.user.id, reviewed_at: new Date(), comments: reason }, 'reject');
}

export async function createRiskFromActual(
  actor: ActorContext,
  id: string,
  input: {
    risk_code: string;
    classification: 'major' | 'minor';
    risk_title?: string;
    risk_description?: string;
    department_id?: string;
    owner_id?: string;
    mitigation_plan?: string;
    due_date?: Date;
  },
) {
  const clientId = actor.user.client_id;
  const actual = await prisma.kpiActual.findFirst({
    where: { id, client_id: clientId },
    include: { kpi: true, kpi_target: true },
  });
  if (!actual) throw notFound('KPI actual not found');
  if (actual.rag_status === 'green') {
    throw conflict('A risk can be created here only when the KPI target has not been met');
  }
  const existingRisk = await prisma.risk.findFirst({
    where: { client_id: clientId, kpi_actual_id: actual.id, status: { not: 'closed' } },
  });
  if (existingRisk) {
    throw conflict('An open risk already exists for this KPI actual');
  }

  const probability = input.classification === 'major' ? 4 : 2;
  const impact = input.classification === 'major' ? 4 : 2;
  const riskScore = probability * impact;
  const payload = {
    client_id: clientId,
    kpi_id: actual.kpi_id,
    kpi_target_id: actual.kpi_target_id,
    kpi_actual_id: actual.id,
    risk_code: input.risk_code,
    risk_title: input.risk_title ?? `${actual.kpi.kpi_code} target not met for ${actual.period}`,
    risk_description:
      input.risk_description ??
      `Target ${actual.target_value.toString()} ${actual.kpi.unit ?? ''}; actual ${actual.actual_value.toString()} ${actual.kpi.unit ?? ''}.`,
    classification: input.classification,
    department_id: input.department_id ?? actual.kpi.department_id,
    owner_id: input.owner_id ?? actual.kpi.owner_id,
    probability,
    impact,
    risk_score: riskScore,
    risk_level: input.classification,
    mitigation_plan: input.mitigation_plan,
    due_date: input.due_date,
    status: 'open',
  };

  return prisma.$transaction(async (tx) => {
    const risk = await tx.risk.create({ data: payload });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'risk',
      action: 'create_from_kpi_failure',
      recordId: risk.id,
      newValue: payload,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return risk;
  });
}
