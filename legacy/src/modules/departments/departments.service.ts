import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { createTenantCrud } from '../../utils/crud';
import { assertTenantReference } from '../../utils/tenant';

const crud = createTenantCrud({
  auditModule: 'department',
  delegate: (db) => db.department,
  orderBy: { code: 'asc' },
});

export const list = crud.list;
export const get = crud.get;

export async function create(actor: ActorContext, data: Record<string, unknown>) {
  await assertTenantReference(
    prisma.department,
    data.parent_department_id as string | undefined,
    actor.user.client_id,
    'Parent department',
  );
  return crud.create(actor, data);
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  await assertTenantReference(
    prisma.department,
    data.parent_department_id as string | undefined,
    actor.user.client_id,
    'Parent department',
  );
  return crud.update(actor, id, data);
}
