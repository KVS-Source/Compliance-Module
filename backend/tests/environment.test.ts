import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";
import { assertSeedExecutionAllowed } from "../prisma/seed-safety.js";

const strongSecret = "8fd6b41004a74ce6a5342382180e76fca0bdf5aa";
const databaseUrl = "postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic";

const validDevelopment = {
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: strongSecret,
  COOKIE_SECURE: "false",
};

describe("environment validation", () => {
  it("rejects production with insecure cookies", () => {
    expect(() =>
      parseEnvironment({ ...validDevelopment, NODE_ENV: "production" }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it("rejects a missing JWT access secret", () => {
    const { JWT_ACCESS_SECRET: _removed, ...withoutSecret } = validDevelopment;
    void _removed;
    expect(() => parseEnvironment(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rejects a weak JWT access secret", () => {
    expect(() =>
      parseEnvironment({ ...validDevelopment, JWT_ACCESS_SECRET: "too-short" }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("accepts valid development configuration", () => {
    expect(parseEnvironment(validDevelopment).NODE_ENV).toBe("development");
  });

  it("accepts valid production configuration", () => {
    expect(
      parseEnvironment({
        ...validDevelopment,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
      }).NODE_ENV,
    ).toBe("production");
  });

  it("rejects unsafe placeholder secrets in production", () => {
    expect(() =>
      parseEnvironment({
        ...validDevelopment,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        JWT_ACCESS_SECRET:
          "replace-with-at-least-32-random-characters",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe("seed execution safety", () => {
  it("allows only explicit development and isolated-test modes", () => {
    expect(
      assertSeedExecutionAllowed(["--development"], "development"),
    ).toBe("development");
    expect(assertSeedExecutionAllowed(["--test-fixture"], "test")).toBe("test");
    expect(() => assertSeedExecutionAllowed([], "development")).toThrow();
    expect(() =>
      assertSeedExecutionAllowed(["--development"], "production"),
    ).toThrow(/disabled in production/);
  });
});
