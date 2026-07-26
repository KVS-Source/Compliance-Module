import { createTenantCrud } from '../../utils/crud';

// Roles are always tenant-scoped (roles.client_id is NOT NULL), so a user can
// only ever list or modify roles that belong to their own client.
const crud = createTenantCrud({
  auditModule: 'role',
  delegate: (db) => db.role,
  orderBy: { name: 'asc' },
});

export const list = crud.list;
export const get = crud.get;
export const create = crud.create;
export const update = crud.update;
