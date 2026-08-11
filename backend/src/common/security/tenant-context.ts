import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Row-level security context.
 *
 * The `tenant_isolation` policy on every tenant-owned table compares
 * `tenant_id` against the `app.tenant_id` setting. That setting has to be
 * established on the same connection as the query, which in practice means the
 * same transaction — a pooled client hands out connections per operation, so a
 * session-level `SET` could leak one request's tenant into another's.
 *
 * `SET LOCAL` scopes the value to the surrounding transaction and is discarded
 * on commit or rollback, so a connection returning to the pool carries nothing.
 *
 * This is the mechanism, not yet the enforcement path: while the application
 * connects as a superuser the policies are bypassed regardless. See the
 * `20260811010000_row_level_security` migration.
 */
export const withTenantContext = <T>(
  db: PrismaClient,
  tenantId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> =>
  db.$transaction(async (tx) => {
    // Parameterised rather than interpolated: SET LOCAL takes no bind
    // parameters, so the value is cast through a parameterised SELECT first
    // and applied with set_config, which does accept one.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return work(tx);
  });

/**
 * Reads back the tenant context of the current transaction. Returns null when
 * unset, which is the state in which the policies deny every row.
 */
export const currentTenantContext = async (
  tx: Prisma.TransactionClient,
): Promise<string | null> => {
  const rows = await tx.$queryRaw<
    Array<{ tenant: string | null }>
  >`SELECT current_setting('app.tenant_id', true) AS tenant`;
  const value = rows[0]?.tenant;
  return value === undefined || value === null || value === "" ? null : value;
};
