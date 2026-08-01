import "dotenv/config";
import { spawnSync } from "node:child_process";
import { validateTestDatabaseEnvironment } from "../src/config/test-database.js";

const testUrl = validateTestDatabaseEnvironment({
  nodeEnvironment: process.env.NODE_ENV,
  developmentUrl: process.env.DATABASE_URL,
  testUrl: process.env.DATABASE_URL_TEST,
});

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testUrl,
  INTEGRATION_TEST_RUNNER: "isolated-postgres",
  LOG_LEVEL: "silent",
  // The suite signs in far more often than a human would; limiter behaviour is
  // covered separately in tests/hardening.test.ts.
  RATE_LIMIT_DISABLED: "true",
};

const redact = (value: string) =>
  value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /(JWT_ACCESS_SECRET|DATABASE_URL(?:_TEST)?)\s*[=:]\s*\S+/gi,
      "$1=[REDACTED]",
    );

const run = (label: string, argumentsList: string[], showOutput = false) => {
  const result = spawnSync(command, argumentsList, {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: "utf8",
    stdio: showOutput ? "inherit" : "pipe",
  });
  if (result.error || result.status !== 0) {
    const details = redact(
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    );
    console.error(`${label} failed${details ? `\n${details}` : ""}`);
    process.exit(result.status ?? 1);
  }
  console.log(`${label} passed`);
};

console.log("Isolated integration database safety checks passed");
run("Test database migration deployment", [
  "exec",
  "--",
  "prisma",
  "migrate",
  "deploy",
]);
run("Deterministic test fixture", ["run", "prisma:seed:test"]);
run(
  "Integration test suite",
  [
    "exec",
    "--",
    "vitest",
    "run",
    "--no-file-parallelism",
    "tests/api.test.ts",
    "tests/users-write.test.ts",
    "tests/organisation-write.test.ts",
    "tests/kpi-management.test.ts",
    "tests/kpi-actuals.test.ts",
    "tests/kpi-approval.test.ts",
    "tests/risk-workflow.test.ts",
    "tests/dashboard.test.ts",
    "tests/governance-foundation.test.ts",
    "tests/policies-api.test.ts",
    "tests/controls-api.test.ts",
    "tests/checkpoints-api.test.ts",
    "tests/milestone4-workflow.test.ts",
    "tests/evidence-api.test.ts",
    "tests/evidence-file-api.test.ts",
    "tests/evidence-link-api.test.ts",
    "tests/evidence-review-api.test.ts",
    "tests/checkpoint-evidence-gate-api.test.ts",
    "tests/policy-evidence-gate-api.test.ts",
    "tests/policy-lifecycle-lock-api.test.ts",
    "tests/kpi-evidence-gate-api.test.ts",
    "tests/kpi-evidence-concurrency-api.test.ts",
  ],
  true,
);
