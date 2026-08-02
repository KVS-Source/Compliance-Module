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

  /**
   * Runtime proofs for typed-link database rules (not service-layer only).
   *
   * Isolation / runner responsibilities (do not re-deploy migrations here):
   * - scripts/run-integration-tests.ts validates DATABASE_URL === DATABASE_URL_TEST,
   *   sets INTEGRATION_TEST_RUNNER=isolated-postgres, deploys migrations, seeds,
   *   then runs this file against the disposable test database only.
   * - Catalogue assertions above verify migrated objects exist.
   * - This test runtime-proves uniqueness, composite tenant FKs, and RESTRICT
   *   delete semantics on the three typed Evidence link tables.
   */
  it("enforces typed-pair uniqueness, cross-tenant FKs and RESTRICT deletes on Evidence links", async () => {
    const tenantA = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const tenantB = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    const actorA = await prisma.user.findFirstOrThrow({
      where: {
        memberships: { some: { tenantId: tenantA.id, status: "ACTIVE" } },
      },
    });
    const actorB = await prisma.user.findFirstOrThrow({
      where: {
        memberships: { some: { tenantId: tenantB.id, status: "ACTIVE" } },
      },
    });
    // Codes must match ^[A-Z][A-Z0-9-]{2,79}$ (uppercase only).
    const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const evidenceA = await prisma.evidence.create({
      data: {
        tenantId: tenantA.id,
        code: `EVD-UQ-${suffix}`,
        title: "Uniqueness fixture Evidence A",
        lifecycleStatus: "DRAFT",
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const controlA = await prisma.control.create({
      data: {
        tenantId: tenantA.id,
        code: `CTL-UQ-${suffix}`,
        title: "Uniqueness fixture Control A",
        objective: "Synthetic objective",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic",
        lifecycleStatus: "ACTIVE",
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const checkpointA = await prisma.checkpoint.create({
      data: {
        tenantId: tenantA.id,
        controlId: controlA.id,
        code: `CHK-UQ-${suffix}`,
        title: "Uniqueness fixture Checkpoint A",
        expectedResult: "Synthetic",
        verificationFrequency: "MONTHLY",
        evidenceRequired: false,
        lifecycleStatus: "ACTIVE",
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });

    // Minimal KPI Actual for link uniqueness (approved target + actual shell).
    const definition = await prisma.kpiDefinition.findFirstOrThrow({
      where: { status: "ACTIVE" },
    });
    const configuration = await prisma.kpiConfiguration.create({
      data: {
        tenantId: tenantA.id,
        kpiDefinitionId: definition.id,
        productService: `UQ ${suffix}`,
        ownerId: actorA.id,
        reviewFrequency: "MONTHLY",
        requiresEvidence: false,
        requiresApproval: true,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        enabled: true,
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const target = await prisma.kpiTarget.create({
      data: {
        tenantId: tenantA.id,
        kpiConfigurationId: configuration.id,
        code: `KTG-UQ-${suffix}`,
        period: "2026-Q1",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-31T00:00:00.000Z"),
        targetValue: 100,
        approvalStatus: "APPROVED",
        submittedById: actorA.id,
        submittedAt: new Date(),
        approvedAt: new Date(),
        version: 1,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const actualA = await prisma.kpiActual.create({
      data: {
        tenantId: tenantA.id,
        code: `ACT-UQ-${suffix}`,
        kpiConfigurationId: configuration.id,
        kpiTargetId: target.id,
        period: target.period,
        periodStart: target.periodStart,
        periodEnd: target.periodEnd,
        targetValueSnapshot: target.targetValue,
        actualValue: 100,
        variance: 0,
        variancePercentage: 0,
        ragStatus: "GREEN",
        targetMet: true,
        approvalStatus: "PENDING_APPROVAL",
        submittedById: actorA.id,
        submittedAt: new Date(),
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });

    // Tenant B KPI Actual for composite FK rejection on EvidenceKpiActualLink.
    const configurationB = await prisma.kpiConfiguration.create({
      data: {
        tenantId: tenantB.id,
        kpiDefinitionId: definition.id,
        productService: `UQ-B ${suffix}`,
        ownerId: actorB.id,
        reviewFrequency: "MONTHLY",
        requiresEvidence: false,
        requiresApproval: true,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        enabled: true,
        createdById: actorB.id,
        updatedById: actorB.id,
      },
    });
    const targetB = await prisma.kpiTarget.create({
      data: {
        tenantId: tenantB.id,
        kpiConfigurationId: configurationB.id,
        code: `KTG-UQ-B-${suffix}`,
        period: "2026-Q1",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-31T00:00:00.000Z"),
        targetValue: 50,
        approvalStatus: "APPROVED",
        submittedById: actorB.id,
        submittedAt: new Date(),
        approvedAt: new Date(),
        version: 1,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        createdById: actorB.id,
        updatedById: actorB.id,
      },
    });
    const actualB = await prisma.kpiActual.create({
      data: {
        tenantId: tenantB.id,
        code: `ACT-UQ-B-${suffix}`,
        kpiConfigurationId: configurationB.id,
        kpiTargetId: targetB.id,
        period: targetB.period,
        periodStart: targetB.periodStart,
        periodEnd: targetB.periodEnd,
        targetValueSnapshot: targetB.targetValue,
        actualValue: 50,
        variance: 0,
        variancePercentage: 0,
        ragStatus: "GREEN",
        targetMet: true,
        approvalStatus: "PENDING_APPROVAL",
        submittedById: actorB.id,
        submittedAt: new Date(),
        createdById: actorB.id,
        updatedById: actorB.id,
      },
    });

    const controlLink = await prisma.evidenceControlLink.create({
      data: {
        tenantId: tenantA.id,
        evidenceId: evidenceA.id,
        controlId: controlA.id,
        isActive: true,
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const checkpointLink = await prisma.evidenceCheckpointLink.create({
      data: {
        tenantId: tenantA.id,
        evidenceId: evidenceA.id,
        checkpointId: checkpointA.id,
        isActive: true,
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });
    const kpiLink = await prisma.evidenceKpiActualLink.create({
      data: {
        tenantId: tenantA.id,
        evidenceId: evidenceA.id,
        kpiActualId: actualA.id,
        isActive: true,
        createdById: actorA.id,
        updatedById: actorA.id,
      },
    });

    // A) Typed-pair uniqueness is global for the pair
    // (tenant_id, evidence_id, target_id) — soft-link reactivation reuses the
    // row; a second physical row for the same pair is rejected.
    await expect(
      prisma.evidenceControlLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          controlId: controlA.id,
          isActive: false,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);
    await expect(
      prisma.evidenceCheckpointLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          checkpointId: checkpointA.id,
          isActive: false,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);
    await expect(
      prisma.evidenceKpiActualLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          kpiActualId: actualA.id,
          isActive: false,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);

    // B) Cross-tenant composite FK rejection on all three typed links.
    const controlB = await prisma.control.create({
      data: {
        tenantId: tenantB.id,
        code: `CTL-UQ-B-${suffix}`,
        title: "Foreign Control B",
        objective: "Cross-tenant fixture",
        implementationStatus: "NOT_STARTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic",
        lifecycleStatus: "ACTIVE",
        createdById: actorB.id,
        updatedById: actorB.id,
      },
    });
    const checkpointB = await prisma.checkpoint.create({
      data: {
        tenantId: tenantB.id,
        controlId: controlB.id,
        code: `CHK-UQ-B-${suffix}`,
        title: "Foreign Checkpoint B",
        expectedResult: "Synthetic",
        verificationFrequency: "MONTHLY",
        evidenceRequired: false,
        lifecycleStatus: "ACTIVE",
        createdById: actorB.id,
        updatedById: actorB.id,
      },
    });
    await expect(
      prisma.evidenceControlLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          controlId: controlB.id,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.evidenceCheckpointLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          checkpointId: checkpointB.id,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow();
    // Evidence A (tenant A) cannot link to Actual B (tenant B) under tenant A.
    await expect(
      prisma.evidenceKpiActualLink.create({
        data: {
          tenantId: tenantA.id,
          evidenceId: evidenceA.id,
          kpiActualId: actualB.id,
          createdById: actorA.id,
          updatedById: actorA.id,
        },
      }),
    ).rejects.toThrow();
    // Mismatched tenant_id on an otherwise same-tenant pair is also rejected.
    await expect(
      prisma.evidenceKpiActualLink.create({
        data: {
          tenantId: tenantB.id,
          evidenceId: evidenceA.id,
          kpiActualId: actualA.id,
          createdById: actorB.id,
          updatedById: actorB.id,
        },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.evidenceControlLink.count({
        where: { evidenceId: evidenceA.id, controlId: controlB.id },
      }),
    ).toBe(0);
    expect(
      await prisma.evidenceCheckpointLink.count({
        where: { evidenceId: evidenceA.id, checkpointId: checkpointB.id },
      }),
    ).toBe(0);
    expect(
      await prisma.evidenceKpiActualLink.count({
        where: { evidenceId: evidenceA.id, kpiActualId: actualB.id },
      }),
    ).toBe(0);

    // C) RESTRICT / NO ACTION: parents cannot be deleted while links exist.
    await expect(
      prisma.evidence.delete({ where: { id: evidenceA.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.control.delete({ where: { id: controlA.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.checkpoint.delete({ where: { id: checkpointA.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.kpiActual.delete({ where: { id: actualA.id } }),
    ).rejects.toThrow();

    expect(
      await prisma.evidence.findUnique({ where: { id: evidenceA.id } }),
    ).not.toBeNull();
    expect(
      await prisma.control.findUnique({ where: { id: controlA.id } }),
    ).not.toBeNull();
    expect(
      await prisma.checkpoint.findUnique({ where: { id: checkpointA.id } }),
    ).not.toBeNull();
    expect(
      await prisma.kpiActual.findUnique({ where: { id: actualA.id } }),
    ).not.toBeNull();
    expect(
      await prisma.evidenceControlLink.findUnique({
        where: { id: controlLink.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.evidenceCheckpointLink.findUnique({
        where: { id: checkpointLink.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.evidenceKpiActualLink.findUnique({
        where: { id: kpiLink.id },
      }),
    ).not.toBeNull();
  });
});
