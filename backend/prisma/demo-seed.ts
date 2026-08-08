import "dotenv/config";
import argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";
import { KpiActualRepository } from "../src/modules/kpis/actual-repository.js";
import { KpiActualService } from "../src/modules/kpis/actual-service.js";
import { EvidenceGateService } from "../src/modules/evidence/evidence-gate-service.js";
import { KpiManagementRepository } from "../src/modules/kpis/management-repository.js";
import { KpiManagementService } from "../src/modules/kpis/management-service.js";
import { KpiPerformanceService } from "../src/modules/kpis/performance-service.js";
import { RiskRepository } from "../src/modules/risks/repository.js";
import { RiskService } from "../src/modules/risks/service.js";
import {
  DEMO_DEPARTMENTS,
  DEMO_FRAMEWORKS,
  DEMO_KPIS,
  DEMO_LOCATIONS,
  DEMO_PERMISSIONS,
  DEMO_TENANT,
  DEMO_UNITS,
  DEMO_USERS,
  type DemoKpi,
  type DemoRiskScenario,
} from "./demo-seed-data.js";
import { assertDemoSeedExecutionAllowed } from "./demo-seed-safety.js";
import { seedGovernanceFoundation } from "./governance-seed.js";

const { password } = assertDemoSeedExecutionAllowed();
const db = new PrismaClient();
const roleAssignments = new RoleAssignmentService(db);
const management = new KpiManagementService(new KpiManagementRepository(db));
const risks = new RiskService(new RiskRepository(db));
const actuals = new KpiActualService(
  new KpiActualRepository(db),
  new KpiPerformanceService(),
  risks,
  new EvidenceGateService(),
);
const auditContext = { userAgent: "explicit-demo-seed" };
type DemoPeriod = {
  name: string;
  start: string;
  end: string;
};
const period: DemoPeriod = {
  name: "2026-Q3",
  start: "2026-07-01",
  end: "2026-09-30",
};
const uatEntryPeriod: DemoPeriod = {
  name: "2026-Q4",
  start: "2026-10-01",
  end: "2026-12-31",
};

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const decimalMatches = (
  value: Prisma.Decimal | null,
  expected: string | undefined,
) =>
  expected === undefined
    ? value === null
    : value !== null && value.equals(new Prisma.Decimal(expected));

const conflict = (message: string): never => {
  throw new Error(`Demo seed conflict: ${message}`);
};

async function seedOrganisation(tenantId: string) {
  const departments = new Map<string, string>();
  for (const [code, name] of DEMO_DEPARTMENTS) {
    const row = await db.orgDepartment.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, headName: null, status: "ACTIVE" },
      create: {
        tenantId,
        code,
        name,
        headName: null,
        status: "ACTIVE",
      },
    });
    departments.set(code, row.id);
  }

  const units = new Map<string, string>();
  for (const [code, name] of DEMO_UNITS) {
    const row = await db.orgUnit.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, status: "ACTIVE" },
      create: { tenantId, code, name, status: "ACTIVE" },
    });
    units.set(code, row.id);
  }

  const locations = new Map<string, string>();
  for (const location of DEMO_LOCATIONS) {
    const row = await db.orgLocation.upsert({
      where: { tenantId_code: { tenantId, code: location.code } },
      update: { ...location, status: "ACTIVE" },
      create: { tenantId, ...location, status: "ACTIVE" },
    });
    locations.set(location.code, row.id);
  }
  return { departments, units, locations };
}

async function seedAccess(
  tenantId: string,
  departments: ReadonlyMap<string, string>,
) {
  const permissionIds = new Map<string, string>();
  for (const [code, name] of DEMO_PERMISSIONS) {
    const permission = await db.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionIds.set(code, permission.id);
  }

  const passwordHash = await argon2.hash(password);
  const users = new Map<string, { id: string; email: string }>();
  for (const definition of DEMO_USERS) {
    const departmentId = departments.get(definition.departmentCode);
    if (departmentId === undefined) {
      throw new Error(
        `Demo seed conflict: missing ${definition.departmentCode}`,
      );
    }
    const user = await db.user.upsert({
      where: { email: definition.email },
      update: {
        code: definition.code,
        fullName: definition.name,
        phone: null,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenantId,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        code: definition.code,
        email: definition.email,
        fullName: definition.name,
        phone: null,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenantId,
      },
    });
    await db.userCompany.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      update: { departmentId, status: "ACTIVE" },
      create: {
        userId: user.id,
        tenantId,
        departmentId,
        status: "ACTIVE",
      },
    });

    const role = await db.role.upsert({
      where: {
        tenantId_code: { tenantId, code: definition.roleCode },
      },
      update: {
        name: definition.roleName,
        description: "Synthetic UAT demonstration role",
        status: "ACTIVE",
      },
      create: {
        tenantId,
        code: definition.roleCode,
        name: definition.roleName,
        description: "Synthetic UAT demonstration role",
        status: "ACTIVE",
      },
    });
    await db.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { code: { notIn: [...definition.permissions] } },
      },
    });
    for (const permissionCode of definition.permissions) {
      const permissionId = permissionIds.get(permissionCode);
      if (permissionId === undefined) {
        throw new Error(
          `Demo seed conflict: missing permission ${permissionCode}`,
        );
      }
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
    await db.userRole.updateMany({
      where: {
        userId: user.id,
        tenantId,
        roleId: { not: role.id },
        status: "ACTIVE",
      },
      data: { status: "DISABLED" },
    });
    await roleAssignments.upsertActive({
      userId: user.id,
      roleId: role.id,
      tenantId,
      assignedBy: user.id,
    });
    users.set(definition.roleCode, { id: user.id, email: user.email });
  }
  return users;
}

async function seedFrameworks() {
  for (const [code, name, version] of DEMO_FRAMEWORKS) {
    const framework = await db.framework.upsert({
      where: { code_version: { code, version } },
      update: {
        name,
        description: "Synthetic UAT framework catalogue entry.",
        status: "ACTIVE",
      },
      create: {
        code,
        name,
        version,
        description: "Synthetic UAT framework catalogue entry.",
        status: "ACTIVE",
      },
    });
    await db.frameworkRule.upsert({
      where: {
        frameworkId_code: {
          frameworkId: framework.id,
          code: `${code}-R1`,
        },
      },
      update: {
        title: "Demonstration compliance requirement",
        description:
          "Synthetic requirement for navigation and catalogue demonstration.",
        status: "ACTIVE",
      },
      create: {
        frameworkId: framework.id,
        code: `${code}-R1`,
        title: "Demonstration compliance requirement",
        description:
          "Synthetic requirement for navigation and catalogue demonstration.",
        status: "ACTIVE",
      },
    });
  }
}

async function ensureConfiguration(
  tenantId: string,
  kpi: DemoKpi,
  definitionId: string,
  ownerId: string,
  approverId: string,
  departmentId: string,
  unitId: string,
  locationId: string,
) {
  const existing = await db.kpiConfiguration.findFirst({
    where: {
      tenantId,
      kpiDefinitionId: definitionId,
      orgUnitId: unitId,
      orgLocationId: locationId,
      productService: null,
      departmentId,
      deletedAt: null,
    },
  });
  if (existing) {
    if (
      existing.ownerId !== ownerId ||
      existing.approverId !== approverId ||
      !existing.enabled ||
      existing.reviewFrequency !== kpi.frequency ||
      !decimalMatches(existing.amberThresholdPct, "5") ||
      !decimalMatches(existing.redThresholdPct, "10") ||
      existing.requiresEvidence ||
      !existing.requiresApproval ||
      existing.status !== "ACTIVE"
    ) {
      conflict(`${kpi.code} configuration differs from the approved demo data`);
    }
    return existing;
  }

  const created = await management.createConfiguration(
    tenantId,
    ownerId,
    {
      kpiDefinitionId: definitionId,
      orgUnitId: unitId,
      orgLocationId: locationId,
      productService: null,
      departmentId,
      ownerId,
      approverId,
      enabled: true,
      currency: kpi.code === "DEMO-KPI-002" ? "INR" : null,
      reviewFrequency: kpi.frequency,
      amberThresholdPct: "5",
      redThresholdPct: "10",
      requiresEvidence: false,
      requiresApproval: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      status: "ACTIVE",
    },
    auditContext,
  );
  return db.kpiConfiguration.findUniqueOrThrow({ where: { id: created.id } });
}

async function ensureApprovedTarget(
  tenantId: string,
  kpi: DemoKpi,
  configurationId: string,
  ownerId: string,
  approverId: string,
  targetPeriod = period,
  code = kpi.code.replace("DEMO-KPI-", "DEMO-KTG-"),
) {
  let target = await db.kpiTarget.findUnique({
    where: { tenantId_code: { tenantId, code } },
  });
  if (!target) {
    const created = await management.createTarget(
      tenantId,
      ownerId,
      {
        kpiConfigurationId: configurationId,
        code,
        period: targetPeriod.name,
        periodStart: targetPeriod.start,
        periodEnd: targetPeriod.end,
        targetValue: kpi.targetValue,
        minValue: kpi.minValue ?? null,
        maxValue: kpi.maxValue ?? null,
        effectiveFrom: targetPeriod.start,
        effectiveTo: targetPeriod.end,
        status: "ACTIVE",
      },
      auditContext,
    );
    target = await db.kpiTarget.findUniqueOrThrow({
      where: { id: created.id },
    });
  }

  if (
    target.kpiConfigurationId !== configurationId ||
    target.period !== targetPeriod.name ||
    dateOnly(target.periodStart) !== targetPeriod.start ||
    dateOnly(target.periodEnd) !== targetPeriod.end ||
    !target.targetValue.equals(kpi.targetValue) ||
    !decimalMatches(target.minValue, kpi.minValue) ||
    !decimalMatches(target.maxValue, kpi.maxValue) ||
    dateOnly(target.effectiveFrom) !== targetPeriod.start ||
    target.effectiveTo === null ||
    dateOnly(target.effectiveTo) !== targetPeriod.end ||
    target.status !== "ACTIVE" ||
    target.deletedAt !== null
  ) {
    conflict(
      `${code} differs from the approved target; immutable targets are never updated`,
    );
  }

  if (target.approvalStatus === "DRAFT") {
    await management.submitTarget(tenantId, target.id, ownerId, auditContext);
    target = await db.kpiTarget.findUniqueOrThrow({ where: { id: target.id } });
  }
  if (target.approvalStatus === "PENDING_APPROVAL") {
    await management.approveTarget(
      tenantId,
      target.id,
      approverId,
      auditContext,
    );
    target = await db.kpiTarget.findUniqueOrThrow({ where: { id: target.id } });
  }
  if (target.approvalStatus !== "APPROVED") {
    conflict(`${code} is ${target.approvalStatus}, not APPROVED`);
  }
  return target;
}

async function ensureActual(
  tenantId: string,
  kpi: DemoKpi,
  configurationId: string,
  targetId: string,
  ownerId: string,
  approverId: string,
) {
  let actual = await db.kpiActual.findFirst({
    where: {
      tenantId,
      kpiConfigurationId: configurationId,
      period: period.name,
      deletedAt: null,
    },
  });
  if (!actual) {
    const created = await actuals.submitActual(
      tenantId,
      ownerId,
      {
        kpiConfigurationId: configurationId,
        period: period.name,
        actualValue: kpi.actualValue,
        evidenceStatus: null,
        comments: `Synthetic UAT actual for ${kpi.code}.`,
      },
      auditContext,
    );
    actual = await db.kpiActual.findUniqueOrThrow({
      where: { id: created.id },
    });
  }

  if (
    actual.kpiTargetId !== targetId ||
    !actual.targetValueSnapshot.equals(kpi.targetValue) ||
    !actual.actualValue.equals(kpi.actualValue) ||
    actual.ragStatus !== kpi.expectedRag ||
    !actual.code.match(/^ACT-\d+$/)
  ) {
    conflict(`${kpi.code} actual differs from the service-calculated demo row`);
  }

  const decisions = await db.kpiApproval.findMany({
    where: { tenantId, kpiActualId: actual.id },
    orderBy: { decidedAt: "asc" },
  });
  if (kpi.rejectionHistory && decisions.length === 0) {
    if (
      actual.approvalStatus !== "SUBMITTED" &&
      actual.approvalStatus !== "PENDING_APPROVAL"
    ) {
      conflict(`${kpi.code} cannot receive the required rejection history`);
    }
    await actuals.rejectActual(
      tenantId,
      actual.id,
      approverId,
      "Synthetic UAT rejection used to demonstrate resubmission.",
      auditContext,
    );
    await actuals.resubmitActual(
      tenantId,
      actual.id,
      ownerId,
      "Synthetic UAT correction confirmed; measured value is unchanged.",
      auditContext,
    );
    actual = await db.kpiActual.findUniqueOrThrow({ where: { id: actual.id } });
  }

  if (actual.approvalStatus === "REJECTED") {
    await actuals.resubmitActual(
      tenantId,
      actual.id,
      ownerId,
      "Synthetic UAT resubmission.",
      auditContext,
    );
    actual = await db.kpiActual.findUniqueOrThrow({ where: { id: actual.id } });
  }
  if (
    actual.approvalStatus === "SUBMITTED" ||
    actual.approvalStatus === "PENDING_APPROVAL"
  ) {
    await actuals.approveActual(
      tenantId,
      actual.id,
      approverId,
      "Synthetic UAT approval.",
      auditContext,
    );
    actual = await db.kpiActual.findUniqueOrThrow({ where: { id: actual.id } });
  }
  if (actual.approvalStatus !== "APPROVED") {
    conflict(`${kpi.code} actual is ${actual.approvalStatus}, not APPROVED`);
  }
  return actual;
}

async function ensureOwner(
  tenantId: string,
  riskId: string,
  actorUserId: string,
  ownerId: string,
) {
  const row = await db.risk.findUniqueOrThrow({ where: { id: riskId } });
  if (row.ownerId === ownerId) return;
  if (row.ownerId !== null) conflict(`${row.code} has an unexpected owner`);
  await risks.assignOwner(
    tenantId,
    riskId,
    actorUserId,
    { ownerId },
    auditContext,
  );
}

async function ensureReview(
  tenantId: string,
  riskId: string,
  actorUserId: string,
  marker: string,
  likelihood: number,
  impact: number,
) {
  const existing = await db.riskReview.findFirst({
    where: { tenantId, riskId, comments: marker },
  });
  if (existing) return;
  await risks.recordReview(
    tenantId,
    riskId,
    actorUserId,
    {
      comments: marker,
      likelihoodAtReview: likelihood,
      impactAtReview: impact,
    },
    auditContext,
  );
}

async function ensureTreatment(
  tenantId: string,
  riskId: string,
  actorUserId: string,
  ownerId: string,
  marker: string,
  status: "PLANNED" | "IN_PROGRESS",
) {
  const existing = await db.riskTreatment.findFirst({
    where: { tenantId, riskId, plan: marker },
    orderBy: { recordedAt: "asc" },
  });
  if (existing) return existing;
  await risks.recordTreatment(
    tenantId,
    riskId,
    actorUserId,
    {
      strategy: "MITIGATE",
      plan: marker,
      ownerId,
      dueDate: "2026-12-31",
      status,
    },
    auditContext,
  );
  return db.riskTreatment.findFirstOrThrow({
    where: { tenantId, riskId, plan: marker },
    orderBy: { recordedAt: "asc" },
  });
}

async function applyRiskScenario(
  tenantId: string,
  riskId: string,
  scenario: DemoRiskScenario,
  riskManagerId: string,
) {
  await ensureOwner(tenantId, riskId, riskManagerId, riskManagerId);
  if (scenario === "OPEN") return;

  const reviewMarker = `Synthetic UAT review for ${scenario}.`;
  if (
    scenario === "UNDER_REVIEW" ||
    scenario === "CLOSED" ||
    scenario === "REOPENED"
  ) {
    await ensureReview(
      tenantId,
      riskId,
      riskManagerId,
      reviewMarker,
      scenario === "CLOSED" ? 2 : 3,
      scenario === "CLOSED" ? 2 : 3,
    );
  }

  if (
    scenario === "TREATMENT_PLANNED" ||
    scenario === "TREATMENT_IN_PROGRESS"
  ) {
    await ensureTreatment(
      tenantId,
      riskId,
      riskManagerId,
      riskManagerId,
      `Synthetic UAT ${scenario.toLowerCase().replaceAll("_", " ")} plan.`,
      scenario === "TREATMENT_PLANNED" ? "PLANNED" : "IN_PROGRESS",
    );
  }

  if (scenario === "CLOSED") {
    const treatment = await ensureTreatment(
      tenantId,
      riskId,
      riskManagerId,
      riskManagerId,
      "Synthetic UAT treatment completed before closure.",
      "PLANNED",
    );
    const completion = await db.riskTreatment.findFirst({
      where: {
        tenantId,
        riskId,
        supersedesId: treatment.id,
        status: "COMPLETED",
      },
    });
    if (!completion) {
      await risks.completeTreatment(
        tenantId,
        riskId,
        treatment.id,
        riskManagerId,
        { effectivenessNotes: "Synthetic UAT effectiveness confirmed." },
        auditContext,
      );
    }
    const row = await db.risk.findUniqueOrThrow({ where: { id: riskId } });
    if (row.status !== "CLOSED") {
      await risks.closeRisk(
        tenantId,
        riskId,
        riskManagerId,
        { reason: "Synthetic UAT risk closure after treatment." },
        auditContext,
      );
    }
  }

  if (scenario === "REOPENED") {
    const reopened = await db.auditEvent.findFirst({
      where: { tenantId, entityId: riskId, action: "RISK_REOPENED" },
    });
    if (!reopened) {
      const row = await db.risk.findUniqueOrThrow({ where: { id: riskId } });
      if (row.status !== "CLOSED") {
        await risks.closeRisk(
          tenantId,
          riskId,
          riskManagerId,
          { reason: "Synthetic UAT closure before reopen demonstration." },
          auditContext,
        );
      }
      await risks.reopenRisk(
        tenantId,
        riskId,
        riskManagerId,
        { reason: "Synthetic UAT reopen for continued monitoring." },
        auditContext,
      );
    }
  }
}

async function seedKpiWorkflow(
  tenantId: string,
  departments: ReadonlyMap<string, string>,
  units: ReadonlyMap<string, string>,
  locations: ReadonlyMap<string, string>,
  users: ReadonlyMap<string, { id: string; email: string }>,
) {
  const ownerId = users.get("DEPARTMENT_OWNER")?.id;
  const approverId = users.get("REVIEWER_APPROVER")?.id;
  const riskManagerId = users.get("COMPLIANCE_MANAGER")?.id;
  const locationId = locations.get("DEMO-LOC-001");
  if (
    ownerId === undefined ||
    approverId === undefined ||
    riskManagerId === undefined ||
    locationId === undefined
  ) {
    throw new Error(
      "Demo seed conflict: demo workflow actors or location are missing",
    );
  }

  for (const kpi of DEMO_KPIS) {
    const departmentId = departments.get(kpi.departmentCode);
    const unitId = units.get(kpi.unitCode);
    if (departmentId === undefined || unitId === undefined) {
      throw new Error(
        `Demo seed conflict: ${kpi.code} organisation scope is missing`,
      );
    }
    const definition = await db.kpiDefinition.upsert({
      where: { code: kpi.code },
      update: {
        name: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        direction: kpi.direction,
        frequency: kpi.frequency,
        status: "ACTIVE",
      },
      create: {
        code: kpi.code,
        name: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        direction: kpi.direction,
        frequency: kpi.frequency,
        status: "ACTIVE",
      },
    });
    const configuration = await ensureConfiguration(
      tenantId,
      kpi,
      definition.id,
      ownerId,
      approverId,
      departmentId,
      unitId,
      locationId,
    );
    const target = await ensureApprovedTarget(
      tenantId,
      kpi,
      configuration.id,
      ownerId,
      approverId,
    );
    const actual = await ensureActual(
      tenantId,
      kpi,
      configuration.id,
      target.id,
      ownerId,
      approverId,
    );
    if (kpi.code === "DEMO-KPI-001" || kpi.code === "DEMO-KPI-003") {
      await ensureApprovedTarget(
        tenantId,
        kpi,
        configuration.id,
        ownerId,
        approverId,
        uatEntryPeriod,
        `${kpi.code.replace("DEMO-KPI-", "DEMO-KTG-")}-Q4`,
      );
    }
    const linkedRisks = await db.risk.findMany({
      where: { tenantId, kpiActualId: actual.id, deletedAt: null },
    });
    if (kpi.expectedRag === "GREEN" || kpi.expectedRag === null) {
      if (linkedRisks.length !== 0) {
        conflict(`${kpi.code} must not have an automatic risk`);
      }
      continue;
    }
    const linkedRisk = linkedRisks[0];
    if (
      linkedRisks.length !== 1 ||
      linkedRisk === undefined ||
      !linkedRisk.code.match(/^RSK-\d+$/)
    ) {
      throw new Error(
        `Demo seed conflict: ${kpi.code} must have exactly one server-generated risk`,
      );
    }
    const expectedClass = kpi.expectedRag === "AMBER" ? "MINOR" : "MAJOR";
    if (linkedRisk.kpiRiskClass !== expectedClass) {
      conflict(`${kpi.code} automatic risk class is not ${expectedClass}`);
    }
    const scenario = kpi.riskScenario;
    if (scenario === undefined) {
      throw new Error(
        `Demo seed conflict: ${kpi.code} risk scenario is missing`,
      );
    }
    await applyRiskScenario(tenantId, linkedRisk.id, scenario, riskManagerId);
  }
}

async function counts(tenantId: string) {
  const [
    users,
    departments,
    locations,
    units,
    frameworks,
    kpiDefinitions,
    configurations,
    targets,
    actualsCount,
    risksCount,
    reviews,
    treatments,
    policies,
    policyVersions,
    controls,
    controlPolicyVersions,
    checkpoints,
    checkpointReviews,
  ] = await Promise.all([
    db.userCompany.count({ where: { tenantId, status: "ACTIVE" } }),
    db.orgDepartment.count({ where: { tenantId, status: "ACTIVE" } }),
    db.orgLocation.count({ where: { tenantId, status: "ACTIVE" } }),
    db.orgUnit.count({ where: { tenantId, status: "ACTIVE" } }),
    db.framework.count({ where: { code: { startsWith: "DEMO-FRM-" } } }),
    db.kpiDefinition.count({ where: { code: { startsWith: "DEMO-KPI-" } } }),
    db.kpiConfiguration.count({ where: { tenantId, deletedAt: null } }),
    db.kpiTarget.count({ where: { tenantId, deletedAt: null } }),
    db.kpiActual.count({ where: { tenantId, deletedAt: null } }),
    db.risk.count({ where: { tenantId, deletedAt: null } }),
    db.riskReview.count({ where: { tenantId } }),
    db.riskTreatment.count({ where: { tenantId } }),
    db.policy.count({ where: { tenantId } }),
    db.policyVersion.count({ where: { tenantId } }),
    db.control.count({ where: { tenantId } }),
    db.controlPolicyVersion.count({ where: { tenantId } }),
    db.checkpoint.count({ where: { tenantId } }),
    db.checkpointReview.count({ where: { tenantId } }),
  ]);
  return {
    tenants: 1,
    users,
    departments,
    locations,
    organisationUnits: units,
    frameworks,
    kpiDefinitions,
    kpiConfigurations: configurations,
    kpiTargets: targets,
    kpiActuals: actualsCount,
    risks: risksCount,
    riskReviews: reviews,
    riskTreatments: treatments,
    policies,
    policyVersions,
    controls,
    controlPolicyVersions,
    checkpoints,
    checkpointReviews,
  };
}

async function main() {
  const tenant = await db.tenant.upsert({
    where: { code: DEMO_TENANT.code },
    update: {
      name: DEMO_TENANT.name,
      industry: DEMO_TENANT.industry,
      country: DEMO_TENANT.country,
      status: "ACTIVE",
      defaultAmberThresholdPct: "5",
      defaultRedThresholdPct: "10",
    },
    create: {
      ...DEMO_TENANT,
      status: "ACTIVE",
      defaultAmberThresholdPct: "5",
      defaultRedThresholdPct: "10",
    },
  });
  const organisation = await seedOrganisation(tenant.id);
  const users = await seedAccess(tenant.id, organisation.departments);
  await seedFrameworks();
  const governanceOwnerId = users.get("COMPLIANCE_MANAGER")?.id;
  const governanceApproverId = users.get("REVIEWER_APPROVER")?.id;
  const governanceDepartmentId =
    organisation.departments.get("DEMO-DEP-001");
  if (
    governanceOwnerId === undefined ||
    governanceApproverId === undefined ||
    governanceDepartmentId === undefined
  ) {
    throw new Error("Demo seed conflict: governance actors or scope are missing");
  }
  const governanceFramework = await db.framework.findUniqueOrThrow({
    where: {
      code_version: { code: "DEMO-FRM-001", version: "2015" },
    },
  });
  const governanceRule = await db.frameworkRule.findUniqueOrThrow({
    where: {
      frameworkId_code: {
        frameworkId: governanceFramework.id,
        code: "DEMO-FRM-001-R1",
      },
    },
  });
  await seedGovernanceFoundation(db, {
    tenantId: tenant.id,
    ownerId: governanceOwnerId,
    approverId: governanceApproverId,
    departmentId: governanceDepartmentId,
    frameworkId: governanceFramework.id,
    frameworkRuleId: governanceRule.id,
    codePrefix: "DEMO-",
  });
  await seedKpiWorkflow(
    tenant.id,
    organisation.departments,
    organisation.units,
    organisation.locations,
    users,
  );
  console.log("Deterministic UAT demo seed complete");
  console.log(JSON.stringify(await counts(tenant.id), null, 2));
  console.log(
    `Login identities: ${DEMO_USERS.map(({ email }) => email).join(", ")}`,
  );
  console.log(
    "Passwords are not printed; use the runtime DEMO_SEED_PASSWORD value.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Deterministic demo seed failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
