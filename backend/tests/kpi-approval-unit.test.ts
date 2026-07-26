import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  KpiActualRecord,
  KpiActualRepository,
  KpiActualTransactionRepository,
} from "../src/modules/kpis/actual-repository.js";
import { KpiActualService } from "../src/modules/kpis/actual-service.js";
import {
  approveKpiActualSchema,
  rejectKpiActualSchema,
  resubmitKpiActualSchema,
} from "../src/modules/kpis/actual-validators.js";
import { EvidenceGateService } from "../src/modules/kpis/evidence-gate-service.js";
import type { KpiPerformanceService } from "../src/modules/kpis/performance-service.js";
import type { RiskService } from "../src/modules/risks/service.js";

const actualForWorkflow = (
  approvalStatus: KpiActualRecord["approvalStatus"],
  options: {
    submittedById?: string;
    approverId?: string | null;
    requiresApproval?: boolean;
    requiresEvidence?: boolean;
  } = {},
) =>
  ({
    id: "10000000-0000-4000-8000-000000000001",
    approvalStatus,
    submittedById:
      options.submittedById ?? "10000000-0000-4000-8000-000000000002",
    configuration: {
      approverId: options.approverId ?? null,
      requiresApproval: options.requiresApproval ?? true,
      requiresEvidence: options.requiresEvidence ?? false,
    },
  }) as unknown as KpiActualRecord;

const serviceWithActual = (actual: KpiActualRecord) => {
  const transaction = {
    findWorkflowActual: vi.fn().mockResolvedValue(actual),
    decideActual: vi.fn(),
    resubmitActual: vi.fn(),
  } as unknown as KpiActualTransactionRepository;
  const repository = {
    runWorkflowTransaction: vi.fn(
      (operation: (value: KpiActualTransactionRepository) => unknown) =>
        operation(transaction),
    ),
  } as unknown as KpiActualRepository;
  return {
    service: new KpiActualService(
      repository,
      {} as KpiPerformanceService,
      {} as RiskService,
      new EvidenceGateService(),
    ),
    transaction,
  };
};

describe("EvidenceGateService", () => {
  it("passes only when evidence is not required", () => {
    const gate = new EvidenceGateService();
    expect(gate.assertSatisfied(false)).toBe(true);
    expect(() => gate.assertSatisfied(true)).toThrowError(
      expect.objectContaining({
        status: 501,
        code: "EVIDENCE_GATE_NOT_IMPLEMENTED",
      }),
    );
  });
});

describe("KPI actual workflow validators", () => {
  it("accepts empty approve and resubmit bodies", () => {
    expect(approveKpiActualSchema.parse(undefined)).toEqual({});
    expect(resubmitKpiActualSchema.parse(undefined)).toEqual({});
  });

  it("keeps resubmission status-only and rejects unknown workflow fields", () => {
    expect(
      resubmitKpiActualSchema.safeParse({ actualValue: "95" }).success,
    ).toBe(false);
    expect(
      approveKpiActualSchema.safeParse({ approvedById: randomUUID() }).success,
    ).toBe(false);
  });

  it("requires and trims a rejection reason", () => {
    expect(rejectKpiActualSchema.parse({ reason: "  revise  " })).toEqual({
      reason: "revise",
    });
    expect(rejectKpiActualSchema.safeParse({}).success).toBe(false);
  });
});

describe("KPI actual workflow authorization", () => {
  it("forbids self-approval", async () => {
    const actor = "10000000-0000-4000-8000-000000000002";
    const { service, transaction } = serviceWithActual(
      actualForWorkflow("PENDING_APPROVAL", { submittedById: actor }),
    );

    await expect(
      service.approveActual("tenant", "actual", actor, null, {}),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(transaction.decideActual).not.toHaveBeenCalled();
  });

  it("forbids a reviewer who is not the configured approver", async () => {
    const { service, transaction } = serviceWithActual(
      actualForWorkflow("PENDING_APPROVAL", {
        approverId: "10000000-0000-4000-8000-000000000003",
      }),
    );

    await expect(
      service.rejectActual(
        "tenant",
        "actual",
        "10000000-0000-4000-8000-000000000004",
        "Synthetic correction",
        {},
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(transaction.decideActual).not.toHaveBeenCalled();
  });

  it("fails closed at the evidence gate before approval writes", async () => {
    const { service, transaction } = serviceWithActual(
      actualForWorkflow("PENDING_APPROVAL", { requiresEvidence: true }),
    );

    await expect(
      service.approveActual(
        "tenant",
        "actual",
        "10000000-0000-4000-8000-000000000004",
        null,
        {},
      ),
    ).rejects.toMatchObject({
      status: 501,
      code: "EVIDENCE_GATE_NOT_IMPLEMENTED",
    });
    expect(transaction.decideActual).not.toHaveBeenCalled();
  });

  it("allows only the original submitter to resubmit", async () => {
    const { service, transaction } = serviceWithActual(
      actualForWorkflow("REJECTED"),
    );

    await expect(
      service.resubmitActual(
        "tenant",
        "actual",
        "10000000-0000-4000-8000-000000000004",
        null,
        {},
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(transaction.resubmitActual).not.toHaveBeenCalled();
  });
});

describe("Slice C migration policy", () => {
  it("does not backfill approval history or rewrite existing actual statuses", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260727113000_slice_c_kpi_actual_approval/migration.sql",
      ),
      "utf8",
    );

    expect(migration).not.toMatch(/INSERT\s+INTO\s+"kpi_approvals"/i);
    expect(migration).not.toMatch(/UPDATE\s+"kpi_actuals"/i);
  });
});
