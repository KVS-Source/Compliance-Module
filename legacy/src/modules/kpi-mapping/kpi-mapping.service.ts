import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { conflict } from '../../utils/errors';
import { requireActiveFramework } from '../../utils/framework-guard';
import { assertTenantReference, findTenantOr404 } from '../../utils/tenant';

export const mappingSequence = [
  { order: 0, key: 'policy', label: 'Policy' },
  { order: 1, key: 'framework', label: 'Framework' },
  { order: 2, key: 'rule', label: 'Rule' },
  { order: 3, key: 'evidence', label: 'Evidence' },
  { order: 4, key: 'control', label: 'Control' },
  { order: 5, key: 'kpi', label: 'KPI' },
  { order: 6, key: 'risk', label: 'Risk' },
] as const;

export function list(clientId: string, kpiId?: string) { return prisma.kpiFrameworkMapping.findMany({ where: { client_id: clientId, ...(kpiId ? { kpi_id: kpiId } : {}) }, include: { framework: true, control: true, kpi: true }, orderBy: { created_at: 'desc' } }); }
export function get(clientId: string, id: string) { return findTenantOr404(prisma.kpiFrameworkMapping, id, clientId, 'KPI mapping'); }
async function validate(clientId: string, data: Record<string, unknown>, current?: any) {
  const kpiId = String(data.kpi_id ?? current?.kpi_id ?? '');
  const frameworkId = String(data.framework_id ?? current?.framework_id ?? '');
  const kpi = await prisma.kpi.findFirst({ where: { id: kpiId, client_id: clientId, use_in_scope: true, status: 'active' } });
  if (!kpi) throw conflict('Only active, in-scope KPIs can be mapped');
  await requireActiveFramework(frameworkId);
  const controlId = data.control_id !== undefined ? data.control_id : current?.control_id;
  if (controlId) {
    const control = await prisma.control.findFirst({ where: { id: String(controlId), framework_id: frameworkId, status: 'active' } });
    if (!control) throw conflict('The control must belong to the selected active framework');
  }
  await assertTenantReference(prisma.policy, data.policy_id as string | undefined, clientId, 'Policy');
}
export async function create(actor: ActorContext, data: Record<string, unknown>) { const clientId = actor.user.client_id; await validate(clientId, data); return prisma.$transaction(async tx => { const row = await tx.kpiFrameworkMapping.create({ data: { client_id: clientId, ...data } as Prisma.KpiFrameworkMappingUncheckedCreateInput }); await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_mapping', action: 'change_mapping', recordId: row.id, newValue: data, ip: actor.ip, userAgent: actor.userAgent }); return row; }); }
export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) { const clientId = actor.user.client_id; const existing = await findTenantOr404<any>(prisma.kpiFrameworkMapping, id, clientId, 'KPI mapping'); await validate(clientId, data, existing); return prisma.$transaction(async tx => { const row = await tx.kpiFrameworkMapping.update({ where: { id }, data }); await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_mapping', action: 'change_mapping', recordId: id, oldValue: existing, newValue: data, ip: actor.ip, userAgent: actor.userAgent }); return row; }); }
export async function deactivate(actor: ActorContext, id: string) { const clientId = actor.user.client_id; const existing = await findTenantOr404<any>(prisma.kpiFrameworkMapping, id, clientId, 'KPI mapping'); return prisma.$transaction(async tx => { const row = await tx.kpiFrameworkMapping.update({ where: { id }, data: { status: 'inactive', mapping_status: 'to_be_confirmed' } }); await writeAudit(tx, { clientId, userId: actor.user.id, module: 'kpi_mapping', action: 'change_mapping', recordId: id, oldValue: existing, newValue: row, ip: actor.ip, userAgent: actor.userAgent }); return row; }); }
