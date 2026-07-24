interface TestDatabaseEnvironment {
  nodeEnvironment?: string | undefined;
  developmentUrl?: string | undefined;
  testUrl?: string | undefined;
}

const productionLike = /(^|[._-])(prod|production|live|primary)([._-]|$)/i;
const clearlyTest = /(^|[_-])test([_-]|$)/i;
const hostedProductionLike =
  /prod|production|live|rds\.amazonaws\.com|cloudsql|supabase|neon\.tech/i;

const normalizedUrl = (value: string) => new URL(value).toString();

export const validateTestDatabaseEnvironment = ({
  nodeEnvironment,
  developmentUrl,
  testUrl,
}: TestDatabaseEnvironment) => {
  if (nodeEnvironment === "production") {
    throw new Error("Integration tests are disabled in production");
  }
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is required for integration tests");
  }

  let parsed: URL;
  try {
    parsed = new URL(testUrl);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL_TEST must target PostgreSQL");
  }
  if (
    developmentUrl &&
    normalizedUrl(testUrl) === normalizedUrl(developmentUrl)
  ) {
    throw new Error(
      "DATABASE_URL_TEST must not equal the development DATABASE_URL",
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!clearlyTest.test(databaseName)) {
    throw new Error("The integration database name must clearly contain test");
  }
  if (
    productionLike.test(databaseName) ||
    hostedProductionLike.test(parsed.hostname)
  ) {
    throw new Error("The integration database target resembles production");
  }
  return testUrl;
};
