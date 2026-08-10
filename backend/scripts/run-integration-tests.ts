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

/**
 * Every integration file used to share one migrated+seeded database for the
 * whole suite. Files that create users, grant permissions, lock accounts or
 * plant evidence then leave that state for whoever runs next — which is why a
 * clean database (CI) failed tests that "passed" on a dirty local DB.
 *
 * The runner now resets the schema, re-applies migrations and reseeds before
 * each file so every file starts from the same fixture. Cost is ~3–4s of
 * migrate+seed overhead per file; the alternative is order-dependent CI.
 */
const INTEGRATION_FILES = [
  "tests/api.test.ts",
  "tests/access-role-assignment.test.ts",
  "tests/tenant-create.test.ts",
  "tests/auth-change-password.test.ts",
  "tests/users-write.test.ts",
  "tests/user-import-api.test.ts",
  "tests/user-sessions-api.test.ts",
  "tests/record-comments-api.test.ts",
  "tests/organisation-write.test.ts",
  "tests/kpi-management.test.ts",
  "tests/kpi-actuals.test.ts",
  "tests/kpi-approval.test.ts",
  "tests/risk-workflow.test.ts",
  "tests/dashboard.test.ts",
  "tests/dashboard-analytics-api.test.ts",
  "tests/governance-foundation.test.ts",
  "tests/policies-api.test.ts",
  "tests/controls-api.test.ts",
  "tests/checkpoints-api.test.ts",
  "tests/milestone4-workflow.test.ts",
  "tests/evidence-foundation.test.ts",
  "tests/evidence-api.test.ts",
  "tests/evidence-file-api.test.ts",
  "tests/evidence-link-api.test.ts",
  "tests/evidence-review-api.test.ts",
  "tests/checkpoint-evidence-gate-api.test.ts",
  "tests/policy-evidence-gate-api.test.ts",
  "tests/policy-lifecycle-lock-api.test.ts",
  "tests/kpi-evidence-gate-api.test.ts",
  "tests/kpi-evidence-concurrency-api.test.ts",
  "tests/gap-capa-api.test.ts",
  "tests/list-order-and-owner.test.ts",
  "tests/workbook-import-api.test.ts",
  "tests/registers-dashboard-api.test.ts",
  "tests/submission-modules-api.test.ts",
  "tests/final-client-completion.test.ts",
  "tests/final-client-completion-http.test.ts",
  "tests/production-initializer.test.ts",
] as const;

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
  if (!showOutput) {
    console.log(`${label} passed`);
  }
};

const prepareFreshDatabase = (label: string) => {
  run(`${label}: reset schema`, [
    "exec",
    "--",
    "tsx",
    "scripts/reset-test-schema.ts",
  ]);
  run(`${label}: migrate deploy`, [
    "exec",
    "--",
    "prisma",
    "migrate",
    "deploy",
  ]);
  run(`${label}: seed fixture`, ["run", "prisma:seed:test"]);
};

console.log("Isolated integration database safety checks passed");
console.log(
  `Running ${INTEGRATION_FILES.length} integration files with a fresh schema + seed per file`,
);

const failures: string[] = [];
const started = Date.now();

for (const [index, file] of INTEGRATION_FILES.entries()) {
  const position = `${index + 1}/${INTEGRATION_FILES.length}`;
  const label = `[${position}] ${file}`;
  console.log(`\n=== ${label} ===`);
  prepareFreshDatabase(label);

  // 60s per test: argon2 logins under full-suite load routinely exceed the
  // vitest 30s default once many files have each reseeded with password hashes.
  const result = spawnSync(
    command,
    [
      "exec",
      "--",
      "vitest",
      "run",
      "--no-file-parallelism",
      "--testTimeout",
      "60000",
      file,
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment,
      encoding: "utf8",
      stdio: "inherit",
    },
  );

  if (result.error || result.status !== 0) {
    failures.push(file);
    console.error(`${label} FAILED`);
    // Keep going so one dirty file cannot hide the next failure.
  } else {
    console.log(`${label} passed`);
  }
}

const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(
    `\nIntegration suite failed after ${elapsedSec}s. ${failures.length} file(s):`,
  );
  for (const file of failures) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log(
  `\nIntegration test suite passed (${INTEGRATION_FILES.length} files, each on a fresh fixture, ${elapsedSec}s)`,
);
