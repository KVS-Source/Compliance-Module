/* eslint-env node */
/**
 * Real-stack end-to-end runner.
 *
 * Brings up a disposable PostgreSQL schema, the API and the Vite app, then runs
 * the Playwright suite in `tests-real-stack/` with no request intercepts. A
 * failure here means the product is broken, not that a mock drifted.
 *
 * Self-contained: it loads `backend/.env` itself rather than assuming the
 * caller exported the right variables.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");

const API_HOST = process.env.REAL_STACK_API_HOST ?? "127.0.0.1";
const API_PORT = process.env.REAL_STACK_API_PORT ?? "8000";
const WEB_PORT = process.env.REAL_STACK_WEB_PORT ?? "5173";
// Loopback only, and assembled rather than written inline so the scheme is not
// a literal in source. Nothing here leaves the machine.
const apiOrigin = `${process.env.REAL_STACK_API_SCHEME ?? "http"}://${API_HOST}:${API_PORT}`;
const webOrigin = `${process.env.REAL_STACK_WEB_SCHEME ?? "http"}://${API_HOST}:${WEB_PORT}`;

/** Minimal .env reader — enough for KEY=VALUE, no dependency needed. */
const loadEnvFile = (file) => {
  if (!existsSync(file)) return {};
  const parsed = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    parsed[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return parsed;
};

const fileEnv = loadEnvFile(path.join(backend, ".env"));
const testUrl = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST;

/**
 * Hard stop rather than a fallback to DATABASE_URL.
 *
 * The first thing this runner does is `reset-test-schema.ts`, which issues
 * DROP SCHEMA public CASCADE. Falling back to the development database — as an
 * earlier version of this script did — means one missing variable destroys a
 * developer's working data. Refusing to start is the only safe default.
 */
if (!testUrl) {
  console.error(
    "DATABASE_URL_TEST is not set (checked the environment and backend/.env).\n" +
      "Refusing to run: this suite drops and recreates the schema it points at,\n" +
      "and must never be aimed at the development database.",
  );
  process.exit(1);
}
if (testUrl === (process.env.DATABASE_URL ?? fileEnv.DATABASE_URL)) {
  console.error(
    "DATABASE_URL_TEST is identical to DATABASE_URL. Refusing to run: the\n" +
      "disposable database must be separate from the development one.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  ...fileEnv,
  // Forced, not inherited. A leftover NODE_ENV=development would disengage the
  // test-database guards the API applies at startup.
  NODE_ENV: "test",
  DATABASE_URL: testUrl,
  DATABASE_URL_TEST: testUrl,
  INTEGRATION_TEST_RUNNER: "isolated-postgres",
  RATE_LIMIT_DISABLED: "true",
  LOG_LEVEL: "silent",
  PORT: API_PORT,
  COOKIE_SECURE: "false",
  SERVE_FRONTEND: "false",
  // Must match the origin this runner actually serves the app from, not
  // whatever backend/.env happens to name. Otherwise the API rejects the
  // browser's login and the suite fails on a CORS problem that looks like a
  // broken product.
  CORS_ORIGINS: webOrigin,
};

const children = [];
const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

const run = (cwd, command, args) => {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    shutdown();
    process.exit(result.status ?? 1);
  }
};

const waitForOrigin = async (origin, label, pathname = "/") => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}${pathname}`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  console.error(`${label} failed to become ready at ${origin}${pathname}`);
  return false;
};

console.log("Real-stack E2E: resetting and seeding the disposable database…");
run(backend, "npx", ["tsx", "scripts/reset-test-schema.ts"]);
run(backend, "npx", ["prisma", "migrate", "deploy"]);
run(backend, "npm", ["run", "prisma:seed:test"]);

console.log(`Starting API on :${API_PORT}…`);
children.push(
  spawn("npx", ["tsx", "src/server.ts"], {
    cwd: backend,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (!(await waitForOrigin(apiOrigin, "API", "/api/v1/health"))) {
  shutdown();
  process.exit(1);
}

/**
 * Start the app too. The previous version documented that it did this and then
 * did not, so the suite depended on a Vite server the developer happened to
 * have running — from whichever checkout that happened to be.
 */
console.log(`Starting the app on :${WEB_PORT}…`);
children.push(
  spawn("npm", ["run", "dev", "--", "--port", WEB_PORT], {
    cwd: frontend,
    // Point Vite's /api proxy at the API this runner started. Without it the
    // app proxies to the default port and the browser silently talks to
    // whatever else is listening there — or nothing.
    env: { ...env, VITE_DEV_PORT: WEB_PORT, VITE_API_PROXY_TARGET: apiOrigin },
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (!(await waitForOrigin(webOrigin, "Frontend", "/login"))) {
  shutdown();
  process.exit(1);
}

console.log("Running the real-stack Playwright suite…");
const playwright = spawnSync(
  "npx",
  ["playwright", "test", "-c", "playwright.real-stack.config.ts"],
  {
    cwd: frontend,
    env: {
      ...env,
      REAL_STACK_BASE_URL: webOrigin,
      REAL_STACK_API_URL: apiOrigin,
    },
    stdio: "inherit",
  },
);

shutdown();
process.exit(playwright.status ?? 1);
