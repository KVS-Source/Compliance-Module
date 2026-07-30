import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type {
  Framework,
  FrameworkRule,
  OrgDepartment,
  Policy,
  PolicyVersion,
  Tenant,
  User,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../src/modules/governance/code-generation.js";

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

const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
const code = (prefix: string) => `${prefix}-${suffix}`;
const syntheticHash = "synthetic-test-hash-not-a-runtime-secret";
const backendDirectory = resolve(__dirname, "..");
const governanceMigrationSql = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260730040412_milestone_4_policy_control_checkpoint_foundation/migration.sql",
  ),
  "utf8",
);

describe("Milestone 4 Policy, Control and Checkpoint database foundation", () => {
  let prisma: PrismaClient;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let ownerA: User;
  let approverA: User;
  let ownerB: User;
  let approverB: User;
  let outsider: User;
  let departmentA: OrgDepartment;
  let departmentB: OrgDepartment;
  let frameworkA: Framework;
  let frameworkB: Framework;
  let ruleA: FrameworkRule;
  let ruleB: FrameworkRule;
  let kpiRiskCounts: {
    configurations: number;
    targets: number;
    actuals: number;
    risks: number;
  };

  beforeAll(async () => {
    ({ prisma } = await import("../src/config/prisma.js"));
    [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({
        data: {
          code: code("M4A"),
          name: "Synthetic M4 Company A",
          status: "ACTIVE",
        },
      }),
      prisma.tenant.create({
        data: {
          code: code("M4B"),
          name: "Synthetic M4 Company B",
          status: "ACTIVE",
        },
      }),
    ]);
    const userFixtures = [
      { userCode: "OA", name: "Owner A", defaultTenantId: tenantA.id },
      { userCode: "AA", name: "Approver A", defaultTenantId: tenantA.id },
      { userCode: "OB", name: "Owner B", defaultTenantId: tenantB.id },
      { userCode: "AB", name: "Approver B", defaultTenantId: tenantB.id },
      { userCode: "OUT", name: "Outside User", defaultTenantId: tenantB.id },
    ] as const;
    const users = await Promise.all(
      userFixtures.map(async ({ userCode, name, defaultTenantId }) =>
        prisma.user.create({
          data: {
            code: code(`USR${userCode}`),
            email: `${code(`usr${userCode}`).toLowerCase()}@example.test`,
            fullName: `Synthetic ${name}`,
            passwordHash: syntheticHash,
            status: "ACTIVE",
            defaultTenantId,
          },
        }),
      ),
    );
    if (users.length !== 5) {
      throw new Error("Expected five synthetic governance users");
    }
    [ownerA, approverA, ownerB, approverB, outsider] = users as [
      User,
      User,
      User,
      User,
      User,
    ];
    await Promise.all([
      prisma.userCompany.create({
        data: { tenantId: tenantA.id, userId: ownerA.id, status: "ACTIVE" },
      }),
      prisma.userCompany.create({
        data: { tenantId: tenantA.id, userId: approverA.id, status: "ACTIVE" },
      }),
      prisma.userCompany.create({
        data: { tenantId: tenantB.id, userId: ownerB.id, status: "ACTIVE" },
      }),
      prisma.userCompany.create({
        data: { tenantId: tenantB.id, userId: approverB.id, status: "ACTIVE" },
      }),
      prisma.userCompany.create({
        data: { tenantId: tenantB.id, userId: outsider.id, status: "ACTIVE" },
      }),
    ]);
    [departmentA, departmentB] = await Promise.all([
      prisma.orgDepartment.create({
        data: {
          tenantId: tenantA.id,
          code: code("DEP-A"),
          name: "Synthetic Department A",
          status: "ACTIVE",
        },
      }),
      prisma.orgDepartment.create({
        data: {
          tenantId: tenantB.id,
          code: code("DEP-B"),
          name: "Synthetic Department B",
          status: "ACTIVE",
        },
      }),
    ]);
    [frameworkA, frameworkB] = await Promise.all([
      prisma.framework.create({
        data: {
          code: code("FRM-A"),
          name: "Synthetic Framework A",
          version: "1",
          status: "ACTIVE",
        },
      }),
      prisma.framework.create({
        data: {
          code: code("FRM-B"),
          name: "Synthetic Framework B",
          version: "1",
          status: "ACTIVE",
        },
      }),
    ]);
    [ruleA, ruleB] = await Promise.all([
      prisma.frameworkRule.create({
        data: {
          frameworkId: frameworkA.id,
          code: code("RULE-A"),
          title: "Synthetic Rule A",
          status: "ACTIVE",
        },
      }),
      prisma.frameworkRule.create({
        data: {
          frameworkId: frameworkB.id,
          code: code("RULE-B"),
          title: "Synthetic Rule B",
          status: "ACTIVE",
        },
      }),
    ]);
    const [configurations, targets, actuals, risks] = await Promise.all([
      prisma.kpiConfiguration.count(),
      prisma.kpiTarget.count(),
      prisma.kpiActual.count(),
      prisma.risk.count(),
    ]);
    kpiRiskCounts = { configurations, targets, actuals, risks };
  });

  afterAll(async () => prisma.$disconnect());

  const createDraft = async (
    label: string,
    options: {
      tenant?: Tenant;
      owner?: User;
      approver?: User;
      department?: OrgDepartment;
      framework?: Framework;
    } = {},
  ) => {
    const tenant = options.tenant ?? tenantA;
    const owner = options.owner ?? ownerA;
    const approver = options.approver ?? approverA;
    const department = options.department ?? departmentA;
    const framework = options.framework ?? frameworkA;
    const policy = await prisma.policy.create({
      data: {
        tenantId: tenant.id,
        code: code(`POL-${label}`),
        title: `Synthetic Policy ${label}`,
        ownerId: owner.id,
        departmentId: department.id,
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    const version = await prisma.policyVersion.create({
      data: {
        tenantId: tenant.id,
        policyId: policy.id,
        sequence: 1,
        versionMajor: 1,
        versionMinor: 0,
        content: `# Synthetic Policy ${label}`,
        status: "DRAFT",
        effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
        reviewDate: new Date("2027-07-01T00:00:00.000Z"),
        requestedApproverId: approver.id,
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    const mapping = await prisma.policyFramework.create({
      data: {
        tenantId: tenant.id,
        policyId: policy.id,
        policyVersionId: version.id,
        frameworkId: framework.id,
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    return { policy, version, mapping };
  };

  const submit = (version: PolicyVersion, submitter: User) =>
    prisma.policyVersion.update({
      where: { id: version.id },
      data: {
        status: "SUBMITTED",
        submittedById: submitter.id,
        submittedAt: new Date(),
        updatedById: submitter.id,
      },
    });

  const approve = async (
    policy: Policy,
    version: PolicyVersion,
    approver: User,
    previous?: PolicyVersion,
  ) =>
    prisma.$transaction(async (transaction) => {
      if (previous) {
        await transaction.policyVersion.update({
          where: { id: previous.id },
          data: {
            status: "SUPERSEDED",
            supersededById: version.id,
            updatedById: approver.id,
          },
        });
      }
      const approved = await transaction.policyVersion.update({
        where: { id: version.id },
        data: {
          status: "APPROVED",
          approvedById: approver.id,
          approvedAt: new Date(),
          updatedById: approver.id,
        },
      });
      await transaction.policy.update({
        where: { id: policy.id },
        data: {
          currentApprovedVersionId: approved.id,
          nextVersionSequence: approved.sequence + 1,
          updatedById: approver.id,
        },
      });
      const decision = await transaction.policyApproval.create({
        data: {
          tenantId: policy.tenantId,
          policyId: policy.id,
          policyVersionId: approved.id,
          actedById: approver.id,
          decision: "APPROVED",
          comments: "Synthetic approval.",
        },
      });
      return { approved, decision };
    });

  it("allocates independent tenant codes atomically and rolls allocations back with the transaction", async () => {
    const concurrentCount = 5;
    const before = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantA.id },
      select: {
        nextPolicyNumber: true,
        nextControlNumber: true,
        nextCheckpointNumber: true,
      },
    });
    const allocate = (
      method:
        "allocatePolicyCode" | "allocateControlCode" | "allocateCheckpointCode",
    ) =>
      Promise.all(
        Array.from({ length: concurrentCount }, () =>
          prisma.$transaction((transaction) =>
            new GovernanceCodeRepository(transaction)[method](tenantA.id),
          ),
        ),
      );
    const [policyCodes, controlCodes, checkpointCodes] = await Promise.all([
      allocate("allocatePolicyCode"),
      allocate("allocateControlCode"),
      allocate("allocateCheckpointCode"),
    ]);
    const expectedCodes = (prefix: string, start: number) =>
      Array.from(
        { length: concurrentCount },
        (_, offset) => `${prefix}-${String(start + offset).padStart(3, "0")}`,
      );
    expect(policyCodes.sort()).toEqual(
      expectedCodes("POL", before.nextPolicyNumber),
    );
    expect(controlCodes.sort()).toEqual(
      expectedCodes("CTL", before.nextControlNumber),
    );
    expect(checkpointCodes.sort()).toEqual(
      expectedCodes("CHK", before.nextCheckpointNumber),
    );

    const after = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantA.id },
      select: {
        nextPolicyNumber: true,
        nextControlNumber: true,
        nextCheckpointNumber: true,
      },
    });
    expect(after).toEqual({
      nextPolicyNumber: before.nextPolicyNumber + concurrentCount,
      nextControlNumber: before.nextControlNumber + concurrentCount,
      nextCheckpointNumber: before.nextCheckpointNumber + concurrentCount,
    });

    await expect(
      prisma.$transaction(async (transaction) => {
        await new GovernanceCodeRepository(transaction).allocatePolicyCode(
          tenantA.id,
        );
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrowError("Synthetic rollback");
    expect(
      await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantA.id },
        select: { nextPolicyNumber: true },
      }),
    ).toEqual({ nextPolicyNumber: after.nextPolicyNumber });
  });

  it("enforces Policy immutability, self-approval, version uniqueness and atomic supersession", async () => {
    const first = await createDraft("WF");
    await expect(
      prisma.policyVersion.update({
        where: { id: first.version.id },
        data: { versionMinor: 99, updatedById: ownerA.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.policyVersion.update({
        where: { id: first.version.id },
        data: {
          content: "<section>Forbidden raw HTML</section>",
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    const submittedV1 = await submit(first.version, ownerA);
    const { approved: approvedV1, decision: decisionV1 } = await approve(
      first.policy,
      submittedV1,
      approverA,
    );

    await expect(
      prisma.policyVersion.update({
        where: { id: approvedV1.id },
        data: { content: "Forbidden mutation", updatedById: approverA.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.policyFramework.update({
        where: { id: first.mapping.id },
        data: { isActive: false, updatedById: approverA.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.policyApproval.update({
        where: { id: decisionV1.id },
        data: { comments: "Forbidden mutation" },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.policyApproval.delete({ where: { id: decisionV1.id } }),
    ).rejects.toBeTruthy();

    const version2 = await prisma.policyVersion.create({
      data: {
        tenantId: tenantA.id,
        policyId: first.policy.id,
        sequence: 2,
        versionMajor: 1,
        versionMinor: 1,
        content: "# Synthetic Policy WF version 1.1",
        effectiveDate: new Date("2026-07-10T00:00:00.000Z"),
        reviewDate: new Date("2027-07-10T00:00:00.000Z"),
        requestedApproverId: approverA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    await prisma.policyFramework.create({
      data: {
        tenantId: tenantA.id,
        policyId: first.policy.id,
        policyVersionId: version2.id,
        frameworkId: frameworkA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const submittedV2 = await submit(version2, ownerA);

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.policyVersion.update({
          where: { id: approvedV1.id },
          data: {
            status: "SUPERSEDED",
            supersededById: submittedV2.id,
            updatedById: ownerA.id,
          },
        });
        await transaction.policyVersion.update({
          where: { id: submittedV2.id },
          data: {
            status: "APPROVED",
            approvedById: ownerA.id,
            approvedAt: new Date(),
            updatedById: ownerA.id,
          },
        });
        await transaction.policy.update({
          where: { id: first.policy.id },
          data: {
            currentApprovedVersionId: submittedV2.id,
            updatedById: ownerA.id,
          },
        });
      }),
    ).rejects.toBeTruthy();
    expect(
      await prisma.policyVersion.findUniqueOrThrow({
        where: { id: approvedV1.id },
      }),
    ).toMatchObject({ status: "APPROVED", supersededById: null });

    const { approved: approvedV2 } = await approve(
      first.policy,
      submittedV2,
      approverA,
      approvedV1,
    );
    expect(
      await prisma.policy.findUniqueOrThrow({ where: { id: first.policy.id } }),
    ).toMatchObject({ currentApprovedVersionId: approvedV2.id });
    expect(
      await prisma.policyVersion.findUniqueOrThrow({
        where: { id: approvedV1.id },
      }),
    ).toMatchObject({
      status: "SUPERSEDED",
      supersededById: approvedV2.id,
    });

    await expect(
      prisma.policyVersion.create({
        data: {
          tenantId: tenantA.id,
          policyId: first.policy.id,
          sequence: 1,
          versionMajor: 1,
          versionMinor: 0,
          content: "Duplicate version",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();

    const version3 = await prisma.policyVersion.create({
      data: {
        tenantId: tenantA.id,
        policyId: first.policy.id,
        sequence: 3,
        versionMajor: 1,
        versionMinor: 2,
        content: "# Version 1.2",
        effectiveDate: new Date("2026-07-20T00:00:00.000Z"),
        reviewDate: new Date("2027-07-20T00:00:00.000Z"),
        requestedApproverId: approverA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const submittedV3 = await submit(version3, ownerA);
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.policyVersion.update({
          where: { id: submittedV3.id },
          data: {
            status: "APPROVED",
            approvedById: approverA.id,
            approvedAt: new Date(),
            updatedById: approverA.id,
          },
        });
        await transaction.policy.update({
          where: { id: first.policy.id },
          data: {
            currentApprovedVersionId: submittedV3.id,
            updatedById: approverA.id,
          },
        });
      }),
    ).rejects.toBeTruthy();
    expect(
      await prisma.policyVersion.findUniqueOrThrow({
        where: { id: submittedV3.id },
      }),
    ).toMatchObject({ status: "SUBMITTED" });
    await expect(
      prisma.policyApproval.create({
        data: {
          tenantId: tenantA.id,
          policyId: first.policy.id,
          policyVersionId: submittedV3.id,
          actedById: approverA.id,
          decision: "RESUBMITTED",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("enforces tenant, Policy Version and Framework Rule mapping lineage", async () => {
    const policyA = await createDraft("MAP-A");
    const approvedA = await approve(
      policyA.policy,
      await submit(policyA.version, ownerA),
      approverA,
    );
    const versionA11 = await prisma.policyVersion.create({
      data: {
        tenantId: tenantA.id,
        policyId: policyA.policy.id,
        sequence: 2,
        versionMajor: 1,
        versionMinor: 1,
        content: "# Synthetic Policy MAP-A version 1.1",
        effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
        reviewDate: new Date("2027-08-01T00:00:00.000Z"),
        requestedApproverId: approverA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const policyB = await createDraft("MAP-B", {
      tenant: tenantB,
      owner: ownerB,
      approver: approverB,
      department: departmentB,
      framework: frameworkB,
    });
    const approvedB = await approve(
      policyB.policy,
      await submit(policyB.version, ownerB),
      approverB,
    );
    const control = await prisma.control.create({
      data: {
        tenantId: tenantA.id,
        code: code("CTL-MAP"),
        title: "Synthetic Mapping Control",
        objective: "Verify version-preserving mappings.",
        ownerId: ownerA.id,
        departmentId: departmentA.id,
        implementationStatus: "IMPLEMENTED",
        controlType: "PREVENTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification.",
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const policyMapping = await prisma.controlPolicyVersion.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        policyId: policyA.policy.id,
        policyVersionId: approvedA.approved.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.controlPolicyVersion.create({
        data: {
          tenantId: tenantA.id,
          controlId: control.id,
          policyId: policyA.policy.id,
          policyVersionId: versionA11.id,
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    await prisma.controlPolicyVersion.update({
      where: { id: policyMapping.id },
      data: { isActive: false, updatedById: ownerA.id },
    });
    const replacementPolicyMapping = await prisma.controlPolicyVersion.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        policyId: policyA.policy.id,
        policyVersionId: versionA11.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    expect(replacementPolicyMapping.id).not.toBe(policyMapping.id);
    expect(
      await prisma.controlPolicyVersion.count({
        where: {
          tenantId: tenantA.id,
          controlId: control.id,
          policyId: policyA.policy.id,
        },
      }),
    ).toBe(2);
    expect(
      await prisma.controlPolicyVersion.findMany({
        where: {
          tenantId: tenantA.id,
          controlId: control.id,
          policyId: policyA.policy.id,
        },
        select: { policyVersionId: true, isActive: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        { policyVersionId: approvedA.approved.id, isActive: false },
        { policyVersionId: versionA11.id, isActive: true },
      ]),
    );
    const otherControl = await prisma.control.create({
      data: {
        tenantId: tenantA.id,
        code: code("CTL-MAP-OTHER"),
        title: "Synthetic Other Mapping Control",
        objective: "Prove mapping lineage cannot be rewritten.",
        implementationStatus: "IMPLEMENTED",
        controlType: "DETECTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification.",
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.controlPolicyVersion.update({
        where: { id: replacementPolicyMapping.id },
        data: { controlId: otherControl.id, updatedById: ownerA.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.controlPolicyVersion.create({
        data: {
          tenantId: tenantA.id,
          controlId: control.id,
          policyId: policyB.policy.id,
          policyVersionId: approvedB.approved.id,
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.controlPolicyVersion.delete({
        where: { id: replacementPolicyMapping.id },
      }),
    ).rejects.toBeTruthy();

    const activeFramework = await prisma.controlFramework.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        frameworkId: frameworkA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const activeRule = await prisma.ruleControl.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        frameworkId: frameworkA.id,
        frameworkRuleId: ruleA.id,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.ruleControl.create({
        data: {
          tenantId: tenantA.id,
          controlId: control.id,
          frameworkId: frameworkA.id,
          frameworkRuleId: ruleB.id,
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    const inactiveFramework = await prisma.controlFramework.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        frameworkId: frameworkB.id,
        isActive: false,
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    expect(inactiveFramework.isActive).toBe(false);
    await expect(
      prisma.ruleControl.create({
        data: {
          tenantId: tenantA.id,
          controlId: control.id,
          frameworkId: frameworkB.id,
          frameworkRuleId: ruleB.id,
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.controlFramework.update({
        where: { id: activeFramework.id },
        data: { isActive: false, updatedById: ownerA.id },
      }),
    ).rejects.toBeTruthy();
    expect(
      await prisma.ruleControl.findUniqueOrThrow({
        where: { id: activeRule.id },
      }),
    ).toMatchObject({ isActive: true });
  });

  it("rejects non-members, cross-tenant departments and invalid Controls transactionally", async () => {
    const tenantBoundPolicy = await createDraft("TENANT-BOUND");
    await expect(
      prisma.policy.update({
        where: { id: tenantBoundPolicy.policy.id },
        data: { tenantId: tenantB.id, updatedById: ownerB.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.control.create({
        data: {
          tenantId: tenantA.id,
          code: code("CTL-OUT"),
          title: "Invalid Owner Control",
          objective: "Reject an owner outside the tenant.",
          ownerId: outsider.id,
          departmentId: departmentA.id,
          implementationStatus: "IMPLEMENTED",
          controlType: "DETECTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Synthetic verification.",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.control.create({
        data: {
          tenantId: tenantA.id,
          code: code("CTL-DEP"),
          title: "Invalid Department Control",
          objective: "Reject a cross-tenant department.",
          departmentId: departmentB.id,
          implementationStatus: "IMPLEMENTED",
          controlType: "DETECTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Synthetic verification.",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.control.create({
        data: {
          tenantId: tenantA.id,
          code: code("CTL-NA"),
          title: "Invalid Not Applicable Control",
          objective: "Require implementation notes.",
          implementationStatus: "NOT_APPLICABLE",
          implementationNotes: " ",
          controlType: "DIRECTIVE",
          frequency: "ANNUAL",
          verificationMethod: "Synthetic verification.",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();

    const rollbackCode = code("CTL-RB");
    const crossTenantPolicy = await createDraft("RB-B", {
      tenant: tenantB,
      owner: ownerB,
      approver: approverB,
      department: departmentB,
      framework: frameworkB,
    });
    await expect(
      prisma.$transaction(async (transaction) => {
        const control = await transaction.control.create({
          data: {
            tenantId: tenantA.id,
            code: rollbackCode,
            title: "Rollback Control",
            objective: "This transaction must roll back.",
            implementationStatus: "IN_PROGRESS",
            controlType: "CORRECTIVE",
            frequency: "QUARTERLY",
            verificationMethod: "Synthetic verification.",
            createdById: ownerA.id,
            updatedById: ownerA.id,
          },
        });
        await transaction.controlPolicyVersion.create({
          data: {
            tenantId: tenantA.id,
            controlId: control.id,
            policyId: crossTenantPolicy.policy.id,
            policyVersionId: crossTenantPolicy.version.id,
            createdById: ownerA.id,
            updatedById: ownerA.id,
          },
        });
      }),
    ).rejects.toBeTruthy();
    expect(
      await prisma.control.findUnique({
        where: {
          tenantId_code: { tenantId: tenantA.id, code: rollbackCode },
        },
      }),
    ).toBeNull();
  });

  it("blocks Control archival until its own active Checkpoints are resolved", async () => {
    const createControl = (
      label: string,
      options: {
        tenant?: Tenant;
        owner?: User;
        department?: OrgDepartment;
      } = {},
    ) => {
      const tenant = options.tenant ?? tenantA;
      const owner = options.owner ?? ownerA;
      const department = options.department ?? departmentA;
      return prisma.control.create({
        data: {
          tenantId: tenant.id,
          code: code(`CTL-ARC-${label}`),
          title: `Synthetic Archive Control ${label}`,
          objective: "Verify explicit child lifecycle resolution.",
          ownerId: owner.id,
          departmentId: department.id,
          implementationStatus: "IMPLEMENTED",
          controlType: "PREVENTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Synthetic verification.",
          createdById: owner.id,
          updatedById: owner.id,
        },
      });
    };
    const createCheckpoint = (
      label: string,
      controlId: string,
      options: {
        tenant?: Tenant;
        owner?: User;
        department?: OrgDepartment;
      } = {},
    ) => {
      const tenant = options.tenant ?? tenantA;
      const owner = options.owner ?? ownerA;
      const department = options.department ?? departmentA;
      return prisma.checkpoint.create({
        data: {
          tenantId: tenant.id,
          controlId,
          code: code(`CHK-ARC-${label}`),
          title: `Synthetic Archive Checkpoint ${label}`,
          verificationFrequency: "MONTHLY",
          ownerId: owner.id,
          departmentId: department.id,
          expectedResult: "The synthetic archive condition passes.",
          createdById: owner.id,
          updatedById: owner.id,
        },
      });
    };

    const inactiveChildControl = await createControl("INACTIVE");
    const activeCheckpoint = await createCheckpoint(
      "ACTIVE",
      inactiveChildControl.id,
    );
    const originalTitle = inactiveChildControl.title;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.control.update({
          where: { id: inactiveChildControl.id },
          data: {
            title: "This staged change must roll back",
            updatedById: ownerA.id,
          },
        });
        await transaction.control.update({
          where: { id: inactiveChildControl.id },
          data: {
            lifecycleStatus: "ARCHIVED",
            archivedAt: new Date(),
            updatedById: ownerA.id,
          },
        });
      }),
    ).rejects.toBeTruthy();
    expect(
      await prisma.control.findUniqueOrThrow({
        where: { id: inactiveChildControl.id },
      }),
    ).toMatchObject({
      title: originalTitle,
      lifecycleStatus: "ACTIVE",
      archivedAt: null,
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: activeCheckpoint.id },
      }),
    ).toMatchObject({ lifecycleStatus: "ACTIVE", archivedAt: null });

    await prisma.checkpoint.update({
      where: { id: activeCheckpoint.id },
      data: { lifecycleStatus: "INACTIVE", updatedById: ownerA.id },
    });
    await prisma.control.update({
      where: { id: inactiveChildControl.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: activeCheckpoint.id },
      }),
    ).toMatchObject({ lifecycleStatus: "INACTIVE", archivedAt: null });

    const archivedChildControl = await createControl("ARCHIVED");
    const archivedCheckpoint = await createCheckpoint(
      "ARCHIVED",
      archivedChildControl.id,
    );
    await prisma.checkpoint.update({
      where: { id: archivedCheckpoint.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    await prisma.control.update({
      where: { id: archivedChildControl.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.control.update({
        where: { id: archivedChildControl.id },
        data: {
          title: "Forbidden archived mutation",
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toBeTruthy();

    const tenantAControl = await createControl("TENANT-A");
    const tenantBControl = await createControl("TENANT-B", {
      tenant: tenantB,
      owner: ownerB,
      department: departmentB,
    });
    const tenantBCheckpoint = await createCheckpoint(
      "TENANT-B",
      tenantBControl.id,
      {
        tenant: tenantB,
        owner: ownerB,
        department: departmentB,
      },
    );
    await prisma.control.update({
      where: { id: tenantAControl.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: tenantBCheckpoint.id },
      }),
    ).toMatchObject({
      tenantId: tenantB.id,
      controlId: tenantBControl.id,
      lifecycleStatus: "ACTIVE",
    });
  });

  it("enforces reciprocal Control and Checkpoint lifecycle with parent-row locking", async () => {
    const createControl = (label: string) =>
      prisma.control.create({
        data: {
          tenantId: tenantA.id,
          code: code(`CTL-REC-${label}`),
          title: `Synthetic Reciprocal Control ${label}`,
          objective: "Verify reciprocal archive and activation invariants.",
          ownerId: ownerA.id,
          departmentId: departmentA.id,
          implementationStatus: "IMPLEMENTED",
          controlType: "PREVENTIVE",
          frequency: "MONTHLY",
          verificationMethod: "Synthetic verification.",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      });
    const checkpointData = (
      label: string,
      controlId: string,
      lifecycleStatus: "ACTIVE" | "INACTIVE" = "ACTIVE",
    ) => ({
      tenantId: tenantA.id,
      controlId,
      code: code(`CHK-REC-${label}`),
      title: `Synthetic Reciprocal Checkpoint ${label}`,
      verificationFrequency: "MONTHLY" as const,
      ownerId: ownerA.id,
      departmentId: departmentA.id,
      expectedResult: "The synthetic reciprocal condition passes.",
      lifecycleStatus,
      createdById: ownerA.id,
      updatedById: ownerA.id,
    });

    const archivedParent = await createControl("ARCHIVED-PARENT");
    await prisma.control.update({
      where: { id: archivedParent.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    const archivedParentBefore = await prisma.control.findUniqueOrThrow({
      where: { id: archivedParent.id },
    });
    await expect(
      prisma.checkpoint.create({
        data: checkpointData("ACTIVE-UNDER-ARCHIVED", archivedParent.id),
      }),
    ).rejects.toThrow(/ACTIVE Checkpoint cannot reference an ARCHIVED Control/);
    expect(
      await prisma.control.findUniqueOrThrow({
        where: { id: archivedParent.id },
      }),
    ).toMatchObject({
      title: archivedParentBefore.title,
      lifecycleStatus: "ARCHIVED",
      archivedAt: archivedParentBefore.archivedAt,
    });
    expect(
      await prisma.checkpoint.count({
        where: { controlId: archivedParent.id },
      }),
    ).toBe(0);

    const inactiveUnderArchived = await prisma.checkpoint.create({
      data: checkpointData(
        "INACTIVE-UNDER-ARCHIVED",
        archivedParent.id,
        "INACTIVE",
      ),
    });
    expect(inactiveUnderArchived).toMatchObject({
      controlId: archivedParent.id,
      lifecycleStatus: "INACTIVE",
      archivedAt: null,
    });

    await expect(
      prisma.checkpoint.update({
        where: { id: inactiveUnderArchived.id },
        data: { lifecycleStatus: "ACTIVE", updatedById: ownerA.id },
      }),
    ).rejects.toThrow(/ACTIVE Checkpoint cannot reference an ARCHIVED Control/);
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: inactiveUnderArchived.id },
      }),
    ).toMatchObject({ lifecycleStatus: "INACTIVE", archivedAt: null });
    expect(
      await prisma.control.findUniqueOrThrow({
        where: { id: archivedParent.id },
      }),
    ).toMatchObject({ lifecycleStatus: "ARCHIVED" });

    const archiveBlocked = await createControl("ARCHIVE-BLOCKED");
    const blockingActive = await prisma.checkpoint.create({
      data: checkpointData("BLOCKING-ACTIVE", archiveBlocked.id),
    });
    const archiveBlockedTitle = archiveBlocked.title;
    await expect(
      prisma.control.update({
        where: { id: archiveBlocked.id },
        data: {
          lifecycleStatus: "ARCHIVED",
          archivedAt: new Date(),
          updatedById: ownerA.id,
        },
      }),
    ).rejects.toThrow(
      /Control cannot be archived while active Checkpoints exist/,
    );
    expect(
      await prisma.control.findUniqueOrThrow({
        where: { id: archiveBlocked.id },
      }),
    ).toMatchObject({
      title: archiveBlockedTitle,
      lifecycleStatus: "ACTIVE",
      archivedAt: null,
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: blockingActive.id },
      }),
    ).toMatchObject({ lifecycleStatus: "ACTIVE", archivedAt: null });

    const otherTenantControl = await prisma.control.create({
      data: {
        tenantId: tenantB.id,
        code: code("CTL-REC-TENANT-B"),
        title: "Synthetic Reciprocal Control TENANT-B",
        objective: "Cross-tenant reciprocal isolation.",
        ownerId: ownerB.id,
        departmentId: departmentB.id,
        implementationStatus: "IMPLEMENTED",
        controlType: "DETECTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification.",
        createdById: ownerB.id,
        updatedById: ownerB.id,
      },
    });
    const otherTenantActive = await prisma.checkpoint.create({
      data: {
        tenantId: tenantB.id,
        controlId: otherTenantControl.id,
        code: code("CHK-REC-TENANT-B"),
        title: "Synthetic Reciprocal Checkpoint TENANT-B",
        verificationFrequency: "MONTHLY",
        ownerId: ownerB.id,
        departmentId: departmentB.id,
        expectedResult: "Other-tenant active child.",
        createdById: ownerB.id,
        updatedById: ownerB.id,
      },
    });
    const isolatable = await createControl("TENANT-ISOLATION");
    await prisma.control.update({
      where: { id: isolatable.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: otherTenantActive.id },
      }),
    ).toMatchObject({
      tenantId: tenantB.id,
      controlId: otherTenantControl.id,
      lifecycleStatus: "ACTIVE",
    });
    await expect(
      prisma.checkpoint.create({
        data: checkpointData("STILL-REJECTED", isolatable.id),
      }),
    ).rejects.toThrow(/ACTIVE Checkpoint cannot reference an ARCHIVED Control/);

    const createRaceClients = () => {
      const url = process.env.DATABASE_URL_TEST!;
      return {
        archiveClient: new PrismaClient({
          datasources: { db: { url } },
        }),
        activateClient: new PrismaClient({
          datasources: { db: { url } },
        }),
      };
    };
    const expectNeverArchivedWithActive = async (controlId: string) => {
      const control = await prisma.control.findUniqueOrThrow({
        where: { id: controlId },
      });
      const activeChildren = await prisma.checkpoint.count({
        where: { controlId, lifecycleStatus: "ACTIVE" },
      });
      expect(
        !(control.lifecycleStatus === "ARCHIVED" && activeChildren > 0),
      ).toBe(true);
      return { control, activeChildren };
    };
    const waitForLockWait = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND datname = current_database()
            AND pid <> pg_backend_pid()
        `;
        if ((waiting[0]?.count ?? 0) > 0) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Timed out waiting for Control row lock contention");
    };

    const raceArchiveThenActivate = await createControl("RACE-A-FIRST");
    {
      const { archiveClient, activateClient } = createRaceClients();
      await archiveClient.$connect();
      await activateClient.$connect();
      try {
        let releaseActivate!: () => void;
        const activateMayStart = new Promise<void>((resolve) => {
          releaseActivate = resolve;
        });
        let releaseArchiveContinue!: () => void;
        const archiveMayFinish = new Promise<void>((resolve) => {
          releaseArchiveContinue = resolve;
        });

        const archiveTxn = archiveClient.$transaction(
          async (transaction) => {
            await transaction.$queryRaw`
              SELECT "id"
              FROM "controls"
              WHERE "id" = ${raceArchiveThenActivate.id}::uuid
              FOR UPDATE
            `;
            releaseActivate();
            await archiveMayFinish;
            return transaction.control.update({
              where: { id: raceArchiveThenActivate.id },
              data: {
                lifecycleStatus: "ARCHIVED",
                archivedAt: new Date(),
                updatedById: ownerA.id,
              },
            });
          },
          { maxWait: 20_000, timeout: 20_000 },
        );

        const activateTxn = (async () => {
          await activateMayStart;
          const pending = activateClient.$transaction(
            async (transaction) =>
              transaction.checkpoint.create({
                data: checkpointData(
                  "RACE-A-ACTIVATE",
                  raceArchiveThenActivate.id,
                ),
              }),
            { maxWait: 20_000, timeout: 20_000 },
          );
          await waitForLockWait();
          releaseArchiveContinue();
          return pending;
        })();

        const settled = await Promise.allSettled([archiveTxn, activateTxn]);
        const fulfilled = settled.filter(
          (result) => result.status === "fulfilled",
        );
        const rejected = settled.filter(
          (result) => result.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const finalState = await expectNeverArchivedWithActive(
          raceArchiveThenActivate.id,
        );
        expect(
          finalState.control.lifecycleStatus === "ARCHIVED" ||
            finalState.activeChildren === 1,
        ).toBe(true);
      } finally {
        await Promise.all([
          archiveClient.$disconnect(),
          activateClient.$disconnect(),
        ]);
      }
    }

    const raceActivateThenArchive = await createControl("RACE-B-FIRST");
    {
      const { archiveClient, activateClient } = createRaceClients();
      await archiveClient.$connect();
      await activateClient.$connect();
      try {
        let releaseArchive!: () => void;
        const archiveMayStart = new Promise<void>((resolve) => {
          releaseArchive = resolve;
        });
        let releaseActivateContinue!: () => void;
        const activateMayFinish = new Promise<void>((resolve) => {
          releaseActivateContinue = resolve;
        });

        const activateTxn = activateClient.$transaction(
          async (transaction) => {
            await transaction.$queryRaw`
              SELECT "id"
              FROM "controls"
              WHERE "id" = ${raceActivateThenArchive.id}::uuid
              FOR UPDATE
            `;
            releaseArchive();
            await activateMayFinish;
            return transaction.checkpoint.create({
              data: checkpointData(
                "RACE-B-ACTIVATE",
                raceActivateThenArchive.id,
              ),
            });
          },
          { maxWait: 20_000, timeout: 20_000 },
        );

        const archiveTxn = (async () => {
          await archiveMayStart;
          const pending = archiveClient.$transaction(
            async (transaction) =>
              transaction.control.update({
                where: { id: raceActivateThenArchive.id },
                data: {
                  lifecycleStatus: "ARCHIVED",
                  archivedAt: new Date(),
                  updatedById: ownerA.id,
                },
              }),
            { maxWait: 20_000, timeout: 20_000 },
          );
          await waitForLockWait();
          releaseActivateContinue();
          return pending;
        })();

        const settled = await Promise.allSettled([activateTxn, archiveTxn]);
        const fulfilled = settled.filter(
          (result) => result.status === "fulfilled",
        );
        const rejected = settled.filter(
          (result) => result.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const finalState = await expectNeverArchivedWithActive(
          raceActivateThenArchive.id,
        );
        expect(
          finalState.control.lifecycleStatus === "ARCHIVED" ||
            finalState.activeChildren === 1,
        ).toBe(true);
      } finally {
        await Promise.all([
          archiveClient.$disconnect(),
          activateClient.$disconnect(),
        ]);
      }
    }

    const deadlockControl = await createControl("DEADLOCK");
    {
      const { archiveClient, activateClient } = createRaceClients();
      await archiveClient.$connect();
      await activateClient.$connect();
      try {
        const settled = await Promise.allSettled([
          archiveClient.$transaction(
            async (transaction) => {
              await transaction.$queryRaw`
                SELECT "id"
                FROM "controls"
                WHERE "id" = ${deadlockControl.id}::uuid
                FOR UPDATE
              `;
              await transaction.$executeRaw`SELECT pg_sleep(0.05)`;
              return transaction.control.update({
                where: { id: deadlockControl.id },
                data: {
                  lifecycleStatus: "ARCHIVED",
                  archivedAt: new Date(),
                  updatedById: ownerA.id,
                },
              });
            },
            { maxWait: 20_000, timeout: 20_000 },
          ),
          activateClient.$transaction(
            async (transaction) => {
              await transaction.$executeRaw`SELECT pg_sleep(0.01)`;
              return transaction.checkpoint.create({
                data: checkpointData("DEADLOCK-ACTIVATE", deadlockControl.id),
              });
            },
            { maxWait: 20_000, timeout: 20_000 },
          ),
        ]);
        for (const result of settled) {
          if (result.status === "rejected") {
            expect(String(result.reason)).not.toMatch(/deadlock detected/i);
          }
        }
        const fulfilled = settled.filter(
          (result) => result.status === "fulfilled",
        );
        const rejected = settled.filter(
          (result) => result.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        await expectNeverArchivedWithActive(deadlockControl.id);
      } finally {
        await Promise.all([
          archiveClient.$disconnect(),
          activateClient.$disconnect(),
        ]);
      }
    }
  });

  it("enforces Checkpoint review periods, uniqueness, append-only history and terminal archive", async () => {
    const control = await prisma.control.create({
      data: {
        tenantId: tenantA.id,
        code: code("CTL-CHK"),
        title: "Checkpoint Parent Control",
        objective: "Verify Checkpoint invariants.",
        ownerId: ownerA.id,
        departmentId: departmentA.id,
        implementationStatus: "IN_PROGRESS",
        controlType: "CORRECTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification.",
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const checkpoint = await prisma.checkpoint.create({
      data: {
        tenantId: tenantA.id,
        controlId: control.id,
        code: code("CHK"),
        title: "Synthetic Checkpoint",
        verificationFrequency: "MONTHLY",
        ownerId: ownerA.id,
        departmentId: departmentA.id,
        expectedResult: "The synthetic condition passes.",
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.checkpointReview.create({
        data: {
          tenantId: tenantA.id,
          checkpointId: checkpoint.id,
          reviewPeriod: "2026-Q3",
          reviewDate: new Date("2026-07-30T00:00:00.000Z"),
          reviewerId: approverA.id,
          outcome: "PASS",
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.checkpointReview.create({
        data: {
          tenantId: tenantA.id,
          checkpointId: checkpoint.id,
          reviewPeriod: "2026-02-30",
          reviewDate: new Date("2026-02-28T00:00:00.000Z"),
          reviewerId: approverA.id,
          outcome: "PASS",
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.checkpointReview.create({
        data: {
          tenantId: tenantA.id,
          checkpointId: checkpoint.id,
          reviewPeriod: "2026-07",
          reviewDate: new Date("2026-07-30T00:00:00.000Z"),
          reviewerId: approverA.id,
          outcome: "PARTIAL",
          observation: " ",
        },
      }),
    ).rejects.toBeTruthy();
    const partialReview = await prisma.checkpointReview.create({
      data: {
        tenantId: tenantA.id,
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-05",
        reviewDate: new Date("2026-05-31T00:00:00.000Z"),
        reviewerId: approverA.id,
        outcome: "PARTIAL",
        observation: "Partial synthetic observation.",
      },
    });
    expect(partialReview).toMatchObject({
      outcome: "PARTIAL",
      observation: "Partial synthetic observation.",
    });
    const failReview = await prisma.checkpointReview.create({
      data: {
        tenantId: tenantA.id,
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-06",
        reviewDate: new Date("2026-06-30T00:00:00.000Z"),
        reviewerId: approverA.id,
        outcome: "FAIL",
        observation: "Failed synthetic observation.",
      },
    });
    expect(failReview).toMatchObject({
      outcome: "FAIL",
      observation: "Failed synthetic observation.",
    });
    const review = await prisma.checkpointReview.create({
      data: {
        tenantId: tenantA.id,
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-07",
        reviewDate: new Date("2026-07-30T00:00:00.000Z"),
        reviewerId: approverA.id,
        outcome: "PASS",
        observation: "Synthetic verification passed.",
        nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
      },
    });
    expect(
      await prisma.checkpoint.findUniqueOrThrow({
        where: { id: checkpoint.id },
      }),
    ).toMatchObject({
      latestReviewId: review.id,
      nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
    });
    await expect(
      prisma.checkpointReview.create({
        data: {
          tenantId: tenantA.id,
          checkpointId: checkpoint.id,
          reviewPeriod: "2026-07",
          reviewDate: new Date("2026-07-31T00:00:00.000Z"),
          reviewerId: approverA.id,
          outcome: "PASS",
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.checkpointReview.update({
        where: { id: review.id },
        data: { recommendation: "Forbidden mutation." },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.checkpointReview.delete({ where: { id: review.id } }),
    ).rejects.toBeTruthy();

    await prisma.checkpoint.update({
      where: { id: checkpoint.id },
      data: {
        lifecycleStatus: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: ownerA.id,
      },
    });
    await expect(
      prisma.checkpoint.update({
        where: { id: checkpoint.id },
        data: { title: "Forbidden archived mutation", updatedById: ownerA.id },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.checkpoint.delete({ where: { id: checkpoint.id } }),
    ).rejects.toBeTruthy();
  });

  it("selects the latest Checkpoint review deterministically under reordered and concurrent inserts", async () => {
    const reviewIdPrefix = randomUUID().slice(0, 24);
    const reviewId = (ordinal: number) =>
      `${reviewIdPrefix}${String(ordinal).padStart(12, "0")}`;
    const control = await prisma.control.create({
      data: {
        tenantId: tenantA.id,
        code: code("CTL-ORDER"),
        title: "Checkpoint Review Ordering Control",
        objective: "Verify deterministic latest-review summaries.",
        ownerId: ownerA.id,
        departmentId: departmentA.id,
        implementationStatus: "IMPLEMENTED",
        controlType: "DETECTIVE",
        frequency: "MONTHLY",
        verificationMethod: "Synthetic verification.",
        createdById: ownerA.id,
        updatedById: ownerA.id,
      },
    });
    const createCheckpoint = (label: string) =>
      prisma.checkpoint.create({
        data: {
          tenantId: tenantA.id,
          controlId: control.id,
          code: code(`CHK-ORDER-${label}`),
          title: `Synthetic Review Ordering Checkpoint ${label}`,
          verificationFrequency: "MONTHLY",
          ownerId: ownerA.id,
          departmentId: departmentA.id,
          expectedResult: "The deterministic ordering condition passes.",
          createdById: ownerA.id,
          updatedById: ownerA.id,
        },
      });
    const createReview = (input: {
      id: string;
      checkpointId: string;
      reviewPeriod: string;
      submittedAt: Date;
      nextReviewDate: Date;
      outcome: "PASS" | "NOT_APPLICABLE";
    }) =>
      prisma.checkpointReview.create({
        data: {
          id: input.id,
          tenantId: tenantA.id,
          checkpointId: input.checkpointId,
          reviewPeriod: input.reviewPeriod,
          reviewDate: new Date("2026-07-30T00:00:00.000Z"),
          reviewerId: approverA.id,
          outcome: input.outcome,
          nextReviewDate: input.nextReviewDate,
          submittedAt: input.submittedAt,
        },
      });
    const expectLatest = async (
      checkpointId: string,
      expected: {
        id: string;
        submittedAt: Date;
        nextReviewDate: Date;
        outcome: "PASS" | "NOT_APPLICABLE";
      },
    ) => {
      const checkpoint = await prisma.checkpoint.findUniqueOrThrow({
        where: { id: checkpointId },
        include: { latestReview: true },
      });
      expect(checkpoint).toMatchObject({
        latestReviewId: expected.id,
        lastReviewedAt: expected.submittedAt,
        nextReviewDate: expected.nextReviewDate,
      });
      expect(checkpoint.latestReview).toMatchObject({
        id: expected.id,
        checkpointId,
        submittedAt: expected.submittedAt,
        nextReviewDate: expected.nextReviewDate,
        outcome: expected.outcome,
      });
    };

    const chronologicalCheckpoint = await createCheckpoint("CHRONOLOGICAL");
    const chronologicalEarlier = {
      id: reviewId(10),
      checkpointId: chronologicalCheckpoint.id,
      reviewPeriod: "2026-07",
      submittedAt: new Date("2026-07-30T10:00:00.000Z"),
      nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
      outcome: "PASS" as const,
    };
    const chronologicalLater = {
      id: reviewId(20),
      checkpointId: chronologicalCheckpoint.id,
      reviewPeriod: "2026-08",
      submittedAt: new Date("2026-07-30T11:00:00.000Z"),
      nextReviewDate: new Date("2026-09-30T00:00:00.000Z"),
      outcome: "NOT_APPLICABLE" as const,
    };
    await createReview(chronologicalEarlier);
    await createReview(chronologicalLater);
    await expectLatest(chronologicalCheckpoint.id, chronologicalLater);

    const olderAfterNewerCheckpoint =
      await createCheckpoint("OLDER-AFTER-NEWER");
    const newerFirst = {
      ...chronologicalLater,
      id: reviewId(40),
      checkpointId: olderAfterNewerCheckpoint.id,
    };
    const olderSecond = {
      ...chronologicalEarlier,
      id: reviewId(30),
      checkpointId: olderAfterNewerCheckpoint.id,
    };
    await createReview(newerFirst);
    await createReview(olderSecond);
    await expectLatest(olderAfterNewerCheckpoint.id, newerFirst);

    const equalForwardCheckpoint = await createCheckpoint("EQUAL-FORWARD");
    const equalSubmittedAt = new Date("2026-07-30T12:00:00.000Z");
    const equalForwardSmaller = {
      id: reviewId(50),
      checkpointId: equalForwardCheckpoint.id,
      reviewPeriod: "2026-07",
      submittedAt: equalSubmittedAt,
      nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
      outcome: "PASS" as const,
    };
    const equalForwardGreater = {
      id: reviewId(60),
      checkpointId: equalForwardCheckpoint.id,
      reviewPeriod: "2026-08",
      submittedAt: equalSubmittedAt,
      nextReviewDate: new Date("2026-09-30T00:00:00.000Z"),
      outcome: "NOT_APPLICABLE" as const,
    };
    await createReview(equalForwardSmaller);
    await createReview(equalForwardGreater);
    await expectLatest(equalForwardCheckpoint.id, equalForwardGreater);

    const equalReverseCheckpoint = await createCheckpoint("EQUAL-REVERSE");
    const equalReverseSmaller = {
      ...equalForwardSmaller,
      id: reviewId(70),
      checkpointId: equalReverseCheckpoint.id,
    };
    const equalReverseGreater = {
      ...equalForwardGreater,
      id: reviewId(80),
      checkpointId: equalReverseCheckpoint.id,
    };
    await createReview(equalReverseGreater);
    await createReview(equalReverseSmaller);
    await expectLatest(equalReverseCheckpoint.id, equalReverseGreater);

    const concurrentCheckpoint = await createCheckpoint("CONCURRENT");
    const concurrentEarlier = {
      ...chronologicalEarlier,
      id: reviewId(90),
      checkpointId: concurrentCheckpoint.id,
    };
    const concurrentLater = {
      ...chronologicalLater,
      id: reviewId(100),
      checkpointId: concurrentCheckpoint.id,
    };
    await Promise.all([
      createReview(concurrentEarlier),
      createReview(concurrentLater),
    ]);
    await expectLatest(concurrentCheckpoint.id, concurrentLater);
  });

  it("seeds the permission catalogue idempotently without altering unknown roles", async () => {
    const seededTenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const customRole = await prisma.role.create({
      data: {
        tenantId: seededTenant.id,
        code: code("CUSTOM"),
        name: "Synthetic Custom Role",
        status: "ACTIVE",
      },
    });
    const existingPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: "frameworks:read" },
    });
    const preservedAssignment = await prisma.rolePermission.create({
      data: {
        roleId: customRole.id,
        permissionId: existingPermission.id,
      },
    });
    const activeGovernanceMapping =
      await prisma.controlPolicyVersion.findFirstOrThrow({
        where: { tenantId: seededTenant.id, isActive: true },
      });
    const preservedInactiveMapping = await prisma.controlPolicyVersion.create({
      data: {
        tenantId: seededTenant.id,
        controlId: activeGovernanceMapping.controlId,
        policyId: activeGovernanceMapping.policyId,
        policyVersionId: activeGovernanceMapping.policyVersionId,
        isActive: false,
        createdById: activeGovernanceMapping.createdById,
        updatedById: activeGovernanceMapping.updatedById,
      },
    });
    await prisma.tenant.update({
      where: { id: seededTenant.id },
      data: {
        nextPolicyNumber: 5,
        nextControlNumber: 1,
        nextCheckpointNumber: 7,
      },
    });

    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, ["run", "prisma:seed:test"], {
      cwd: backendDirectory,
      env: process.env,
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    const permissionCodes = [
      "policies:read",
      "policies:write",
      "policies:submit",
      "policies:approve",
      "controls:read",
      "controls:write",
      "checkpoints:read",
      "checkpoints:write",
      "checkpoints:review",
    ];
    expect(
      await prisma.permission.count({
        where: { code: { in: permissionCodes } },
      }),
    ).toBe(permissionCodes.length);

    const [adminRole, companyUserRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: {
          tenantId_code: {
            tenantId: seededTenant.id,
            code: "COMPANY_ADMIN",
          },
        },
        include: { permissions: { include: { permission: true } } },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          tenantId_code: {
            tenantId: seededTenant.id,
            code: "COMPANY_USER",
          },
        },
        include: { permissions: { include: { permission: true } } },
      }),
    ]);
    const adminCodes = adminRole.permissions.map(
      ({ permission }) => permission.code,
    );
    const userCodes = companyUserRole.permissions.map(
      ({ permission }) => permission.code,
    );
    expect(adminCodes).toEqual(expect.arrayContaining(permissionCodes));
    expect(userCodes).toEqual(
      expect.arrayContaining([
        "policies:read",
        "controls:read",
        "checkpoints:read",
      ]),
    );
    expect(userCodes).not.toEqual(
      expect.arrayContaining([
        "policies:write",
        "controls:write",
        "checkpoints:review",
      ]),
    );
    expect(
      await prisma.rolePermission.findUnique({
        where: { id: preservedAssignment.id },
      }),
    ).toBeTruthy();
    expect(
      await prisma.controlPolicyVersion.findUniqueOrThrow({
        where: { id: preservedInactiveMapping.id },
      }),
    ).toMatchObject({ isActive: false });
    expect(
      await prisma.controlPolicyVersion.count({
        where: {
          tenantId: seededTenant.id,
          controlId: activeGovernanceMapping.controlId,
          policyId: activeGovernanceMapping.policyId,
          isActive: true,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.tenant.findUniqueOrThrow({
        where: { id: seededTenant.id },
        select: {
          nextPolicyNumber: true,
          nextControlNumber: true,
          nextCheckpointNumber: true,
        },
      }),
    ).toEqual({
      nextPolicyNumber: 5,
      nextControlNumber: 2,
      nextCheckpointNumber: 7,
    });
  });

  it("does not mutate existing KPI or Risk records", async () => {
    const [configurations, targets, actuals, risks] = await Promise.all([
      prisma.kpiConfiguration.count(),
      prisma.kpiTarget.count(),
      prisma.kpiActual.count(),
      prisma.risk.count(),
    ]);
    expect({ configurations, targets, actuals, risks }).toEqual(kpiRiskCounts);
  });

  it("reconciles every migration-defined enum, table, constraint, index, function and trigger with PostgreSQL", async () => {
    const expectedEnums = new Map<string, string[]>([
      ["CheckpointOutcome", ["PASS", "PARTIAL", "FAIL", "NOT_APPLICABLE"]],
      [
        "ControlImplementationStatus",
        [
          "NOT_STARTED",
          "IN_PROGRESS",
          "PARTIALLY_IMPLEMENTED",
          "IMPLEMENTED",
          "NOT_APPLICABLE",
        ],
      ],
      ["ControlType", ["PREVENTIVE", "DETECTIVE", "CORRECTIVE", "DIRECTIVE"]],
      ["GovernanceRecordStatus", ["ACTIVE", "INACTIVE", "ARCHIVED"]],
      [
        "PolicyVersionStatus",
        [
          "DRAFT",
          "SUBMITTED",
          "APPROVED",
          "REJECTED",
          "SUPERSEDED",
          "OBSOLETE",
        ],
      ],
    ]);
    const expectedTables = [
      "checkpoint_reviews",
      "checkpoints",
      "control_frameworks",
      "control_policy_versions",
      "controls",
      "policies",
      "policy_approvals",
      "policy_frameworks",
      "policy_versions",
      "rule_controls",
    ];
    const namesFromMigration = (pattern: RegExp) =>
      [...governanceMigrationSql.matchAll(pattern)].map((match) => match[1]);
    const expectedConstraints = namesFromMigration(/CONSTRAINT "([^"]+)"/g);
    const expectedIndexes = namesFromMigration(
      /CREATE (?:UNIQUE )?INDEX "([^"]+)"/g,
    );
    const expectedFunctions = namesFromMigration(
      /CREATE OR REPLACE FUNCTION ([a-z_]+)/g,
    );
    const expectedTriggers = namesFromMigration(
      /CREATE (?:CONSTRAINT )?TRIGGER "([^"]+)"/g,
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
        AND type.typname IN (
          'CheckpointOutcome',
          'ControlImplementationStatus',
          'ControlType',
          'GovernanceRecordStatus',
          'PolicyVersionStatus'
        )
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
          'checkpoint_reviews',
          'checkpoints',
          'control_frameworks',
          'control_policy_versions',
          'controls',
          'policies',
          'policy_approvals',
          'policy_frameworks',
          'policy_versions',
          'rule_controls'
        )
      ORDER BY tablename
    `;
    expect(tableRows.map(({ name }) => name)).toEqual(expectedTables);

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
    const activeControlPolicyIndex = indexRows.find(
      ({ name }) => name === "control_policy_versions_one_active_mapping",
    )?.definition;
    expect(activeControlPolicyIndex).toMatch(
      /UNIQUE INDEX .* USING btree \(tenant_id, control_id, policy_id\) WHERE is_active/,
    );
    expect(activeControlPolicyIndex).not.toContain("policy_version_id");
    expect(
      indexRows.find(
        ({ name }) => name === "policy_versions_one_current_approved",
      )?.definition,
    ).toMatch(/UNIQUE.*WHERE \(status = 'APPROVED'/);

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
    const archiveFunction = functionRows.find(
      ({ name }) => name === "enforce_terminal_governance_archive",
    )?.definition;
    expect(archiveFunction).toContain("TG_TABLE_NAME = 'controls'");
    expect(archiveFunction).toContain('"tenant_id" = OLD."tenant_id"');
    expect(archiveFunction).toContain('"control_id" = OLD."id"');
    expect(archiveFunction).toContain("\"lifecycle_status\" = 'ACTIVE'");
    expect(archiveFunction).toContain("FOR UPDATE");
    const parentLifecycleFunction = functionRows.find(
      ({ name }) => name === "enforce_checkpoint_parent_control_lifecycle",
    )?.definition;
    expect(parentLifecycleFunction).toContain("FOR UPDATE");
    expect(parentLifecycleFunction).toContain(
      "ACTIVE Checkpoint cannot reference an ARCHIVED Control",
    );
    expect(parentLifecycleFunction).toContain(
      "\"lifecycle_status\" = 'ACTIVE'",
    );
    expect(parentLifecycleFunction).toContain(
      "parent_lifecycle = 'ARCHIVED'",
    );
    const latestReviewFunction = functionRows.find(
      ({ name }) => name === "sync_checkpoint_latest_review",
    )?.definition;
    expect(latestReviewFunction).toContain(
      '"last_reviewed_at" < NEW."submitted_at"',
    );
    expect(latestReviewFunction).toContain(
      '"latest_review_id"::TEXT < NEW."id"::TEXT',
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

    const migrationRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    expect(migrationRows).toHaveLength(1);
    expect(Number(migrationRows[0]?.count)).toBe(10);
  });
});
