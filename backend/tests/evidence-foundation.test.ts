import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

const migrationsDirectory = resolve(__dirname, "../prisma/migrations");
const readMigration = (directory: string) =>
  readFileSync(resolve(migrationsDirectory, directory, "migration.sql"), "utf8");

const milestone5MigrationSql = [
  "20260801090000_milestone_5_slice_1_evidence_foundation",
  "20260801120000_milestone_5_slice_2_evidence_content_sha_unique",
  "20260801160000_milestone_5_slice_5c_policy_evidence_gate",
  "20260801200000_milestone_5_slice_5d_kpi_evidence_gate",
]
  .map(readMigration)
  .join("\n");

describe("Milestone 5 Evidence database foundation", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  it("reconciles every Milestone 5 migration-defined enum, table, constraint, index, function and trigger with PostgreSQL", async () => {
    const expectedEnums = new Map<string, string[]>([
      [
        "EvidenceLifecycleStatus",
        ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ARCHIVED"],
      ],
      ["EvidenceDecisionOutcome", ["APPROVED", "REJECTED"]],
    ]);
    const expectedTables = [
      "evidence",
      "evidence_checkpoint_links",
      "evidence_control_links",
      "evidence_kpi_actual_links",
      "evidence_review_decisions",
    ];
    const namesFromMigration = (pattern: RegExp) =>
      [...milestone5MigrationSql.matchAll(pattern)].map((match) => match[1]);
    const expectedConstraints = namesFromMigration(/CONSTRAINT "([^"]+)"/g);
    const expectedIndexes = namesFromMigration(
      /CREATE (?:UNIQUE )?INDEX "([^"]+)"/g,
    );
    const expectedFunctions = namesFromMigration(
      /CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+)/g,
    );
    const expectedTriggers = namesFromMigration(
      /CREATE TRIGGER "([^"]+)"/g,
    );

    const enumRows = await prisma.$queryRaw<
      { name: string; values: string[] }[]
    >`
      SELECT type.typname AS name,
             array_agg(value.enumlabel ORDER BY value.enumsortorder)::text[] AS values
      FROM pg_type AS type
      JOIN pg_enum AS value ON value.enumtypid = type.oid
      JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = 'public'
        AND type.typname IN ('EvidenceLifecycleStatus', 'EvidenceDecisionOutcome')
      GROUP BY type.typname
      ORDER BY type.typname
    `;
    expect(new Map(enumRows.map((row) => [row.name, row.values]))).toEqual(
      expectedEnums,
    );

    const tableRows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT tablename AS name
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'evidence',
          'evidence_checkpoint_links',
          'evidence_control_links',
          'evidence_kpi_actual_links',
          'evidence_review_decisions'
        )
      ORDER BY tablename
    `;
    expect(tableRows.map(({ name }) => name)).toEqual(expectedTables);

    const tenantColumn = await prisma.$queryRaw<
      { column_name: string; data_type: string }[]
    >`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name = 'next_evidence_number'
    `;
    expect(tenantColumn).toEqual([
      { column_name: "next_evidence_number", data_type: "integer" },
    ]);

    const constraintRows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT constraint_record.conname AS name
      FROM pg_constraint AS constraint_record
      JOIN pg_namespace AS namespace
        ON namespace.oid = constraint_record.connamespace
      WHERE namespace.nspname = 'public'
    `;
    expect(constraintRows.map(({ name }) => name)).toEqual(
      expect.arrayContaining(expectedConstraints),
    );

    const indexRows = await prisma.$queryRaw<
      { name: string; definition: string }[]
    >`
      SELECT indexname AS name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    expect(indexRows.map(({ name }) => name)).toEqual(
      expect.arrayContaining(expectedIndexes),
    );
    const contentShaIndex = indexRows.find(
      ({ name }) => name === "evidence_tenant_content_sha256_unique",
    )?.definition;
    expect(contentShaIndex).toMatch(
      /UNIQUE INDEX .* USING btree \(tenant_id, content_sha256\) WHERE \(content_sha256 IS NOT NULL\)/,
    );

    const functionRows = await prisma.$queryRaw<
      { name: string; definition: string }[]
    >`
      SELECT procedure.proname AS name,
             pg_get_functiondef(procedure.oid) AS definition
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
    `;
    expect(functionRows.map(({ name }) => name)).toEqual(
      expect.arrayContaining(expectedFunctions),
    );

    const triggerRows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT trigger_record.tgname AS name
      FROM pg_trigger AS trigger_record
      JOIN pg_class AS table_record ON table_record.oid = trigger_record.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_record.relnamespace
      WHERE namespace.nspname = 'public'
        AND NOT trigger_record.tgisinternal
    `;
    expect(triggerRows.map(({ name }) => name)).toEqual(
      expect.arrayContaining(expectedTriggers),
    );

    const policyVersionConstraint = constraintRows.find(
      ({ name }) => name === "policy_versions_submission_fields_consistent",
    );
    expect(policyVersionConstraint).toBeTruthy();
  });

  it("blocks append-only mutation of Evidence review decisions", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const actor = await prisma.user.findFirstOrThrow({
      where: { defaultTenantId: tenant.id },
    });
    const evidence = await prisma.evidence.create({
      data: {
        tenantId: tenant.id,
        code: `EVD-RECON-${Date.now()}`,
        title: "Synthetic reconciliation Evidence",
        lifecycleStatus: "SUBMITTED",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const decision = await prisma.evidenceReviewDecision.create({
      data: {
        tenantId: tenant.id,
        evidenceId: evidence.id,
        actedById: actor.id,
        decision: "APPROVED",
        reason: "Synthetic reconciliation decision.",
      },
    });
    await expect(
      prisma.evidenceReviewDecision.update({
        where: { id: decision.id },
        data: { reason: "Forbidden mutation" },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.evidenceReviewDecision.delete({ where: { id: decision.id } }),
    ).rejects.toBeTruthy();
  });
});
