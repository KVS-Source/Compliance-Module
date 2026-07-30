import type { PrismaClient } from "@prisma/client";

interface GovernanceSeedInput {
  tenantId: string;
  ownerId: string;
  approverId: string;
  departmentId: string;
  frameworkId: string;
  frameworkRuleId: string;
  codePrefix?: "DEMO-";
}

const ensureAudit = async (
  db: PrismaClient,
  input: {
    tenantId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, string | number | boolean>;
  },
) => {
  const exists = await db.auditEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    },
    select: { id: true },
  });
  if (!exists) {
    await db.auditEvent.create({ data: input });
  }
};

export async function seedGovernanceFoundation(
  db: PrismaClient,
  input: GovernanceSeedInput,
) {
  if (input.ownerId === input.approverId) {
    throw new Error("Governance seed requires distinct submitter and approver");
  }
  const prefix = input.codePrefix ?? "";
  const policyCode = `${prefix}POL-001`;
  const controlCode = `${prefix}CTL-001`;
  const checkpointCode = `${prefix}CHK-001`;

  let policy = await db.policy.findUnique({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: policyCode },
    },
  });
  policy ??= await db.policy.create({
    data: {
      tenantId: input.tenantId,
      code: policyCode,
      title: "Synthetic Governance Policy",
      description: "Synthetic Policy used only for deterministic verification.",
      ownerId: input.ownerId,
      departmentId: input.departmentId,
      lifecycleStatus: "ACTIVE",
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  let version = await db.policyVersion.findUnique({
    where: {
      tenantId_policyId_versionMajor_versionMinor: {
        tenantId: input.tenantId,
        policyId: policy.id,
        versionMajor: 1,
        versionMinor: 0,
      },
    },
  });
  version ??= await db.policyVersion.create({
    data: {
      tenantId: input.tenantId,
      policyId: policy.id,
      sequence: 1,
      versionMajor: 1,
      versionMinor: 0,
      content:
        "# Synthetic Governance Policy\n\nThis bounded Markdown record contains no private data.",
      purpose: "Exercise the Milestone 4 database invariants.",
      scope: "Synthetic test and demonstration data only.",
      changeSummary: "Initial controlled version.",
      status: "DRAFT",
      effectiveDate: new Date("2026-07-01T00:00:00.000Z"),
      reviewDate: new Date("2027-07-01T00:00:00.000Z"),
      requiresEvidence: false,
      requestedApproverId: input.approverId,
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  await db.policyFramework.upsert({
    where: {
      tenantId_policyVersionId_frameworkId: {
        tenantId: input.tenantId,
        policyVersionId: version.id,
        frameworkId: input.frameworkId,
      },
    },
    update: {},
    create: {
      tenantId: input.tenantId,
      policyId: policy.id,
      policyVersionId: version.id,
      frameworkId: input.frameworkId,
      isActive: true,
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  if (version.status === "DRAFT" || version.status === "REJECTED") {
    const wasRejected = version.status === "REJECTED";
    version = await db.policyVersion.update({
      where: { id: version.id },
      data: {
        status: "SUBMITTED",
        submittedById: input.ownerId,
        submittedAt: new Date("2026-07-02T09:00:00.000Z"),
        updatedById: input.ownerId,
      },
    });
    await ensureAudit(db, {
      tenantId: input.tenantId,
      userId: input.ownerId,
      action: wasRejected
        ? "POLICY_VERSION_RESUBMITTED"
        : "POLICY_VERSION_SUBMITTED",
      entityType: "POLICY",
      entityId: policy.id,
      metadata: { code: policy.code, version: "1.0" },
    });
  }

  if (version.status === "SUBMITTED") {
    const submittedVersion = version;
    version = await db.$transaction(async (transaction) => {
      const approved = await transaction.policyVersion.update({
        where: { id: submittedVersion.id },
        data: {
          status: "APPROVED",
          approvedById: input.approverId,
          approvedAt: new Date("2026-07-03T09:00:00.000Z"),
          updatedById: input.approverId,
        },
      });
      await transaction.policy.update({
        where: { id: policy.id },
        data: {
          currentApprovedVersionId: approved.id,
          nextVersionSequence: 2,
          updatedById: input.approverId,
        },
      });
      await transaction.policyApproval.create({
        data: {
          tenantId: input.tenantId,
          policyId: policy.id,
          policyVersionId: approved.id,
          actedById: input.approverId,
          decision: "APPROVED",
          comments: "Synthetic approval decision.",
          decidedAt: new Date("2026-07-03T09:00:00.000Z"),
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          userId: input.approverId,
          action: "POLICY_VERSION_APPROVED",
          entityType: "POLICY",
          entityId: policy.id,
          metadata: { code: policy.code, version: "1.0" },
        },
      });
      return approved;
    });
  }
  if (version.status !== "APPROVED") {
    throw new Error(`Governance seed Policy Version is ${version.status}`);
  }

  let control = await db.control.findUnique({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: controlCode },
    },
  });
  control ??= await db.control.create({
    data: {
      tenantId: input.tenantId,
      code: controlCode,
      title: "Synthetic Document Control",
      description: "Synthetic Control for database verification.",
      objective: "Verify governed Policy requirements are implemented.",
      ownerId: input.ownerId,
      departmentId: input.departmentId,
      implementationStatus: "IMPLEMENTED",
      implementationNotes: "Synthetic implementation state.",
      controlType: "PREVENTIVE",
      frequency: "MONTHLY",
      verificationMethod: "Review the synthetic Checkpoint result.",
      requiresEvidence: false,
      lifecycleStatus: "ACTIVE",
      nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  const activePolicyMapping = await db.controlPolicyVersion.findFirst({
    where: {
      tenantId: input.tenantId,
      controlId: control.id,
      policyId: policy.id,
      isActive: true,
    },
    select: { id: true },
  });
  if (!activePolicyMapping) {
    await db.controlPolicyVersion.create({
      data: {
        tenantId: input.tenantId,
        controlId: control.id,
        policyId: policy.id,
        policyVersionId: version.id,
        createdById: input.ownerId,
        updatedById: input.ownerId,
      },
    });
  }
  await db.controlFramework.upsert({
    where: {
      tenantId_controlId_frameworkId: {
        tenantId: input.tenantId,
        controlId: control.id,
        frameworkId: input.frameworkId,
      },
    },
    update: {},
    create: {
      tenantId: input.tenantId,
      controlId: control.id,
      frameworkId: input.frameworkId,
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });
  await db.ruleControl.upsert({
    where: {
      tenantId_controlId_frameworkRuleId: {
        tenantId: input.tenantId,
        controlId: control.id,
        frameworkRuleId: input.frameworkRuleId,
      },
    },
    update: {},
    create: {
      tenantId: input.tenantId,
      controlId: control.id,
      frameworkId: input.frameworkId,
      frameworkRuleId: input.frameworkRuleId,
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  let checkpoint = await db.checkpoint.findUnique({
    where: {
      tenantId_code: { tenantId: input.tenantId, code: checkpointCode },
    },
  });
  checkpoint ??= await db.checkpoint.create({
    data: {
      tenantId: input.tenantId,
      controlId: control.id,
      code: checkpointCode,
      title: "Synthetic Monthly Verification",
      description: "Synthetic Checkpoint for append-only review verification.",
      verificationFrequency: "MONTHLY",
      ownerId: input.ownerId,
      departmentId: input.departmentId,
      expectedResult: "The synthetic control remains implemented.",
      evidenceRequired: false,
      lifecycleStatus: "ACTIVE",
      initialReviewDate: new Date("2026-07-31T00:00:00.000Z"),
      nextReviewDate: new Date("2026-07-31T00:00:00.000Z"),
      createdById: input.ownerId,
      updatedById: input.ownerId,
    },
  });

  const review = await db.checkpointReview.findUnique({
    where: {
      tenantId_checkpointId_reviewPeriod: {
        tenantId: input.tenantId,
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-07",
      },
    },
  });
  if (!review) {
    const createdReview = await db.checkpointReview.create({
      data: {
        tenantId: input.tenantId,
        checkpointId: checkpoint.id,
        reviewPeriod: "2026-07",
        reviewDate: new Date("2026-07-30T00:00:00.000Z"),
        reviewerId: input.approverId,
        outcome: "PASS",
        observation: "Synthetic review completed.",
        recommendation: "Continue the monthly review.",
        nextReviewDate: new Date("2026-08-31T00:00:00.000Z"),
        submittedAt: new Date("2026-07-30T09:00:00.000Z"),
      },
    });
    await ensureAudit(db, {
      tenantId: input.tenantId,
      userId: input.approverId,
      action: "CHECKPOINT_REVIEWED",
      entityType: "CHECKPOINT",
      entityId: checkpoint.id,
      metadata: {
        code: checkpoint.code,
        reviewPeriod: createdReview.reviewPeriod,
        outcome: createdReview.outcome,
      },
    });
  }

  await Promise.all([
    db.tenant.updateMany({
      where: { id: input.tenantId, nextPolicyNumber: { lt: 2 } },
      data: { nextPolicyNumber: 2 },
    }),
    db.tenant.updateMany({
      where: { id: input.tenantId, nextControlNumber: { lt: 2 } },
      data: { nextControlNumber: 2 },
    }),
    db.tenant.updateMany({
      where: { id: input.tenantId, nextCheckpointNumber: { lt: 2 } },
      data: { nextCheckpointNumber: 2 },
    }),
  ]);

  return { policy, version, control, checkpoint };
}
