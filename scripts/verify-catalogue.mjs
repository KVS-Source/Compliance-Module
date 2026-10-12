import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Read-only verification; never resets or seeds a database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "backend/package.json"));
require("dotenv").config({ path: resolve(root, "backend/.env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const key = process.argv[2] ?? "DATABASE_URL_TEST";
if (!["DATABASE_URL", "DATABASE_URL_TEST"].includes(key) || !process.env[key]) {
  throw new Error("Choose a configured DATABASE_URL or DATABASE_URL_TEST");
}
const db = new PrismaClient({ datasources: { db: { url: process.env[key] } } });
const schema = readFileSync(resolve(root, "backend/prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
  name,
  table: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name,
}));
const enums = [...schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
  name: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name,
  values: body.split("\n").map((line) => line.trim()).filter((line) => /^[A-Za-z]\w*/.test(line)).map((line) => line.match(/@map\("([^"]+)"\)/)?.[1] ?? line.split(/\s/)[0]),
}));
const migrationsRoot = resolve(root, "backend/prisma/migrations");
const migrations = readdirSync(migrationsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const sql = readFileSync(resolve(migrationsRoot, entry.name, "migration.sql"), "utf8");
  return { name: entry.name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
}).sort((a, b) => a.name.localeCompare(b.name));
const expected = { indexes: new Set(), triggers: new Set(), functions: new Set(), constraints: new Set() };
// All migration identifiers are ASCII; PostgreSQL retains their first 63 bytes.
const identifier = (name) => name.slice(0, 63);
for (const { sql } of migrations) {
  for (const match of sql.matchAll(/^\s*(CREATE|DROP)\s+(?:(?:UNIQUE|OR REPLACE|CONSTRAINT)\s+)?(INDEX|TRIGGER|FUNCTION)\s+(?:IF (?:NOT )?EXISTS\s+)?"?(\w+)"?/gm)) {
    const collection = expected[{ INDEX: "indexes", TRIGGER: "triggers", FUNCTION: "functions" }[match[2]]];
    if (match[1] === "DROP") collection.delete(identifier(match[3]));
    else collection.add(identifier(match[3]));
  }
  for (const [, name] of sql.matchAll(/(?:^\s*|ADD\s+)CONSTRAINT\s+"(\w+)"/gm)) expected.constraints.add(identifier(name));
  for (const [, name] of sql.matchAll(/DROP\s+CONSTRAINT\s+(?:IF EXISTS\s+)?"(\w+)"/g)) expected.constraints.delete(identifier(name));
}
try {
  const tables = await db.$queryRawUnsafe("SELECT tablename AS name FROM pg_tables WHERE schemaname='public'");
  const actualEnums = await db.$queryRawUnsafe("SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS values FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname");
  const applied = await db.$queryRawUnsafe('SELECT migration_name AS name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  assert.deepEqual(applied, migrations.map(({ name, checksum }) => ({ name, checksum })), "Applied migration history/checksums differ from source");
  const tableNames = new Set(tables.map((row) => row.name));
  for (const { table } of models) assert(tableNames.has(table), `Missing model table ${table}`);
  assert.equal(tableNames.size, models.length + 1, "Unexpected application tables");
  assert.deepEqual(actualEnums, [...enums].sort((a, b) => a.name.localeCompare(b.name)), "Enum names or values differ from Prisma schema");
  const queries = {
    indexes: "SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'",
    constraints: "SELECT c.conname AS name FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'",
    triggers: "SELECT t.tgname AS name, t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal",
    functions: "SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'",
  };
  const counts = {};
  for (const [kind, query] of Object.entries(queries)) {
    const rows = await db.$queryRawUnsafe(query);
    const names = new Set(rows.map((row) => row.name));
    for (const name of expected[kind]) assert(names.has(name), `Missing ${kind}: ${name}`);
    if (kind === "triggers") assert(rows.every((row) => row.enabled !== "D"), "A database safeguard trigger is disabled");
    counts[kind] = { migrationNamed: expected[kind].size, catalogueTotal: rows.length };
  }
  console.log(JSON.stringify({ result: "PASS", models: models.length, enums: enums.length, migrations: applied.length, counts }, null, 2));
} catch (error) {
  if (error.code === "ERR_ASSERTION") console.error(error.message);
  else console.error(`Catalogue query failed (${error.code ?? error.name ?? "unknown"}).`);
  console.error("Catalogue verification failed. Compare source definitions and database objects; no data was changed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
