import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

/**
 * Row-level security.
 *
 * These tests run as `genbioca_app` via SET ROLE rather than as the superuser
 * the suite connects with. That distinction is the whole point: a superuser
 * bypasses every policy, so asserting isolation on the default connection
 * would pass whether or not the policies existed.
 */
describe("row-level security", () => {
  let prisma: PrismaClient;
  let companyOne: string;
  let companyTwo: string;

  beforeAll(async () => {
    ({ prisma } = await import("../src/config/prisma.js"));
    const one = await prisma.tenant.findFirstOrThrow({
      where: { code: "COM-001" },
      select: { id: true },
    });
    const two = await prisma.tenant.findFirstOrThrow({
      where: { code: "COM-002" },
      select: { id: true },
    });
    companyOne = one.id;
    companyTwo = two.id;

    /**
     * Plant a gap in each Company rather than relying on the fixture, which
     * seeds none. Asserting isolation against an empty table passes whether or
     * not the policies work.
     */
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    for (const [index, tenantId] of [companyOne, companyTwo].entries()) {
      await prisma.gap.create({
        data: {
          tenantId,
          code: `GAP-RLS-${index + 1}-${Date.now()}`,
          title: `RLS probe ${index + 1}`,
          severity: "MINOR",
          status: "OPEN",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }
  });

  afterAll(async () => prisma.$disconnect());

  /** Runs `work` inside a transaction acting as the restricted app role. */
  const asAppRole = <T>(
    tenantId: string | null,
    work: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE genbioca_app");
      if (tenantId) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return work(tx as unknown as PrismaClient);
    });

  const countGaps = async (tx: PrismaClient) => {
    const rows = await tx.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) AS count FROM gaps`;
    return Number(rows[0]?.count ?? 0);
  };

  it("enables and forces a tenant policy on every tenant-owned table", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ table_name: string; enabled: boolean; forced: boolean }>
    >`
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled,
             c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname
    `;
    expect(rows.length).toBeGreaterThan(30);
    const unprotected = rows.filter((row) => !row.enabled || !row.forced);
    expect(unprotected.map((row) => row.table_name)).toEqual([]);

    // FORCE matters as much as ENABLE: without it the table owner bypasses
    // its own policy, which is most connections in practice.
    const policies = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
    `;
    const covered = new Set(policies.map((row) => row.tablename));
    const missing = rows
      .map((row) => row.table_name)
      .filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  it("shows only the Company in context", async () => {
    const [inCompanyOne, inCompanyTwo] = await Promise.all([
      asAppRole(companyOne, countGaps),
      asAppRole(companyTwo, countGaps),
    ]);
    const total = await countGaps(prisma);

    // Each Company sees its own planted row and not the other's, and neither
    // sees the whole table.
    expect(inCompanyOne).toBeGreaterThan(0);
    expect(inCompanyTwo).toBeGreaterThan(0);
    expect(inCompanyOne).toBeLessThan(total);
    expect(inCompanyTwo).toBeLessThan(total);

    const foreign = await asAppRole(companyOne, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) AS count FROM gaps WHERE tenant_id = ${companyTwo}::uuid`;
      return Number(rows[0]?.count ?? 0);
    });
    // Asking directly for the other Company's rows still returns nothing.
    expect(foreign).toBe(0);
  });

  it("returns nothing when no tenant context was established", async () => {
    // Fail closed: a request that never set its tenant must read nothing
    // rather than everything.
    expect(await asAppRole(null, countGaps)).toBe(0);
  });

  it("refuses a write that would land in another Company", async () => {
    await expect(
      asAppRole(companyOne, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO gaps (id, tenant_id, code, title, severity, status,
                            created_by_id, updated_by_id, created_at, updated_at)
          SELECT gen_random_uuid(), ${companyTwo}::uuid, 'GAP-RLS-X', 'Cross tenant',
                 'MINOR', 'OPEN', u.id, u.id, now(), now()
          FROM users u LIMIT 1
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("is bypassed by the superuser the application currently connects as", async () => {
    /**
     * Not a nice-to-have assertion — it is the honest statement of what is and
     * is not protected today. The policies above are real and proven, but they
     * do nothing until DATABASE_URL uses `genbioca_app`. If this test ever
     * fails because the suite stopped connecting as a superuser, that is good
     * news: delete it and update known-limitations item 2.
     */
    const rows = await prisma.$queryRaw<Array<{ superuser: boolean }>>`
      SELECT usesuper AS superuser FROM pg_user WHERE usename = current_user
    `;
    expect(rows[0]?.superuser).toBe(true);
    // Same query, no tenant context, superuser connection: rows come back.
    expect(await countGaps(prisma)).toBeGreaterThan(0);
  });
});
