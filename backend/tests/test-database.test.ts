import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { validateTestDatabaseEnvironment } from "../src/config/test-database.js";

const developmentUrl =
  "postgresql://synthetic:synthetic@127.0.0.1:5432/genbioca_development";
const testUrl =
  "postgresql://synthetic:synthetic@127.0.0.1:5433/genbioca_test";

describe("isolated integration database safety", () => {
  it("accepts a clearly isolated PostgreSQL test database", () => {
    expect(
      validateTestDatabaseEnvironment({
        nodeEnvironment: "test",
        developmentUrl,
        testUrl,
      }),
    ).toBe(testUrl);
  });

  it("rejects a missing test database URL", () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        nodeEnvironment: "test",
        developmentUrl,
      }),
    ).toThrow(/DATABASE_URL_TEST/);
  });

  it("refuses to use the normal development database", () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        nodeEnvironment: "test",
        developmentUrl,
        testUrl: developmentUrl,
      }),
    ).toThrow(/must not equal/);
  });

  it("rejects a database name that is not clearly for tests", () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        nodeEnvironment: "test",
        developmentUrl,
        testUrl:
          "postgresql://synthetic:synthetic@127.0.0.1:5433/genbioca_quality",
      }),
    ).toThrow(/clearly contain test/);
  });

  it("rejects production-like targets and production execution", () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        nodeEnvironment: "test",
        developmentUrl,
        testUrl:
          "postgresql://synthetic:synthetic@prod-db.internal:5432/genbioca_test",
      }),
    ).toThrow(/resembles production/);
    expect(() =>
      validateTestDatabaseEnvironment({
        nodeEnvironment: "production",
        developmentUrl,
        testUrl,
      }),
    ).toThrow(/disabled in production/);
  });
});

describe("schema reset entry-point safety", () => {
  it.each([
    { NODE_ENV: "development", INTEGRATION_TEST_RUNNER: "isolated-postgres", DATABASE_URL: testUrl, DATABASE_URL_TEST: testUrl },
    { NODE_ENV: "test", INTEGRATION_TEST_RUNNER: "", DATABASE_URL: testUrl, DATABASE_URL_TEST: testUrl },
    { NODE_ENV: "test", INTEGRATION_TEST_RUNNER: "isolated-postgres", DATABASE_URL: developmentUrl, DATABASE_URL_TEST: testUrl },
    { NODE_ENV: "test", INTEGRATION_TEST_RUNNER: "isolated-postgres", DATABASE_URL: developmentUrl, DATABASE_URL_TEST: developmentUrl },
    { NODE_ENV: "test", INTEGRATION_TEST_RUNNER: "isolated-postgres", DATABASE_URL: "postgresql://synthetic:synthetic@prod-db.internal:5432/genbioca_test", DATABASE_URL_TEST: "postgresql://synthetic:synthetic@prod-db.internal:5432/genbioca_test" },
  ])("refuses unsafe execution before opening a database connection %#", (overrides) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/reset-test-schema.ts"], {
      cwd: process.cwd(), env: { ...process.env, ...overrides }, encoding: "utf8", timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/isolated test runner|clearly contain test|resembles production/);
    expect(result.stderr).not.toContain(overrides.DATABASE_URL);
    expect(result.stderr).not.toMatch(/Can't reach database|ECONNREFUSED|ENOTFOUND/);
  });
});
