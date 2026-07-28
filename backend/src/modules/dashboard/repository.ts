import type { Prisma, PrismaClient } from "@prisma/client";

export class DashboardRepository {
  constructor(private readonly db: PrismaClient) {}

  async kpis(tenantId: string) {
    const [
      activeConfigurations,
      meetingTarget,
      amberActuals,
      redActuals,
      pendingApprovals,
    ] = await this.db.$transaction([
      this.db.kpiConfiguration.count({
        where: {
          tenantId,
          enabled: true,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
      this.db.kpiActual.count({
        where: {
          tenantId,
          targetMet: true,
          deletedAt: null,
          configuration: {
            definition: { direction: { not: "INFORMATIONAL" } },
          },
        },
      }),
      this.db.kpiActual.count({
        where: { tenantId, ragStatus: "AMBER", deletedAt: null },
      }),
      this.db.kpiActual.count({
        where: { tenantId, ragStatus: "RED", deletedAt: null },
      }),
      this.db.kpiActual.count({
        where: {
          tenantId,
          approvalStatus: { in: ["SUBMITTED", "PENDING_APPROVAL"] },
          deletedAt: null,
        },
      }),
    ]);
    return {
      activeConfigurations,
      meetingTarget,
      amberActuals,
      redActuals,
      pendingApprovals,
    };
  }

  async risks(tenantId: string) {
    const active: Prisma.RiskWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ["CLOSED", "ARCHIVED"] },
    };
    const [
      openRisks,
      minorRisks,
      majorRisks,
      risksUnderTreatment,
      closedRisks,
    ] = await this.db.$transaction([
      this.db.risk.count({
        where: { tenantId, status: "OPEN", deletedAt: null },
      }),
      this.db.risk.count({
        where: { ...active, kpiRiskClass: "MINOR" },
      }),
      this.db.risk.count({
        where: { ...active, kpiRiskClass: "MAJOR" },
      }),
      this.db.risk.count({
        where: { tenantId, status: "TREATED", deletedAt: null },
      }),
      this.db.risk.count({
        where: { tenantId, status: "CLOSED", deletedAt: null },
      }),
    ]);
    return {
      openRisks,
      minorRisks,
      majorRisks,
      risksUnderTreatment,
      closedRisks,
    };
  }

  async organisation(tenantId: string) {
    const [departments, locations, organisationUnits] =
      await this.db.$transaction([
        this.db.orgDepartment.count({
          where: { tenantId, status: "ACTIVE" },
        }),
        this.db.orgLocation.count({
          where: { tenantId, status: "ACTIVE" },
        }),
        this.db.orgUnit.count({
          where: { tenantId, status: "ACTIVE" },
        }),
      ]);
    return { departments, locations, organisationUnits };
  }

  async frameworks() {
    return {
      activeFrameworks: await this.db.framework.count({
        where: { status: "ACTIVE" },
      }),
    };
  }
}
