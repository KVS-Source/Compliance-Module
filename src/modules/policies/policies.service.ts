import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { createTenantCrud } from '../../utils/crud';
import { assertTenantReference } from '../../utils/tenant';

const crud = createTenantCrud({
  auditModule: 'policy',
  delegate: (db) => db.policy,
  orderBy: { policy_code: 'asc' },
});

export const list = crud.list;
export const get = crud.get;

async function validateRefs(clientId: string, data: Record<string, unknown>) {
  await assertTenantReference(prisma.department, data.department_id as string | undefined, clientId, 'Department');
  await assertTenantReference(prisma.user, data.owner_id as string | undefined, clientId, 'Owner');
}

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  await validateRefs(actor.user.client_id, data);
  return crud.create(actor, data);
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  await validateRefs(actor.user.client_id, data);
  return crud.update(actor, id, data);
}
