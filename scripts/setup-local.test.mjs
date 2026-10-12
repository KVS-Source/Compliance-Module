import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, stat, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "genbioca-setup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "backend"));
  await copyFile(new URL("./setup-local.mjs", import.meta.url), join(root, "scripts/setup-local.mjs"));
  return {
    root,
    run: (overrides = {}) => spawnSync(process.execPath, [join(root, "scripts/setup-local.mjs")], {
      encoding: "utf8",
      env: { ...process.env, LOCAL_DB_PORT: "55432", LOCAL_TEST_DB_PORT: "55433", ...overrides },
    }),
  };
}

test("creates matching private configuration with independent generated secrets", async (t) => {
  const { root, run } = await fixture(t);
  const result = run();
  assert.equal(result.status, 0);
  const body = await readFile(join(root, ".env"), "utf8");
  assert.equal(body, await readFile(join(root, "backend/.env"), "utf8"));
  const config = Object.fromEntries(body.trim().split("\n").map((line) => {
    const i = line.indexOf("=");
    return [line.slice(0, i), line.slice(i + 1)];
  }));
  const secrets = [config.JWT_ACCESS_SECRET, config.REFRESH_TOKEN_SECRET, config.POSTGRES_PASSWORD, config.TEST_POSTGRES_PASSWORD];
  assert.equal(new Set(secrets).size, 4);
  assert(secrets.every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert(secrets.every((value) => !`${result.stdout}${result.stderr}`.includes(value)));
  assert.notEqual(config.DATABASE_URL, config.DATABASE_URL_TEST);
  assert.equal(config.ENABLE_PROTOTYPE_ROUTES, "false");
  if (process.platform !== "win32") {
    assert.equal((await stat(join(root, ".env"))).mode & 0o777, 0o600);
  }
  assert.notEqual(run().status, 0);
  assert.equal(body, await readFile(join(root, ".env"), "utf8"));
});

test("does not create half a configuration when an existing backend file is present", async (t) => {
  const { root, run } = await fixture(t);
  await writeFile(join(root, "backend/.env"), "PRESERVED=true\n");
  assert.notEqual(run().status, 0);
  await assert.rejects(access(join(root, ".env")));
  assert.equal(await readFile(join(root, "backend/.env"), "utf8"), "PRESERVED=true\n");
});

for (const overrides of [
  { LOCAL_DB_PORT: "invalid" },
  { LOCAL_TEST_DB_PORT: "80" },
  { LOCAL_DB_PORT: "55433" },
]) {
  test(`rejects invalid port configuration ${JSON.stringify(overrides)}`, async (t) => {
    const { root, run } = await fixture(t);
    assert.notEqual(run(overrides).status, 0);
    await assert.rejects(access(join(root, ".env")));
    await assert.rejects(access(join(root, "backend/.env")));
  });
}
