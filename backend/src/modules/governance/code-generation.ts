import type { Prisma } from "@prisma/client";

const MINIMUM_CODE_DIGITS = 3;

const formatCode = (prefix: "POL" | "CTL" | "CHK", value: number) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Code sequence must be a positive safe integer");
  }
  return `${prefix}-${String(value).padStart(MINIMUM_CODE_DIGITS, "0")}`;
};

export const formatPolicyCode = (value: number) => formatCode("POL", value);
export const formatControlCode = (value: number) => formatCode("CTL", value);
export const formatCheckpointCode = (value: number) => formatCode("CHK", value);

/**
 * Uses the same tenant-row UPDATE/increment transaction pattern as KPI Actual
 * and Risk allocation. The caller owns the surrounding business transaction,
 * so failed record creation also rolls back the allocated number.
 */
export class GovernanceCodeRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async allocatePolicyCode(tenantId: string) {
    const tenant = await this.transaction.tenant.update({
      where: { id: tenantId },
      data: { nextPolicyNumber: { increment: 1 } },
      select: { nextPolicyNumber: true },
    });
    return formatPolicyCode(tenant.nextPolicyNumber - 1);
  }

  async allocateControlCode(tenantId: string) {
    const tenant = await this.transaction.tenant.update({
      where: { id: tenantId },
      data: { nextControlNumber: { increment: 1 } },
      select: { nextControlNumber: true },
    });
    return formatControlCode(tenant.nextControlNumber - 1);
  }

  async allocateCheckpointCode(tenantId: string) {
    const tenant = await this.transaction.tenant.update({
      where: { id: tenantId },
      data: { nextCheckpointNumber: { increment: 1 } },
      select: { nextCheckpointNumber: true },
    });
    return formatCheckpointCode(tenant.nextCheckpointNumber - 1);
  }
}
