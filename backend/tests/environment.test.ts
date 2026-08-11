import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";
import { assertSeedExecutionAllowed } from "../prisma/seed-safety.js";
import { assertSampleSeedExecutionAllowed } from "../prisma/sample-seed-safety.js";
import { refreshCookieOptions } from "../src/modules/auth/routes.js";
import { createFileStorageProvider } from "../src/providers/file-storage/file-storage.js";
import { databaseRuntimeUrl } from "../src/config/prisma.js";

const backendRoot = process.cwd();
const repositoryRoot = resolve(backendRoot, "..");
const strongSecret = "8fd6b41004a74ce6a5342382180e76fca0bdf5aa";
const refreshSecret = "2d4686e0060d42dc91b9ed4bda9d0ce499cb372a";
const databaseUrl = "postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic";

const validDevelopment = {
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: strongSecret,
  JWT_ISSUER: "genbioca-compliance-development",
  COOKIE_SECURE: "false",
};
const validProduction = {
  ...validDevelopment,
  NODE_ENV: "production",
  JWT_ISSUER: "genbioca-client-release",
  COOKIE_SECURE: "true",
  REFRESH_TOKEN_SECRET: refreshSecret,
  TRUST_PROXY: "1",
  CORS_ORIGINS: "https://compliance.client.invalid",
  FRONTEND_API_URL: "/api/v1",
  PRODUCTION_DOMAIN: "compliance.client.invalid",
  LOCAL_UPLOAD_DIR: "/var/lib/genbioca/evidence",
  BACKUP_PATH: "/var/backups/genbioca",
  READINESS_STORAGE_CHECK: "true",
  ENABLE_API_DOCS: "false",
  ENABLE_PROTOTYPE_ROUTES: "false",
  LOG_LEVEL: "info",
};

describe("environment validation", () => {
  it("rejects production with insecure cookies", () => {
    expect(() =>
      parseEnvironment({ ...validProduction, COOKIE_SECURE: "false" }),
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
    expect(parseEnvironment(validProduction).NODE_ENV).toBe("production");
  });

  it("rejects unsafe placeholder secrets in production", () => {
    expect(() =>
      parseEnvironment({
        ...validProduction,
        JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rejects unsafe placeholder issuers in production", () => {
    expect(() =>
      parseEnvironment({
        ...validProduction,
        JWT_ISSUER: "replace-me-example",
      }),
    ).toThrow(/JWT_ISSUER/);
  });

  it("makes the production refresh cookie HttpOnly, Secure and SameSite=Strict", () => {
    const production = parseEnvironment(validProduction);
    expect(refreshCookieOptions(production)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
  });

  it("requires separate non-placeholder access and refresh secrets in production", () => {
    const { REFRESH_TOKEN_SECRET: _removed, ...missingRefresh } =
      validProduction;
    void _removed;
    expect(() => parseEnvironment(missingRefresh)).toThrow(
      /REFRESH_TOKEN_SECRET/,
    );
    expect(() =>
      parseEnvironment({
        ...validProduction,
        REFRESH_TOKEN_SECRET: validProduction.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/must be different/);
    expect(() =>
      parseEnvironment({
        ...validProduction,
        REFRESH_TOKEN_SECRET: "replace-with-a-refresh-secret-value-now",
      }),
    ).toThrow(/REFRESH_TOKEN_SECRET/);
  });

  it("requires an exact HTTPS CORS allowlist and a safe production API URL", () => {
    expect(() =>
      parseEnvironment({ ...validProduction, CORS_ORIGINS: "" }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      parseEnvironment({ ...validProduction, CORS_ORIGINS: "*" }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      parseEnvironment({
        ...validProduction,
        FRONTEND_API_URL: "http://localhost:8000/api/v1",
      }),
    ).toThrow(/FRONTEND_API_URL/);
    for (const FRONTEND_API_URL of [
      "//unapproved.invalid/api/v1",
      "/\\unapproved.invalid/api/v1",
      "http://api.client.invalid/api/v1",
      "https://user:password@api.client.invalid/api/v1",
      "/api/v1?redirect=https://unapproved.invalid",
    ]) {
      expect(() =>
        parseEnvironment({ ...validProduction, FRONTEND_API_URL }),
      ).toThrow(/FRONTEND_API_URL/);
    }
    expect(
      parseEnvironment({
        ...validProduction,
        FRONTEND_API_URL: "https://api.client.invalid/api/v1",
      }).FRONTEND_API_URL,
    ).toBe("https://api.client.invalid/api/v1");
  });

  it("requires persistent absolute storage and backup paths in production", () => {
    expect(() =>
      parseEnvironment({ ...validProduction, LOCAL_UPLOAD_DIR: "./uploads" }),
    ).toThrow(/LOCAL_UPLOAD_DIR/);
    expect(() =>
      parseEnvironment({ ...validProduction, BACKUP_PATH: "./backups" }),
    ).toThrow(/BACKUP_PATH/);
  });

  it("rejects production documentation, prototype and non-auditable logging", () => {
    expect(() =>
      parseEnvironment({ ...validProduction, ENABLE_API_DOCS: "true" }),
    ).toThrow(/ENABLE_API_DOCS/);
    expect(() =>
      parseEnvironment({
        ...validProduction,
        ENABLE_PROTOTYPE_ROUTES: "true",
      }),
    ).toThrow(/ENABLE_PROTOTYPE_ROUTES/);
    expect(() =>
      parseEnvironment({ ...validProduction, LOG_LEVEL: "silent" }),
    ).toThrow(/LOG_LEVEL/);
  });

  it("accepts only a supported non-empty Evidence extension subset", () => {
    expect(
      parseEnvironment({
        ...validProduction,
        EVIDENCE_ALLOWED_EXTENSIONS: ".pdf,.xlsx",
      }).EVIDENCE_ALLOWED_EXTENSIONS,
    ).toBe(".pdf,.xlsx");
    expect(() =>
      parseEnvironment({
        ...validProduction,
        EVIDENCE_ALLOWED_EXTENSIONS: ".exe",
      }),
    ).toThrow(/EVIDENCE_ALLOWED_EXTENSIONS/);
  });

  it("fails closed for unknown storage providers and unconfigured S3", () => {
    expect(() =>
      parseEnvironment({
        ...validDevelopment,
        FILE_STORAGE_DRIVER: "unknown",
      }),
    ).toThrow(/FILE_STORAGE_DRIVER/);
    expect(() =>
      parseEnvironment({
        ...validDevelopment,
        FILE_STORAGE_DRIVER: "s3",
      }),
    ).toThrow(/S3_BUCKET/);
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
        s3: { bucket: "test-bucket", region: "us-east-1" },
      }),
    ).toThrow(/requires an S3 client/);
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

describe("production database runtime URL", () => {
  it("adds bounded pool and connection timeouts without replacing operator values", () => {
    const configured = new URL(
      databaseRuntimeUrl(`${databaseUrl}?schema=public`, {
        connectionLimit: 12,
        poolTimeoutSeconds: 7,
        connectTimeoutSeconds: 4,
      }),
    );
    expect(configured.searchParams.get("schema")).toBe("public");
    expect(configured.searchParams.get("connection_limit")).toBe("12");
    expect(configured.searchParams.get("pool_timeout")).toBe("7");
    expect(configured.searchParams.get("connect_timeout")).toBe("4");

    const preserved = new URL(
      databaseRuntimeUrl(`${databaseUrl}?connection_limit=3`, {
        connectionLimit: 12,
        poolTimeoutSeconds: 7,
        connectTimeoutSeconds: 4,
      }),
    );
    expect(preserved.searchParams.get("connection_limit")).toBe("3");
  });
});

describe("seed execution safety", () => {
  it("allows only explicit development and isolated-test modes", () => {
    expect(assertSeedExecutionAllowed(["--development"], "development")).toBe(
      "development",
    );
    expect(assertSeedExecutionAllowed(["--test-fixture"], "test")).toBe("test");
    expect(() => assertSeedExecutionAllowed([], "development")).toThrow();
    expect(() =>
      assertSeedExecutionAllowed(["--development"], "production"),
    ).toThrow(/disabled in production/);
  });
});

describe("sample seed execution safety", () => {
  it("allows approved non-production modes with a strong runtime password", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(
        assertSampleSeedExecutionAllowed({
          NODE_ENV,
          SAMPLE_SEED_PASSWORD: "Synthetic-Only-001!",
        }),
      ).toEqual({ password: "Synthetic-Only-001!" });
    }
  });

  it("rejects missing or weak sample credentials", () => {
    expect(() =>
      assertSampleSeedExecutionAllowed({ NODE_ENV: "development" }),
    ).toThrow(/SAMPLE_SEED_PASSWORD/);
    expect(() =>
      assertSampleSeedExecutionAllowed({
        NODE_ENV: "development",
        SAMPLE_SEED_PASSWORD: "too-short",
      }),
    ).toThrow(/SAMPLE_SEED_PASSWORD/);
  });

  it("always rejects production, including the retired override input", () => {
    expect(() =>
      assertSampleSeedExecutionAllowed({
        NODE_ENV: "production",
        SAMPLE_SEED_PASSWORD: "Synthetic-Only-001!",
      }),
    ).toThrow(/disabled in production/);

    const retiredOverrideEnvironment = {
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      SAMPLE_SEED_PASSWORD: "Synthetic-Only-001!",
    };
    expect(() =>
      assertSampleSeedExecutionAllowed(retiredOverrideEnvironment),
    ).toThrow(/disabled in production/);
  });

  it("rejects missing or unapproved execution modes", () => {
    expect(() =>
      assertSampleSeedExecutionAllowed({
        SAMPLE_SEED_PASSWORD: "Synthetic-Only-001!",
      }),
    ).toThrow(/only in development or test/);
    expect(() =>
      assertSampleSeedExecutionAllowed({
        NODE_ENV: "staging",
        SAMPLE_SEED_PASSWORD: "Synthetic-Only-001!",
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

    expect(startupSources).not.toMatch(/seed:sample|sample-seed/);
  });
});
