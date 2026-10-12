/**
 * Drop and recreate the public schema so the next migrate deploy starts from
 * empty. Used between integration test files so accumulated rows, lockouts and
 * permission grants cannot leak from one file into the next.
 *
 * Requires DATABASE_URL to already point at the disposable test database
 * (the integration runner enforces that before calling this script).
 */
import { PrismaClient } from "@prisma/client";
import { validateTestDatabaseEnvironment } from "../src/config/test-database.js";

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
    !url ||
    url !== process.env.DATABASE_URL_TEST
  ) {
    throw new Error("Schema reset requires the isolated test runner and matching test database URLs");
  }
  validateTestDatabaseEnvironment({ nodeEnvironment: process.env.NODE_ENV, testUrl: url });

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
