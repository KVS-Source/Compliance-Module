import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";
import { assertSeedExecutionAllowed } from "../prisma/seed-safety.js";
import { assertDemoSeedExecutionAllowed } from "../prisma/demo-seed-safety.js";
import { refreshCookieOptions } from "../src/modules/auth/routes.js";
import { createFileStorageProvider } from "../src/providers/file-storage/file-storage.js";

const backendRoot = process.cwd();
const repositoryRoot = resolve(backendRoot, "..");
const strongSecret = "8fd6b41004a74ce6a5342382180e76fca0bdf5aa";
const databaseUrl = "postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic";

const validDevelopment = {
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: strongSecret,
  JWT_ISSUER: "genbioca-compliance-development",
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

  it("requires a non-empty JWT issuer", () => {
    const { JWT_ISSUER: _removed, ...withoutIssuer } = validDevelopment;
    void _removed;
    expect(() => parseEnvironment(withoutIssuer)).toThrow(/JWT_ISSUER/);
    expect(() =>
      parseEnvironment({ ...validDevelopment, JWT_ISSUER: "   " }),
    ).toThrow(/JWT_ISSUER/);
  });

  it.each(["15", "0m", "-1h", "soon", "1 hour", "1.5h"])(
    "rejects unsupported JWT access TTL syntax %s",
    (JWT_ACCESS_TTL) => {
      expect(() =>
        parseEnvironment({ ...validDevelopment, JWT_ACCESS_TTL }),
      ).toThrow(/JWT_ACCESS_TTL/);
    },
  );

  it.each(["30s", "15m", "2h", "7d", "1w"])(
    "accepts supported JWT access TTL syntax %s",
    (JWT_ACCESS_TTL) => {
      expect(
        parseEnvironment({ ...validDevelopment, JWT_ACCESS_TTL })
          .JWT_ACCESS_TTL,
      ).toBe(JWT_ACCESS_TTL);
    },
  );

  it("accepts valid development configuration", () => {
    expect(parseEnvironment(validDevelopment).NODE_ENV).toBe("development");
  });

  it("accepts valid production configuration", () => {
    expect(
      parseEnvironment({
        ...validDevelopment,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        JWT_ISSUER: "genbioca-compliance",
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

  it("rejects unsafe placeholder issuers in production", () => {
    expect(() =>
      parseEnvironment({
        ...validDevelopment,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        JWT_ISSUER: "replace-me-example",
      }),
    ).toThrow(/JWT_ISSUER/);
  });

  it("makes the production refresh cookie HttpOnly, Secure and SameSite=Strict", () => {
    const production = parseEnvironment({
      ...validDevelopment,
      NODE_ENV: "production",
      COOKIE_SECURE: "true",
      JWT_ISSUER: "genbioca-compliance",
    });
    expect(refreshCookieOptions(production)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
  });

  it("fails closed for unknown and unimplemented storage providers", () => {
    expect(() =>
      parseEnvironment({
        ...validDevelopment,
        FILE_STORAGE_DRIVER: "unknown",
      }),
    ).toThrow(/FILE_STORAGE_DRIVER/);
    expect(() =>
      parseEnvironment({ ...validDevelopment, FILE_STORAGE_DRIVER: "s3" }),
    ).toThrow(/recognised but not implemented/);
    expect(() =>
      createFileStorageProvider({
        driver: "unknown",
        localRoot: "/synthetic/not-used",
      }),
    ).toThrow(/Unknown FILE_STORAGE_DRIVER/);
    expect(() =>
      createFileStorageProvider({
        driver: "s3",
        localRoot: "/synthetic/not-used",
      }),
    ).toThrow(/recognised but not implemented/);
  });

  it("supports the configured local storage provider", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "genbioca-storage-test-"));
    const provider = createFileStorageProvider({
      driver: "local",
      localRoot: root,
    });
    try {
      const content = Buffer.from("synthetic evidence");
      await expect(
        provider.put("tenant/evidence.txt", content, "text/plain"),
      ).resolves.toMatchObject({
        key: "tenant/evidence.txt",
        size: content.length,
        contentType: "text/plain",
      });
      await expect(provider.get("tenant/evidence.txt")).resolves.toEqual(
        content,
      );
      await expect(provider.delete("tenant/evidence.txt")).resolves.toBe(
        undefined,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

describe("demo seed execution safety", () => {
  it("allows approved non-production modes with a strong runtime password", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(
        assertDemoSeedExecutionAllowed({
          NODE_ENV,
          DEMO_SEED_PASSWORD: "Synthetic-Only-001!",
        }),
      ).toEqual({ password: "Synthetic-Only-001!" });
    }
  });

  it("rejects missing or weak demo credentials", () => {
    expect(() =>
      assertDemoSeedExecutionAllowed({ NODE_ENV: "development" }),
    ).toThrow(/DEMO_SEED_PASSWORD/);
    expect(() =>
      assertDemoSeedExecutionAllowed({
        NODE_ENV: "development",
        DEMO_SEED_PASSWORD: "too-short",
      }),
    ).toThrow(/DEMO_SEED_PASSWORD/);
  });

  it("always rejects production, including the retired override input", () => {
    expect(() =>
      assertDemoSeedExecutionAllowed({
        NODE_ENV: "production",
        DEMO_SEED_PASSWORD: "Synthetic-Only-001!",
      }),
    ).toThrow(/disabled in production/);

    const retiredOverrideEnvironment = {
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_PASSWORD: "Synthetic-Only-001!",
    };
    expect(() =>
      assertDemoSeedExecutionAllowed(retiredOverrideEnvironment),
    ).toThrow(/disabled in production/);
  });

  it("rejects missing or unapproved execution modes", () => {
    expect(() =>
      assertDemoSeedExecutionAllowed({
        DEMO_SEED_PASSWORD: "Synthetic-Only-001!",
      }),
    ).toThrow(/only in development or test/);
    expect(() =>
      assertDemoSeedExecutionAllowed({
        NODE_ENV: "staging",
        DEMO_SEED_PASSWORD: "Synthetic-Only-001!",
      }),
    ).toThrow(/only in development or test/);
  });

  it("is never invoked by application, Docker, or Compose startup", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(backendRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const startupSources = [
      packageJson.scripts.start,
      packageJson.scripts["start:docker"],
      readFileSync(resolve(backendRoot, "src/server.ts"), "utf8"),
      readFileSync(resolve(backendRoot, "src/app.ts"), "utf8"),
      readFileSync(resolve(backendRoot, "Dockerfile"), "utf8"),
      readFileSync(resolve(repositoryRoot, "docker-compose.yml"), "utf8"),
    ].join("\n");

    expect(startupSources).not.toMatch(/seed:demo|demo-seed/);
  });
});
