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

const serviceWithActual = (
  actual: KpiActualRecord,
  gate?: EvidenceGateService,
) => {
  const transaction = {
    lockActual: vi.fn().mockResolvedValue([
      {
        id: actual.id,
        approval_status: actual.approvalStatus,
        kpi_configuration_id: "config",
        submitted_by_id: actual.submittedById,
      },
    ]),
    findWorkflowActual: vi.fn().mockResolvedValue(actual),
    decideActual: vi.fn(),
    resubmitActual: vi.fn(),
    get transactionClient() {
      return {} as never;
    },
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
      gate ?? new EvidenceGateService(),
    ),
    transaction,
  };
};

describe("EvidenceGateService", () => {
  it("KPI actual gate short-circuits when evidence is not required", async () => {
    const gate = new EvidenceGateService();
    await expect(
      gate.assertKpiActualApprovalSatisfied({
        tenantId: "00000000-0000-4000-8000-000000000001",
        kpiActualId: "00000000-0000-4000-8000-000000000002",
        requiresEvidence: false,
      }),
    ).resolves.toEqual({ satisfied: true, qualifyingCount: 0 });
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
    const gate = {
      assertKpiActualApprovalSatisfied: vi.fn().mockRejectedValue(
        Object.assign(new Error("Evidence required"), {
          status: 409,
          code: "EVIDENCE_REQUIRED",
          details: { reason: "EVIDENCE_KPI_LINK_REQUIRED" },
        }),
      ),
    } as unknown as EvidenceGateService;
    const { service, transaction } = serviceWithActual(
      actualForWorkflow("PENDING_APPROVAL", {
        requiresEvidence: true,
        requiresApproval: true,
      }),
      gate,
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
      status: 409,
      code: "EVIDENCE_REQUIRED",
    });
    expect(transaction.decideActual).not.toHaveBeenCalled();
    expect(gate.assertKpiActualApprovalSatisfied).toHaveBeenCalled();
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
