/* eslint-env node */
/**
 * Starts a disposable backend (against DATABASE_URL_TEST) and the Vite app,
 * then runs Playwright real-stack tests with no API intercepts.
 *
 * Requires:
 * - DATABASE_URL_TEST pointing at disposable PostgreSQL
 * - JWT secrets in the environment (or .env)
 *
 * The default mocked Playwright suite is not run here.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV === "production" ? "test" : process.env.NODE_ENV || "test",
  DATABASE_URL: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
  INTEGRATION_TEST_RUNNER: "isolated-postgres",
  RATE_LIMIT_DISABLED: "true",
  LOG_LEVEL: "silent",
  PORT: "8000",
  COOKIE_SECURE: "false",
  SERVE_FRONTEND: "false",
};

const run = (cwd, command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log("Real-stack E2E: migrate + seed disposable database…");
run(backend, "npx", ["tsx", "scripts/reset-test-schema.ts"]);
run(backend, "npx", ["prisma", "migrate", "deploy"]);
run(backend, "npm", ["run", "prisma:seed:test"]);

console.log("Starting backend on :8000…");
const api = spawn("npx", ["tsx", "src/server.ts"], {
  cwd: backend,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let apiReady = false;
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/v1/health");
    if (response.ok) {
      apiReady = true;
      break;
    }
  } catch {
    // retry
  }
  await delay(500);
}

if (!apiReady) {
  console.error("Backend failed to become ready on :8000");
  api.kill("SIGTERM");
  process.exit(1);
}

console.log("Running Playwright real-stack suite…");
const playwright = spawnSync(
  "npx",
  ["playwright", "test", "-c", "playwright.real-stack.config.ts"],
  {
    cwd: frontend,
    env: {
      ...process.env,
      REAL_STACK_BASE_URL: "http://127.0.0.1:5173",
    },
    stdio: "inherit",
  },
);

api.kill("SIGTERM");
process.exit(playwright.status ?? 1);
