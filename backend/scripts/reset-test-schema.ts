/**
 * Drop and recreate the public schema so the next migrate deploy starts from
 * empty. Used between integration test files so accumulated rows, lockouts and
 * permission grants cannot leak from one file into the next.
 *
 * Requires DATABASE_URL to already point at the disposable test database
 * (the integration runner enforces that before calling this script).
 */
import { PrismaClient } from "@prisma/client";

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to reset the test schema");
  }

  const db = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await db.$disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
