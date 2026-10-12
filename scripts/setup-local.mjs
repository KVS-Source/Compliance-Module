import { randomBytes } from "node:crypto";
import { access, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Explicit local configuration only. No database is changed and no seed runs.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [resolve(root, ".env"), resolve(root, "backend/.env")];
for (const target of targets) {
  try {
    await access(target);
    throw new Error("An environment file already exists. Review it manually; setup will not overwrite it.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const port = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer port between 1024 and 65535`);
  }
  return value;
};
const dbPort = port("LOCAL_DB_PORT", 5432);
const testPort = port("LOCAL_TEST_DB_PORT", 5433);
if (dbPort === testPort) throw new Error("Development and test database ports must differ");
const secret = () => randomBytes(32).toString("hex");
const password = secret();
const testPassword = secret();
const apiScheme = "http";
const values = {
  NODE_ENV: "development",
  PORT: 8000,
  POSTGRES_DB: "genbioca_compliance",
  POSTGRES_USER: "genbioca",
  POSTGRES_PASSWORD: password,
  POSTGRES_PORT: dbPort,
  DATABASE_URL: `postgresql://genbioca:${password}@127.0.0.1:${dbPort}/genbioca_compliance?schema=public`,
  DOCKER_DATABASE_URL: `postgresql://genbioca:${password}@postgres:5432/genbioca_compliance?schema=public`,
  TEST_POSTGRES_DB: "genbioca_delivery_test",
  TEST_POSTGRES_USER: "genbioca_test",
  TEST_POSTGRES_PASSWORD: testPassword,
  TEST_POSTGRES_PORT: testPort,
  DATABASE_URL_TEST: `postgresql://genbioca_test:${testPassword}@127.0.0.1:${testPort}/genbioca_delivery_test?schema=public`,
  JWT_ACCESS_SECRET: secret(),
  REFRESH_TOKEN_SECRET: secret(),
  JWT_ACCESS_TTL: "15m",
  JWT_ISSUER: "genbioca-compliance",
  REFRESH_TOKEN_DAYS: 7,
  COOKIE_SECURE: "false",
  TRUST_PROXY: "false",
  CORS_ORIGINS: `${apiScheme}://127.0.0.1:5173,${apiScheme}://localhost:5173`,
  FRONTEND_API_URL: "/api/v1",
  FRONTEND_DIST: "../frontend/dist",
  SERVE_FRONTEND: "true",
  ENABLE_API_DOCS: "true",
  ENABLE_PROTOTYPE_ROUTES: "false",
  FILE_STORAGE_DRIVER: "local",
  LOCAL_UPLOAD_DIR: "./uploads",
  LOG_LEVEL: "info",
};
const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
const created = [];
try {
  for (const target of targets) {
    await writeFile(target, body, { mode: 0o600, flag: "wx" });
    created.push(target);
  }
} catch (error) {
  for (const target of created) await unlink(target);
  throw error;
}
console.log("Local environment files created with generated secrets. No passwords are printed.");
console.log("Next: start PostgreSQL, run migrations, then explicitly initialize accounts or load sample data.");
