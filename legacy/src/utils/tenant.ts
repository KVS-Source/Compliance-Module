import { notFound } from './errors';

// A minimal shape shared by every Prisma model delegate we need here. Typed
// loosely on purpose to stay generic across all tenant tables.
interface TenantDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<unknown>;
}

// Fetch a record by id but only if it belongs to this client. Returns 404 for
// another client's record so we never disclose that it exists (tenant safety).
export async function findTenantOr404<T = unknown>(
  delegate: TenantDelegate,
  id: string,
  clientId: string,
  name: string,
): Promise<T> {
  const record = await delegate.findFirst({ where: { id, client_id: clientId } });
  if (!record) {
    throw notFound(`${name} not found`);
  }
  return record as T;
}

// Validate that a referenced id (department_id, owner_id, ...) belongs to this
// client before we link to it. Null/undefined references are allowed (optional).
export async function assertTenantReference(
  delegate: TenantDelegate,
  id: string | null | undefined,
  clientId: string,
  name: string,
): Promise<void> {
  if (id === null || id === undefined) return;
  const record = await delegate.findFirst({ where: { id, client_id: clientId } });
  if (!record) {
    throw notFound(`${name} not found for this client`);
  }
}
