import { Prisma } from "@prisma/client";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  errorHandler,
  permissionAllowed,
} from "../src/common/middleware/http.js";
import { exactOriginCors } from "../src/common/middleware/cors.js";
import { createRateLimiter } from "../src/common/middleware/rate-limit.js";
import { parseEnvironment, resolveTrustProxy } from "../src/config/env.js";
import {
  findForbiddenSecretPaths,
  sanitiseSetCookieHeader,
} from "./secret-safe-assertions.js";

const strongSecret = "synthetic-test-secret-".repeat(2);
const databaseUrl = "postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic";
const productionBase = {
  NODE_ENV: "production",
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: strongSecret,
  JWT_ISSUER: "genbioca-compliance",
  COOKIE_SECURE: "true",
  REFRESH_TOKEN_SECRET: "synthetic-refresh-secret-".repeat(2),
  TRUST_PROXY: "1",
  CORS_ORIGINS: "https://compliance.tenant.invalid",
  FRONTEND_API_URL: "/api/v1",
  PRODUCTION_DOMAIN: "compliance.tenant.invalid",
  LOCAL_UPLOAD_DIR: "/var/lib/genbioca/evidence",
  BACKUP_PATH: "/var/backups/genbioca",
  READINESS_STORAGE_CHECK: "true",
  ENABLE_API_DOCS: "false",
  ENABLE_PROTOTYPE_ROUTES: "false",
};

const appWithLimiter = (limit: number, disabled = false) => {
  const app = express();
  app.use(
    "/probe",
    createRateLimiter({ limit, windowMs: 60_000, disabled }),
    (_req, res) => res.json({ success: true, data: { ok: true } }),
  );
  return app;
};

const appThrowing = (error: unknown) => {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
};

const knownRequestError = (code: string, target: string[]) =>
  new Prisma.PrismaClientKnownRequestError("synthetic constraint failure", {
    code,
    clientVersion: "6.19.3",
    meta: { target },
  });

describe("secret-safe test assertions", () => {
  it("sanitises cookie metadata without retaining the original value", () => {
    const originalCookieValue = "synthetic-cookie-value-that-must-not-survive";
    const metadata = sanitiseSetCookieHeader(
      `genbioca_refresh=${originalCookieValue}; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=600`,
    );

    expect(metadata).toEqual({
      name: "genbioca_refresh",
      attributes: {
        names: ["httponly", "max-age", "path", "samesite", "secure"],
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        path: "/api/v1/auth",
      },
    });
    const retainsOriginalValue =
      JSON.stringify(metadata).includes(originalCookieValue);
    expect(retainsOriginalValue).toBe(false);
  });

  it("reports only forbidden property paths", () => {
    const forbiddenPaths = findForbiddenSecretPaths({
      data: {
        accessToken: "synthetic-allowed-contract-value",
        nested: {
          password_hash: "synthetic-value-that-must-not-be-reported",
          sessionSecret: "synthetic-value-that-must-not-be-reported",
        },
      },
    });

    expect(forbiddenPaths).toEqual([
      "data.nested.password_hash",
      "data.nested.sessionSecret",
    ]);
  });
});

describe("trust proxy resolution", () => {
  it("treats an unset or false value as no proxy", () => {
    expect(resolveTrustProxy("")).toBe(false);
    expect(resolveTrustProxy("false")).toBe(false);
  });

  it("reads a hop count as a number so req.ip skips exactly those proxies", () => {
    expect(resolveTrustProxy("1")).toBe(1);
    expect(resolveTrustProxy("2")).toBe(2);
  });

  it("passes named and address-based settings through unchanged", () => {
    expect(resolveTrustProxy("loopback")).toBe("loopback");
    expect(resolveTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });

  it("rejects a permissive trust proxy in production", () => {
    expect(() =>
      parseEnvironment({ ...productionBase, TRUST_PROXY: "true" }),
    ).toThrow(/TRUST_PROXY/);
  });

  it("accepts an explicit hop count in production", () => {
    expect(
      parseEnvironment({ ...productionBase, TRUST_PROXY: "1" }).TRUST_PROXY,
    ).toBe("1");
  });
});

describe("request rate limiting", () => {
  it("serves requests up to the ceiling and then refuses in the response envelope", async () => {
    const app = appWithLimiter(2);
    await request(app).get("/probe").expect(200);
    await request(app).get("/probe").expect(200);

    const blocked = await request(app).get("/probe").expect(429);
    expect(blocked.body).toEqual({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    });
  });

  it("can be disabled for the isolated test suite", async () => {
    const app = appWithLimiter(1, true);
    await request(app).get("/probe").expect(200);
    await request(app).get("/probe").expect(200);
  });

  it("refuses to disable rate limiting in production", () => {
    expect(() =>
      parseEnvironment({ ...productionBase, RATE_LIMIT_DISABLED: "true" }),
    ).toThrow(/RATE_LIMIT_DISABLED/);
  });
});

describe("production wildcard permission restriction", () => {
  it("does not authorize production requests through the legacy wildcard", () => {
    expect(permissionAllowed(["*"], "users:write", "production")).toBe(false);
    expect(
      permissionAllowed(["users:write"], "users:write", "production"),
    ).toBe(true);
    expect(permissionAllowed(["*"], "users:write", "development")).toBe(true);
  });
});

describe("browser origin policy", () => {
  const corsApp = () => {
    const app = express();
    app.use(exactOriginCors(["https://compliance.tenant.invalid"]));
    app.get("/probe", (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
  };

  it("echoes only an exact approved origin with credentials", async () => {
    const response = await request(corsApp())
      .get("/probe")
      .set("Origin", "https://compliance.tenant.invalid")
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://compliance.tenant.invalid",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers.vary).toContain("Origin");
  });

  it("rejects an unapproved origin without a wildcard response", async () => {
    const response = await request(corsApp())
      .get("/probe")
      .set("Origin", "https://unapproved.invalid")
      .expect(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("*");
  });
});

describe("Prisma error translation", () => {
  it("maps a unique violation to 409 without naming the constraint", async () => {
    const response = await request(
      appThrowing(knownRequestError("P2002", ["tenant_id", "code"])),
    )
      .get("/boom")
      .expect(409);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "CONFLICT",
        message: "A record with these details already exists",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("tenant_id");
  });

  it("maps a foreign key violation to 400", async () => {
    const response = await request(
      appThrowing(knownRequestError("P2003", ["owner_id"])),
    )
      .get("/boom")
      .expect(400);
    expect(response.body.error.code).toBe("RELATED_RECORD_INVALID");
  });

  it("still maps a missing record to 404", async () => {
    const response = await request(
      appThrowing(knownRequestError("P2025", ["id"])),
    )
      .get("/boom")
      .expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("keeps unmapped Prisma codes generic", async () => {
    const response = await request(
      appThrowing(knownRequestError("P2010", ["raw"])),
    )
      .get("/boom")
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("synthetic");
  });
});
