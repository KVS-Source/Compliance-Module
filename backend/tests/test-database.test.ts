import { describe, expect, it } from "vitest";
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
