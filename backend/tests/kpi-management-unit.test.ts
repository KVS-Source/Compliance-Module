import { describe, expect, it, vi } from "vitest";
import type { KpiTargetRecord } from "../src/modules/kpis/management-repository.js";
import { KpiManagementService } from "../src/modules/kpis/management-service.js";
import type { KpiManagementRepository } from "../src/modules/kpis/management-repository.js";
import {
  createKpiConfigurationSchema,
  createKpiTargetSchema,
  updateKpiTargetSchema,
} from "../src/modules/kpis/management-validators.js";

const configurationBody = {
  kpiDefinitionId: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  reviewFrequency: "QUARTERLY",
  effectiveFrom: "2026-07-01",
};

describe("KPI management validators", () => {
  it("normalizes currency and does not accept request tenant identity", () => {
    const parsed = createKpiConfigurationSchema.parse({
      ...configurationBody,
      currency: "usd",
      tenantId: "10000000-0000-4000-8000-000000000099",
      companyId: "10000000-0000-4000-8000-000000000099",
    });
    expect(parsed.currency).toBe("USD");
    expect(parsed).not.toHaveProperty("tenantId");
    expect(parsed).not.toHaveProperty("companyId");
  });

  it("rejects invalid date ranges and values outside Decimal(18,4)", () => {
    const result = createKpiTargetSchema.safeParse({
      code: "KTG-UNIT-001",
      kpiConfigurationId: "10000000-0000-4000-8000-000000000003",
      period: "FY26-27 Q1",
      periodStart: "2026-09-30",
      periodEnd: "2026-07-01",
      targetValue: "123456789012345.1234",
      effectiveFrom: "2026-07-01",
    });
    expect(result.success).toBe(false);
  });

  it("compares high-precision tolerance strings without Number coercion", () => {
    const result = createKpiTargetSchema.safeParse({
      code: "KTG-UNIT-002",
      kpiConfigurationId: "10000000-0000-4000-8000-000000000003",
      period: "FY26-27 Q1",
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      targetValue: "99999999999999.9999",
      minValue: "99999999999999.9999",
      maxValue: "99999999999999.9998",
      effectiveFrom: "2026-07-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["maxValue"] }),
        ]),
      );
    }
  });

  it("rejects empty target patches", () => {
    expect(updateKpiTargetSchema.safeParse({}).success).toBe(false);
  });
});

const targetForState = (
  approvalStatus: KpiTargetRecord["approvalStatus"],
  options: {
    submittedById?: string | null;
    approverId?: string | null;
    requiresApproval?: boolean;
  } = {},
) =>
  ({
    id: "10000000-0000-4000-8000-000000000010",
    approvalStatus,
    submittedById: options.submittedById ?? null,
    supersededById: null,
    configuration: {
      approverId: options.approverId ?? null,
      requiresApproval: options.requiresApproval ?? true,
    },
  }) as unknown as KpiTargetRecord;

const serviceWithTarget = (target: KpiTargetRecord) => {
  const repository = {
    findTarget: vi.fn().mockResolvedValue(target),
    updateTarget: vi.fn(),
    submitTarget: vi.fn(),
    decideTarget: vi.fn(),
  } as unknown as KpiManagementRepository;
  return { service: new KpiManagementService(repository), repository };
};

describe("KPI target workflow service", () => {
  it("forbids a configured approver from submitting the same target", async () => {
    const actor = "10000000-0000-4000-8000-000000000020";
    const { service } = serviceWithTarget(
      targetForState("DRAFT", { approverId: actor }),
    );
    await expect(
      service.submitTarget("tenant", "target", actor, {}),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("forbids self-approval", async () => {
    const actor = "10000000-0000-4000-8000-000000000020";
    const { service } = serviceWithTarget(
      targetForState("PENDING_APPROVAL", { submittedById: actor }),
    );
    await expect(
      service.approveTarget("tenant", "target", actor, {}),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("requires versioning instead of editing an approved target", async () => {
    const { service, repository } = serviceWithTarget(
      targetForState("APPROVED"),
    );
    await expect(
      service.updateTarget(
        "tenant",
        "target",
        "actor",
        { targetValue: "91" },
        {},
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "KPI_TARGET_APPROVED_IMMUTABLE",
    });
    expect(repository.updateTarget).not.toHaveBeenCalled();
  });
});
