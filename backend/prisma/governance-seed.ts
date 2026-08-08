import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type {
  Prisma,
  CapaPriority,
  CapaStatus,
  CheckpointOutcome,
  ControlImplementationStatus,
  ControlType,
  EvidenceLifecycleStatus,
  GapSeverity,
  GapStatus,
  KpiFrequency,
  PolicyVersionStatus,
  PrismaClient,
} from "@prisma/client";
import { CapaRepository } from "../src/modules/capa/repository.js";
import { CapaService } from "../src/modules/capa/service.js";
import { CheckpointRepository } from "../src/modules/checkpoints/repository.js";
import { CheckpointService } from "../src/modules/checkpoints/service.js";
import { ControlRepository } from "../src/modules/controls/repository.js";
import { ControlService } from "../src/modules/controls/service.js";
import { EvidenceGateService } from "../src/modules/evidence/evidence-gate-service.js";
import { EvidenceRepository } from "../src/modules/evidence/repository.js";
import { EvidenceService } from "../src/modules/evidence/service.js";
import { GapRepository } from "../src/modules/gaps/repository.js";
import { GapService } from "../src/modules/gaps/service.js";
import { KpiActualRepository } from "../src/modules/kpis/actual-repository.js";
import { KpiActualService } from "../src/modules/kpis/actual-service.js";
import { KpiPerformanceService } from "../src/modules/kpis/performance-service.js";
import { PolicyRepository } from "../src/modules/policies/repository.js";
import { PolicyService } from "../src/modules/policies/service.js";
import { RegisterService } from "../src/modules/registers/service.js";
import { RiskRepository } from "../src/modules/risks/repository.js";
import { RiskService } from "../src/modules/risks/service.js";
import {
  buildEvidenceStorageKey,
  LocalFileStorageProvider,
} from "../src/providers/file-storage/file-storage.js";

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

  // Framework lineage becomes immutable once a version leaves DRAFT/REJECTED.
  // Only attach (or re-attach) while the version can still accept mapping writes.
  if (version.status === "DRAFT" || version.status === "REJECTED") {
    const existingMapping = await db.policyFramework.findUnique({
      where: {
        tenantId_policyVersionId_frameworkId: {
          tenantId: input.tenantId,
          policyVersionId: version.id,
          frameworkId: input.frameworkId,
        },
      },
    });
    if (!existingMapping) {
      await db.policyFramework.create({
        data: {
          tenantId: input.tenantId,
          policyId: policy.id,
          policyVersionId: version.id,
          frameworkId: input.frameworkId,
          isActive: true,
          createdById: input.ownerId,
          updatedById: input.ownerId,
        },
      });
    }
  }

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
  if (version.status === "SUPERSEDED") {
    const current = policy.currentApprovedVersionId
      ? await db.policyVersion.findFirst({
          where: {
            tenantId: input.tenantId,
            policyId: policy.id,
            id: policy.currentApprovedVersionId,
          },
          select: { id: true, status: true },
        })
      : null;
    if (
      !current ||
      current.status !== "APPROVED" ||
      version.supersededById !== current.id
    ) {
      throw new Error(
        "Demo seed conflict: the governance foundation supersession is inconsistent",
      );
    }
  } else if (version.status !== "APPROVED") {
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

export interface DemoGovernanceActor {
  userId: string;
  departmentId: string;
}

interface DemoGovernanceShowcaseInput {
  tenantId: string;
  actors: readonly DemoGovernanceActor[];
}

const showcaseConflict = (message: string): never => {
  throw new Error(`Demo seed conflict: ${message}`);
};

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date | null) =>
  value?.toISOString().slice(0, 10) ?? null;
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};
const showcaseContext = { userAgent: "explicit-demo-governance-seed" };

const POLICY_SHOWCASE = [
  {
    code: "DEMO-POL-001",
    title: "Synthetic Governance Policy",
    description: "Synthetic Policy used only for deterministic verification.",
    frameworkCode: "ISO 9001",
    desiredStatus: "APPROVED" as PolicyVersionStatus,
  },
  {
    code: "DEMO-POL-002",
    title: "Information Security and Access Policy",
    description:
      "Defines the synthetic organisation's access-control expectations.",
    frameworkCode: "ISO 27001",
    desiredStatus: "DRAFT" as PolicyVersionStatus,
  },
  {
    code: "DEMO-POL-003",
    title: "Environmental Management Policy",
    description:
      "Sets environmental objectives for the demonstration workspace.",
    frameworkCode: "ISO 14001",
    desiredStatus: "SUBMITTED" as PolicyVersionStatus,
  },
  {
    code: "DEMO-POL-004",
    title: "Occupational Health and Safety Policy",
    description: "Governs workplace hazard identification and response.",
    frameworkCode: "ISO 45001",
    desiredStatus: "APPROVED" as PolicyVersionStatus,
  },
  {
    code: "DEMO-POL-005",
    title: "Business Continuity Policy",
    description:
      "Defines resilience, recovery and continuity responsibilities.",
    frameworkCode: "ISO 22301",
    desiredStatus: "APPROVED" as PolicyVersionStatus,
  },
  {
    code: "DEMO-POL-006",
    title: "Responsible Workplace Policy",
    description: "Documents fair-work and ethical labour commitments.",
    frameworkCode: "SA 8000",
    desiredStatus: "DRAFT" as PolicyVersionStatus,
  },
] as const;

const CONTROL_SHOWCASE: ReadonlyArray<{
  code: string;
  title: string;
  description: string;
  objective: string;
  actorIndex: number;
  implementationStatus: ControlImplementationStatus;
  implementationNotes: string;
  controlType: ControlType;
  frequency: KpiFrequency;
  verificationMethod: string;
  requiresEvidence: boolean;
  policyCode: string;
  frameworkCode: string;
  inactive: boolean;
}> = [
  {
    code: "DEMO-CTL-001",
    title: "Synthetic Document Control",
    description: "Synthetic Control for database verification.",
    objective: "Verify governed Policy requirements are implemented.",
    actorIndex: 1,
    implementationStatus: "IMPLEMENTED",
    implementationNotes: "Synthetic implementation state.",
    controlType: "PREVENTIVE",
    frequency: "MONTHLY",
    verificationMethod: "Review the synthetic Checkpoint result.",
    requiresEvidence: false,
    policyCode: "DEMO-POL-001",
    frameworkCode: "ISO 9001",
    inactive: false,
  },
  {
    code: "DEMO-CTL-002",
    title: "Privileged Access Recertification",
    description:
      "Quarterly recertification of privileged business-system access.",
    objective: "Ensure elevated access remains authorised and necessary.",
    actorIndex: 6,
    implementationStatus: "IMPLEMENTED",
    implementationNotes:
      "Access owners review the generated entitlement report.",
    controlType: "DETECTIVE",
    frequency: "QUARTERLY",
    verificationMethod:
      "Inspect reviewer sign-off and sampled entitlement evidence.",
    requiresEvidence: true,
    policyCode: "DEMO-POL-001",
    frameworkCode: "ISO 27001",
    inactive: false,
  },
  {
    code: "DEMO-CTL-003",
    title: "Environmental Aspect Review",
    description:
      "Reviews significant environmental aspects and mitigation actions.",
    objective:
      "Keep material environmental impacts within approved tolerances.",
    actorIndex: 7,
    implementationStatus: "PARTIALLY_IMPLEMENTED",
    implementationNotes:
      "Two operating locations are included in the current review cycle.",
    controlType: "PREVENTIVE",
    frequency: "QUARTERLY",
    verificationMethod:
      "Compare the aspect register with action closure evidence.",
    requiresEvidence: true,
    policyCode: "DEMO-POL-004",
    frameworkCode: "ISO 14001",
    inactive: false,
  },
  {
    code: "DEMO-CTL-004",
    title: "Workplace Safety Inspection",
    description: "Monthly inspection of synthetic workplace safety safeguards.",
    objective:
      "Identify and remediate unsafe conditions before an incident occurs.",
    actorIndex: 2,
    implementationStatus: "IMPLEMENTED",
    implementationNotes: "Inspection owners use a controlled checklist.",
    controlType: "DETECTIVE",
    frequency: "MONTHLY",
    verificationMethod:
      "Review completed inspection checklists and action logs.",
    requiresEvidence: true,
    policyCode: "DEMO-POL-004",
    frameworkCode: "ISO 45001",
    inactive: false,
  },
  {
    code: "DEMO-CTL-005",
    title: "Continuity Recovery Exercise",
    description:
      "Exercises recovery procedures for priority business services.",
    objective:
      "Demonstrate recoverability within approved continuity objectives.",
    actorIndex: 5,
    implementationStatus: "IMPLEMENTED",
    implementationNotes:
      "The latest tabletop exercise covered the primary service path.",
    controlType: "CORRECTIVE",
    frequency: "HALF_YEARLY",
    verificationMethod:
      "Inspect exercise results, exceptions and approved remediation.",
    requiresEvidence: true,
    policyCode: "DEMO-POL-005",
    frameworkCode: "ISO 22301",
    inactive: false,
  },
  {
    code: "DEMO-CTL-006",
    title: "Supplier Compliance Review",
    description:
      "Reviews critical suppliers against contractual compliance obligations.",
    objective: "Detect supplier control weaknesses before renewal.",
    actorIndex: 10,
    implementationStatus: "IN_PROGRESS",
    implementationNotes: "The annual supplier evidence refresh is underway.",
    controlType: "DETECTIVE",
    frequency: "ANNUAL",
    verificationMethod:
      "Sample due-diligence packs and remediation commitments.",
    requiresEvidence: true,
    policyCode: "DEMO-POL-005",
    frameworkCode: "SA 8000",
    inactive: false,
  },
  {
    code: "DEMO-CTL-007",
    title: "Legacy Visitor Log Review",
    description:
      "Historic manual visitor-log review retained for traceability.",
    objective: "Preserve the retired control's review and evidence history.",
    actorIndex: 9,
    implementationStatus: "NOT_APPLICABLE",
    implementationNotes:
      "Replaced by the central identity platform in July 2026.",
    controlType: "DETECTIVE",
    frequency: "MONTHLY",
    verificationMethod:
      "Inspect the final manual log review before deactivation.",
    requiresEvidence: false,
    policyCode: "DEMO-POL-001",
    frameworkCode: "ISO 27001",
    inactive: true,
  },
  {
    code: "DEMO-CTL-008",
    title: "Retired Paper Complaint Routing",
    description: "Superseded paper-based complaint escalation procedure.",
    objective: "Retain historic assurance for the retired intake channel.",
    actorIndex: 11,
    implementationStatus: "NOT_APPLICABLE",
    implementationNotes:
      "The digital complaint register replaced this control.",
    controlType: "DIRECTIVE",
    frequency: "PER_EVENT",
    verificationMethod: "Review the final migration reconciliation.",
    requiresEvidence: false,
    policyCode: "DEMO-POL-001",
    frameworkCode: "ISO 9001",
    inactive: true,
  },
];

const CHECKPOINT_SHOWCASE: ReadonlyArray<{
  code: string;
  controlCode: string;
  title: string;
  actorIndex: number;
  evidenceRequired: boolean;
  reviewPeriod: string;
  reviewDate: string;
  outcome: CheckpointOutcome;
}> = [
  {
    code: "DEMO-CHK-001",
    controlCode: "DEMO-CTL-001",
    title: "Synthetic Monthly Verification",
    actorIndex: 1,
    evidenceRequired: false,
    reviewPeriod: "2026-07",
    reviewDate: "2026-07-30",
    outcome: "PASS",
  },
  {
    code: "DEMO-CHK-002",
    controlCode: "DEMO-CTL-002",
    title: "Privileged account population reconciled",
    actorIndex: 6,
    evidenceRequired: false,
    reviewPeriod: "2026-Q2",
    reviewDate: "2026-06-25",
    outcome: "PASS",
  },
  {
    code: "DEMO-CHK-003",
    controlCode: "DEMO-CTL-003",
    title: "Environmental actions supported by evidence",
    actorIndex: 7,
    evidenceRequired: true,
    reviewPeriod: "2026-Q2",
    reviewDate: "2026-06-26",
    outcome: "FAIL",
  },
  {
    code: "DEMO-CHK-004",
    controlCode: "DEMO-CTL-004",
    title: "Emergency exits and signage inspected",
    actorIndex: 2,
    evidenceRequired: false,
    reviewPeriod: "2026-06",
    reviewDate: "2026-06-27",
    outcome: "PASS",
  },
  {
    code: "DEMO-CHK-005",
    controlCode: "DEMO-CTL-004",
    title: "Safety observations assigned for remediation",
    actorIndex: 3,
    evidenceRequired: false,
    reviewPeriod: "2026-07",
    reviewDate: "2026-07-27",
    outcome: "PARTIAL",
  },
  {
    code: "DEMO-CHK-006",
    controlCode: "DEMO-CTL-005",
    title: "Recovery time objective achieved",
    actorIndex: 5,
    evidenceRequired: false,
    reviewPeriod: "2026-H1",
    reviewDate: "2026-06-28",
    outcome: "PASS",
  },
  {
    code: "DEMO-CHK-007",
    controlCode: "DEMO-CTL-006",
    title: "Critical supplier attestations current",
    actorIndex: 10,
    evidenceRequired: true,
    reviewPeriod: "2026",
    reviewDate: "2026-07-18",
    outcome: "FAIL",
  },
  {
    code: "DEMO-CHK-008",
    controlCode: "DEMO-CTL-006",
    title: "Supplier remediation actions sampled",
    actorIndex: 8,
    evidenceRequired: false,
    reviewPeriod: "2026",
    reviewDate: "2026-07-19",
    outcome: "PARTIAL",
  },
  {
    code: "DEMO-CHK-009",
    controlCode: "DEMO-CTL-007",
    title: "Final visitor log reconciliation",
    actorIndex: 9,
    evidenceRequired: false,
    reviewPeriod: "2026-06",
    reviewDate: "2026-06-29",
    outcome: "PASS",
  },
  {
    code: "DEMO-CHK-010",
    controlCode: "DEMO-CTL-008",
    title: "Paper complaint migration reconciled",
    actorIndex: 11,
    evidenceRequired: false,
    reviewPeriod: "2026-07-15#MIGRATION",
    reviewDate: "2026-07-15",
    outcome: "PASS",
  },
];

const EVIDENCE_SHOWCASE: ReadonlyArray<{
  code: string;
  title: string;
  actorIndex: number;
  lifecycleStatus: EvidenceLifecycleStatus;
  controlCode: string;
  checkpointCode: string;
  linkToKpiActual: boolean;
}> = [
  {
    code: "DEMO-EVD-001",
    title: "Document control review pack",
    actorIndex: 0,
    lifecycleStatus: "APPROVED",
    controlCode: "DEMO-CTL-001",
    checkpointCode: "DEMO-CHK-001",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-002",
    title: "Privileged access recertification export",
    actorIndex: 6,
    lifecycleStatus: "APPROVED",
    controlCode: "DEMO-CTL-002",
    checkpointCode: "DEMO-CHK-002",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-003",
    title: "Environmental action closure photographs",
    actorIndex: 7,
    lifecycleStatus: "APPROVED",
    controlCode: "DEMO-CTL-003",
    checkpointCode: "DEMO-CHK-003",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-004",
    title: "Workplace safety inspection checklist",
    actorIndex: 2,
    lifecycleStatus: "APPROVED",
    controlCode: "DEMO-CTL-004",
    checkpointCode: "DEMO-CHK-004",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-005",
    title: "Continuity exercise observer report",
    actorIndex: 5,
    lifecycleStatus: "SUBMITTED",
    controlCode: "DEMO-CTL-005",
    checkpointCode: "DEMO-CHK-006",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-006",
    title: "Supplier compliance attestation bundle",
    actorIndex: 10,
    lifecycleStatus: "APPROVED",
    controlCode: "DEMO-CTL-006",
    checkpointCode: "DEMO-CHK-007",
    linkToKpiActual: true,
  },
  {
    code: "DEMO-EVD-007",
    title: "Supplier remediation sample",
    actorIndex: 8,
    lifecycleStatus: "SUBMITTED",
    controlCode: "DEMO-CTL-006",
    checkpointCode: "DEMO-CHK-008",
    linkToKpiActual: false,
  },
  {
    code: "DEMO-EVD-008",
    title: "Visitor log reconciliation",
    actorIndex: 9,
    lifecycleStatus: "REJECTED",
    controlCode: "DEMO-CTL-007",
    checkpointCode: "DEMO-CHK-009",
    linkToKpiActual: false,
  },
  {
    code: "DEMO-EVD-009",
    title: "Complaint migration validation",
    actorIndex: 11,
    lifecycleStatus: "REJECTED",
    controlCode: "DEMO-CTL-008",
    checkpointCode: "DEMO-CHK-010",
    linkToKpiActual: false,
  },
  {
    code: "DEMO-EVD-010",
    title: "Draft access exception sample",
    actorIndex: 4,
    lifecycleStatus: "DRAFT",
    controlCode: "DEMO-CTL-002",
    checkpointCode: "DEMO-CHK-002",
    linkToKpiActual: false,
  },
  {
    code: "DEMO-EVD-011",
    title: "Draft safety briefing attendance",
    actorIndex: 3,
    lifecycleStatus: "DRAFT",
    controlCode: "DEMO-CTL-004",
    checkpointCode: "DEMO-CHK-005",
    linkToKpiActual: false,
  },
  {
    code: "DEMO-EVD-012",
    title: "Continuity action owner confirmation",
    actorIndex: 1,
    lifecycleStatus: "SUBMITTED",
    controlCode: "DEMO-CTL-005",
    checkpointCode: "DEMO-CHK-006",
    linkToKpiActual: false,
  },
];

const GAP_SHOWCASE: ReadonlyArray<{
  code: string;
  title: string;
  actorIndex: number;
  severity: GapSeverity;
  desiredStatus: GapStatus;
  controlCode: string;
  checkpointCode: string | null;
  frameworkCode: string;
  evidenceCode: string | null;
}> = [
  {
    code: "DEMO-GAP-001",
    title: "Environmental actions lack complete closure evidence",
    actorIndex: 7,
    severity: "MAJOR",
    desiredStatus: "OPEN",
    controlCode: "DEMO-CTL-003",
    checkpointCode: "DEMO-CHK-003",
    frameworkCode: "ISO 14001",
    evidenceCode: "DEMO-EVD-003",
  },
  {
    code: "DEMO-GAP-002",
    title: "Privileged access review contains stale accounts",
    actorIndex: 6,
    severity: "MINOR",
    desiredStatus: "IN_PROGRESS",
    controlCode: "DEMO-CTL-002",
    checkpointCode: null,
    frameworkCode: "ISO 27001",
    evidenceCode: "DEMO-EVD-002",
  },
  {
    code: "DEMO-GAP-003",
    title: "Safety signage inventory was incomplete",
    actorIndex: 2,
    severity: "OBSERVATION",
    desiredStatus: "CLOSED",
    controlCode: "DEMO-CTL-004",
    checkpointCode: "DEMO-CHK-004",
    frameworkCode: "ISO 45001",
    evidenceCode: "DEMO-EVD-004",
  },
  {
    code: "DEMO-GAP-004",
    title: "Critical supplier attestations are overdue",
    actorIndex: 10,
    severity: "CRITICAL",
    desiredStatus: "OPEN",
    controlCode: "DEMO-CTL-006",
    checkpointCode: "DEMO-CHK-007",
    frameworkCode: "SA 8000",
    evidenceCode: "DEMO-EVD-006",
  },
  {
    code: "DEMO-GAP-005",
    title: "Recovery exercise exception owner is unconfirmed",
    actorIndex: 5,
    severity: "MAJOR",
    desiredStatus: "IN_PROGRESS",
    controlCode: "DEMO-CTL-005",
    checkpointCode: null,
    frameworkCode: "ISO 22301",
    evidenceCode: null,
  },
  {
    code: "DEMO-GAP-006",
    title: "Document review reminder routing was inconsistent",
    actorIndex: 1,
    severity: "OFI",
    desiredStatus: "CLOSED",
    controlCode: "DEMO-CTL-001",
    checkpointCode: "DEMO-CHK-001",
    frameworkCode: "ISO 9001",
    evidenceCode: "DEMO-EVD-001",
  },
  {
    code: "DEMO-GAP-007",
    title: "Safety observation escalation needs clarification",
    actorIndex: 3,
    severity: "MINOR",
    desiredStatus: "OPEN",
    controlCode: "DEMO-CTL-004",
    checkpointCode: "DEMO-CHK-005",
    frameworkCode: "ISO 45001",
    evidenceCode: null,
  },
  {
    code: "DEMO-GAP-008",
    title: "Supplier remediation sample size is below plan",
    actorIndex: 8,
    severity: "OBSERVATION",
    desiredStatus: "IN_PROGRESS",
    controlCode: "DEMO-CTL-006",
    checkpointCode: "DEMO-CHK-008",
    frameworkCode: "SA 8000",
    evidenceCode: null,
  },
];

const CAPA_SHOWCASE: ReadonlyArray<{
  code: string;
  title: string;
  actorIndex: number;
  priority: CapaPriority;
  desiredStatus: CapaStatus;
  gapCode: string | null;
  frameworkCode: string;
  dueDate: string;
  completionPercentage: number;
  evidenceCode: string | null;
}> = [
  {
    code: "DEMO-CAPA-001",
    title: "Complete environmental closure evidence",
    actorIndex: 7,
    priority: "HIGH",
    desiredStatus: "OPEN",
    gapCode: "DEMO-GAP-001",
    frameworkCode: "ISO 14001",
    dueDate: "2026-07-15",
    completionPercentage: 20,
    evidenceCode: null,
  },
  {
    code: "DEMO-CAPA-002",
    title: "Remove stale privileged accounts",
    actorIndex: 6,
    priority: "CRITICAL",
    desiredStatus: "IN_PROGRESS",
    gapCode: "DEMO-GAP-002",
    frameworkCode: "ISO 27001",
    dueDate: "2026-07-25",
    completionPercentage: 55,
    evidenceCode: null,
  },
  {
    code: "DEMO-CAPA-003",
    title: "Validate continuity exception ownership",
    actorIndex: 5,
    priority: "HIGH",
    desiredStatus: "PENDING_VERIFICATION",
    gapCode: "DEMO-GAP-005",
    frameworkCode: "ISO 22301",
    dueDate: "2026-09-15",
    completionPercentage: 90,
    evidenceCode: "DEMO-EVD-001",
  },
  {
    code: "DEMO-CAPA-004",
    title: "Replace missing safety signage",
    actorIndex: 2,
    priority: "MEDIUM",
    desiredStatus: "CLOSED",
    gapCode: null,
    frameworkCode: "ISO 45001",
    dueDate: "2026-07-30",
    completionPercentage: 80,
    evidenceCode: "DEMO-EVD-004",
  },
  {
    code: "DEMO-CAPA-005",
    title: "Clarify safety escalation matrix",
    actorIndex: 3,
    priority: "MEDIUM",
    desiredStatus: "OPEN",
    gapCode: "DEMO-GAP-007",
    frameworkCode: "ISO 45001",
    dueDate: "2026-09-30",
    completionPercentage: 10,
    evidenceCode: null,
  },
  {
    code: "DEMO-CAPA-006",
    title: "Expand supplier remediation sample",
    actorIndex: 8,
    priority: "LOW",
    desiredStatus: "IN_PROGRESS",
    gapCode: "DEMO-GAP-008",
    frameworkCode: "SA 8000",
    dueDate: "2026-10-15",
    completionPercentage: 45,
    evidenceCode: null,
  },
  {
    code: "DEMO-CAPA-007",
    title: "Publish access review exception guidance",
    actorIndex: 4,
    priority: "MEDIUM",
    desiredStatus: "PENDING_VERIFICATION",
    gapCode: "DEMO-GAP-002",
    frameworkCode: "ISO 27001",
    dueDate: "2026-09-10",
    completionPercentage: 85,
    evidenceCode: "DEMO-EVD-002",
  },
  {
    code: "DEMO-CAPA-008",
    title: "Automate document review reminders",
    actorIndex: 1,
    priority: "LOW",
    desiredStatus: "CLOSED",
    gapCode: null,
    frameworkCode: "ISO 9001",
    dueDate: "2026-07-20",
    completionPercentage: 75,
    evidenceCode: "DEMO-EVD-001",
  },
];

const REGISTER_SHOWCASE = [
  {
    code: "DEMO-REG-TRAINING",
    name: "Training and Competency Register",
    prefix: "DEMO-TRN",
    subject: "Controlled procedure training",
    statuses: ["SCHEDULED", "COMPLETED", "OVERDUE"],
  },
  {
    code: "DEMO-REG-INCIDENT",
    name: "Incident Register",
    prefix: "DEMO-INC",
    subject: "Operational incident review",
    statuses: ["OPEN", "INVESTIGATING", "CLOSED"],
  },
  {
    code: "DEMO-REG-SUPPLIER",
    name: "Supplier Assurance Register",
    prefix: "DEMO-SUP",
    subject: "Critical supplier assessment",
    statuses: ["APPROVED", "CONDITIONAL", "REVIEW_DUE"],
  },
  {
    code: "DEMO-REG-COMPLAINT",
    name: "Complaint Register",
    prefix: "DEMO-CMP",
    subject: "Customer complaint investigation",
    statuses: ["RECEIVED", "IN_PROGRESS", "RESOLVED"],
  },
  {
    code: "DEMO-REG-AUDIT-FINDING",
    name: "Audit Finding Register",
    prefix: "DEMO-AUD",
    subject: "Internal audit finding",
    statuses: ["OPEN", "ACTIONED", "VERIFIED"],
  },
] as const;

/**
 * Adds the browser-facing governance showcase only to the explicit DEMO-UAT
 * Company. The caller supplies Company-scoped users/departments so no lookup
 * can accidentally borrow a client identity from another tenant.
 */
export async function seedDemoGovernanceShowcase(
  db: PrismaClient,
  input: DemoGovernanceShowcaseInput,
) {
  if (input.actors.length < 12) {
    showcaseConflict(
      "the governance showcase requires all twelve demo personas",
    );
  }
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { code: true },
  });
  if (tenant?.code !== "DEMO-UAT") {
    showcaseConflict("the governance showcase may only target DEMO-UAT");
  }

  const actorFor = (index: number): DemoGovernanceActor => {
    const actor = input.actors[index % input.actors.length];
    if (!actor) showcaseConflict(`demo persona ${index + 1} is missing`);
    return actor!;
  };

  const frameworks = new Map(
    (
      await db.framework.findMany({
        where: {
          code: { in: POLICY_SHOWCASE.map((item) => item.frameworkCode) },
        },
        select: { id: true, code: true },
      })
    ).map((framework) => [framework.code, framework]),
  );
  const frameworkRules = new Map(
    (
      await db.frameworkRule.findMany({
        where: {
          code: "DEMO-R1",
          framework: {
            code: { in: POLICY_SHOWCASE.map((item) => item.frameworkCode) },
          },
        },
        select: {
          id: true,
          code: true,
          frameworkId: true,
          framework: { select: { code: true } },
        },
      })
    ).map((rule) => [rule.framework.code, rule]),
  );
  const frameworkFor = (code: string): { id: string; code: string } => {
    const framework = frameworks.get(code);
    if (!framework) showcaseConflict(`${code} is missing`);
    return framework!;
  };
  const ruleFor = (
    frameworkCode: string,
  ): { id: string; code: string; frameworkId: string } => {
    const rule = frameworkRules.get(frameworkCode);
    if (!rule) showcaseConflict(`DEMO-R1 for ${frameworkCode} is missing`);
    return rule!;
  };

  const evidenceGate = new EvidenceGateService();
  const policyService = new PolicyService(
    new PolicyRepository(db),
    evidenceGate,
  );
  const controlService = new ControlService(new ControlRepository(db));
  const checkpointService = new CheckpointService(
    new CheckpointRepository(db),
    evidenceGate,
  );
  const gapService = new GapService(new GapRepository(db), evidenceGate);
  const capaService = new CapaService(new CapaRepository(db), evidenceGate);
  const registerService = new RegisterService(db);
  const storage = new LocalFileStorageProvider(
    resolve(process.env.LOCAL_UPLOAD_DIR ?? "./uploads"),
  );
  const evidenceService = new EvidenceService(
    new EvidenceRepository(db),
    storage,
  );
  const riskService = new RiskService(new RiskRepository(db));
  const actualService = new KpiActualService(
    new KpiActualRepository(db),
    new KpiPerformanceService(),
    riskService,
    evidenceGate,
  );

  const policies = new Map<string, { id: string; versionId: string }>();
  for (const [index, definition] of POLICY_SHOWCASE.entries()) {
    const actor = actorFor(index + 1);
    const approver = actorFor(index + 3);
    const framework = frameworkFor(definition.frameworkCode);
    let policy = await db.policy.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!policy) {
      policy = await db.policy.create({
        data: {
          tenantId: input.tenantId,
          code: definition.code,
          title: definition.title,
          description: definition.description,
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          lifecycleStatus: "ACTIVE",
          nextVersionSequence: 2,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "POLICY_CREATED",
        entityType: "POLICY",
        entityId: policy.id,
        metadata: { code: policy.code, showcase: true },
      });
    }
    if (
      policy.title !== definition.title ||
      policy.description !== definition.description ||
      policy.ownerId !== actor.userId ||
      policy.departmentId !== actor.departmentId ||
      policy.lifecycleStatus !== "ACTIVE"
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }

    let version = await db.policyVersion.findUnique({
      where: {
        tenantId_policyId_versionMajor_versionMinor: {
          tenantId: input.tenantId,
          policyId: policy.id,
          versionMajor: definition.code === "DEMO-POL-001" ? 2 : 1,
          versionMinor: 0,
        },
      },
    });
    const content = `# ${definition.title}\n\nThis is invented DEMO-UAT content for a controlled client demonstration.`;
    if (!version && definition.code === "DEMO-POL-001") {
      const created = await policyService.createVersion(
        input.tenantId,
        policy.id,
        actor.userId,
        {
          bump: "MAJOR",
          content,
          purpose: "Demonstrate governed policy supersession.",
          scope: "Synthetic DEMO-UAT operations only.",
          changeSummary: "Expanded assurance scope for the demonstration.",
          effectiveDate: "2026-07-15",
          reviewDate: "2027-07-15",
          requestedApproverId: approver.userId,
          frameworkIds: [framework.id],
          requiresEvidence: false,
        },
        showcaseContext,
      );
      version = await db.policyVersion.findUniqueOrThrow({
        where: { id: created.id },
      });
    } else if (!version) {
      version = await db.policyVersion.create({
        data: {
          tenantId: input.tenantId,
          policyId: policy.id,
          sequence: 1,
          versionMajor: 1,
          versionMinor: 0,
          content,
          purpose: "Demonstrate a realistic governance lifecycle.",
          scope: "Synthetic DEMO-UAT operations only.",
          changeSummary: "Initial controlled version.",
          status: "DRAFT",
          effectiveDate: date("2026-07-01"),
          reviewDate: date("2027-07-01"),
          requiresEvidence: false,
          requestedApproverId: approver.userId,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "POLICY_VERSION_CREATED",
        entityType: "POLICY_VERSION",
        entityId: version.id,
        metadata: { code: definition.code, version: "1.0", showcase: true },
      });
      await db.policyFramework.create({
        data: {
          tenantId: input.tenantId,
          policyId: policy.id,
          policyVersionId: version.id,
          frameworkId: framework.id,
          isActive: true,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
    }
    if (version.content !== content) {
      showcaseConflict(
        `${definition.code} content differs from the approved showcase`,
      );
    }
    const policyFramework = await db.policyFramework.findUnique({
      where: {
        tenantId_policyVersionId_frameworkId: {
          tenantId: input.tenantId,
          policyVersionId: version.id,
          frameworkId: framework.id,
        },
      },
    });
    if (!policyFramework?.isActive) {
      if (version.status === "DRAFT" || version.status === "REJECTED") {
        await db.policyFramework.create({
          data: {
            tenantId: input.tenantId,
            policyId: policy.id,
            policyVersionId: version.id,
            frameworkId: framework.id,
            isActive: true,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
      } else {
        // Submitted/approved lineage cannot gain a new framework id. Accept an
        // existing active mapping (historical DEMO-FRM-* ids) so re-seeds after
        // the catalogue consolidation do not fail.
        const historical = await db.policyFramework.findFirst({
          where: {
            tenantId: input.tenantId,
            policyVersionId: version.id,
            isActive: true,
          },
        });
        if (!historical) {
          showcaseConflict(
            `${definition.code} framework mapping is missing or inactive`,
          );
        }
      }
    }

    if (
      (definition.desiredStatus === "SUBMITTED" ||
        definition.desiredStatus === "APPROVED") &&
      version.status === "DRAFT"
    ) {
      await policyService.submit(
        input.tenantId,
        version.id,
        actor.userId,
        showcaseContext,
      );
      version = await db.policyVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
    }
    if (
      definition.desiredStatus === "APPROVED" &&
      version.status === "SUBMITTED"
    ) {
      await policyService.approve(
        input.tenantId,
        version.id,
        approver.userId,
        {},
        showcaseContext,
      );
      version = await db.policyVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
    }
    if (version.status !== definition.desiredStatus) {
      showcaseConflict(
        `${definition.code} version is ${version.status}, not ${definition.desiredStatus}`,
      );
    }
    policies.set(definition.code, { id: policy.id, versionId: version.id });
  }

  const controls = new Map<string, { id: string; frequency: KpiFrequency }>();
  for (const definition of CONTROL_SHOWCASE) {
    const actor = actorFor(definition.actorIndex);
    const policy = policies.get(definition.policyCode)!;
    if (!policy) showcaseConflict(`${definition.policyCode} is missing`);
    const framework = frameworkFor(definition.frameworkCode);
    const frameworkRule = ruleFor(definition.frameworkCode);
    let control = await db.control.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!control) {
      control = await db.control.create({
        data: {
          tenantId: input.tenantId,
          code: definition.code,
          title: definition.title,
          description: definition.description,
          objective: definition.objective,
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          implementationStatus: definition.implementationStatus,
          implementationNotes: definition.implementationNotes,
          controlType: definition.controlType,
          frequency: definition.frequency,
          verificationMethod: definition.verificationMethod,
          requiresEvidence: definition.requiresEvidence,
          lifecycleStatus: "ACTIVE",
          nextReviewDate: date("2026-08-31"),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "CONTROL_CREATED",
        entityType: "CONTROL",
        entityId: control.id,
        metadata: { code: control.code, showcase: true },
      });
    }
    const expectedLifecycle = definition.inactive ? "INACTIVE" : "ACTIVE";
    if (
      control.title !== definition.title ||
      control.description !== definition.description ||
      control.objective !== definition.objective ||
      control.ownerId !== actor.userId ||
      control.departmentId !== actor.departmentId ||
      control.implementationStatus !== definition.implementationStatus ||
      control.implementationNotes !== definition.implementationNotes ||
      control.controlType !== definition.controlType ||
      control.frequency !== definition.frequency ||
      control.verificationMethod !== definition.verificationMethod ||
      control.requiresEvidence !== definition.requiresEvidence ||
      (control.lifecycleStatus !== "ACTIVE" &&
        control.lifecycleStatus !== expectedLifecycle)
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }
    await controlService.replacePolicyVersions(
      input.tenantId,
      control.id,
      actor.userId,
      { policyVersionIds: [policy.versionId] },
      showcaseContext,
    );
    await controlService.replaceFrameworks(
      input.tenantId,
      control.id,
      actor.userId,
      { frameworkIds: [framework.id] },
      showcaseContext,
    );
    await controlService.replaceFrameworkRules(
      input.tenantId,
      control.id,
      actor.userId,
      { frameworkRuleIds: [frameworkRule.id] },
      showcaseContext,
    );
    controls.set(definition.code, {
      id: control.id,
      frequency: control.frequency,
    });
  }

  const checkpoints = new Map<string, { id: string }>();
  for (const definition of CHECKPOINT_SHOWCASE) {
    const actor = actorFor(definition.actorIndex);
    const control = controls.get(definition.controlCode)!;
    if (!control) showcaseConflict(`${definition.controlCode} is missing`);
    let checkpoint = await db.checkpoint.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!checkpoint) {
      checkpoint = await db.checkpoint.create({
        data: {
          tenantId: input.tenantId,
          controlId: control.id,
          code: definition.code,
          title: definition.title,
          description: `Verification step for ${definition.title.toLowerCase()}.`,
          verificationFrequency: control.frequency,
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          expectedResult:
            "The sampled population meets the defined control expectation.",
          evidenceRequired: definition.evidenceRequired,
          lifecycleStatus: "ACTIVE",
          initialReviewDate: date(definition.reviewDate),
          nextReviewDate: date("2026-08-31"),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "CHECKPOINT_CREATED",
        entityType: "CHECKPOINT",
        entityId: checkpoint.id,
        metadata: { code: checkpoint.code, showcase: true },
      });
    }
    if (
      checkpoint.controlId !== control.id ||
      checkpoint.title !== definition.title ||
      checkpoint.verificationFrequency !== control.frequency ||
      checkpoint.ownerId !== actor.userId ||
      checkpoint.departmentId !== actor.departmentId ||
      checkpoint.evidenceRequired !== definition.evidenceRequired ||
      checkpoint.lifecycleStatus !== "ACTIVE"
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }
    checkpoints.set(definition.code, { id: checkpoint.id });
  }

  const evidenceRows = new Map<
    string,
    { id: string; lifecycleStatus: EvidenceLifecycleStatus }
  >();
  for (const definition of EVIDENCE_SHOWCASE) {
    const actor = actorFor(definition.actorIndex);
    const control = controls.get(definition.controlCode)!;
    const checkpoint = checkpoints.get(definition.checkpointCode)!;
    if (!control || !checkpoint) {
      showcaseConflict(
        `${definition.code} has a missing governance link target`,
      );
    }
    const fileContent = Buffer.from(
      `Synthetic DEMO-UAT evidence artifact ${definition.code}. No customer data is contained in this file.\n`,
      "utf8",
    );
    const contentSha256 = createHash("sha256")
      .update(fileContent)
      .digest("hex");
    const originalFileName = `${definition.code.toLowerCase()}-artifact.txt`;
    let evidence = await db.evidence.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!evidence) {
      const evidenceId = randomUUID();
      const storageKey = buildEvidenceStorageKey({
        tenantId: input.tenantId,
        evidenceId,
        objectId: randomUUID(),
      });
      await storage.put(storageKey, fileContent, "text/plain");
      evidence = await db.evidence.create({
        data: {
          id: evidenceId,
          tenantId: input.tenantId,
          code: definition.code,
          title: definition.title,
          description: "Invented assurance artifact for the DEMO-UAT showcase.",
          lifecycleStatus: "DRAFT",
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          issueDate: date("2026-07-01"),
          expiresAt: date("2027-07-01"),
          originalFileName,
          storageKey,
          mimeType: "text/plain",
          detectedMimeType: "text/plain",
          byteSize: fileContent.byteLength,
          contentSha256,
          uploadedById: actor.userId,
          uploadedAt: date("2026-07-02"),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "EVIDENCE_CREATED",
        entityType: "EVIDENCE",
        entityId: evidence.id,
        metadata: { code: evidence.code, showcase: true },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "EVIDENCE_FILE_UPLOADED",
        entityType: "EVIDENCE",
        entityId: evidence.id,
        metadata: {
          code: evidence.code,
          byteSize: fileContent.byteLength,
          detectedMimeType: "text/plain",
        },
      });
    } else {
      if (!evidence.storageKey) {
        showcaseConflict(`${definition.code} has no stored file`);
      }
      await storage.put(evidence.storageKey!, fileContent, "text/plain");
    }
    if (
      evidence.title !== definition.title ||
      evidence.ownerId !== actor.userId ||
      evidence.departmentId !== actor.departmentId ||
      evidence.originalFileName !== originalFileName ||
      evidence.mimeType !== "text/plain" ||
      evidence.detectedMimeType !== "text/plain" ||
      evidence.byteSize !== fileContent.byteLength ||
      evidence.contentSha256 !== contentSha256
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }

    const controlLink = await db.evidenceControlLink.findUnique({
      where: {
        tenantId_evidenceId_controlId: {
          tenantId: input.tenantId,
          evidenceId: evidence.id,
          controlId: control.id,
        },
      },
    });
    if (!controlLink?.isActive) {
      if (evidence.lifecycleStatus !== "DRAFT") {
        showcaseConflict(
          `${definition.code} cannot restore its Control link after submission`,
        );
      }
      await evidenceService.linkControl(
        input.tenantId,
        evidence.id,
        control.id,
        actor.userId,
        showcaseContext,
      );
    }
    const checkpointLink = await db.evidenceCheckpointLink.findUnique({
      where: {
        tenantId_evidenceId_checkpointId: {
          tenantId: input.tenantId,
          evidenceId: evidence.id,
          checkpointId: checkpoint.id,
        },
      },
    });
    if (!checkpointLink?.isActive) {
      if (evidence.lifecycleStatus !== "DRAFT") {
        showcaseConflict(
          `${definition.code} cannot restore its Checkpoint link after submission`,
        );
      }
      await evidenceService.linkCheckpoint(
        input.tenantId,
        evidence.id,
        checkpoint.id,
        actor.userId,
        showcaseContext,
      );
    }
    evidenceRows.set(definition.code, {
      id: evidence.id,
      lifecycleStatus: evidence.lifecycleStatus,
    });
  }

  const kpiDefinition = await db.kpiDefinition.findUnique({
    where: { code: "DEMO-KPI-001" },
    select: { id: true },
  });
  if (!kpiDefinition) showcaseConflict("DEMO-KPI-001 is missing");
  const kpiConfiguration = await db.kpiConfiguration.findFirst({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      kpiDefinitionId: kpiDefinition!.id,
    },
    select: { id: true, ownerId: true, approverId: true },
  });
  if (!kpiConfiguration?.ownerId || !kpiConfiguration.approverId) {
    showcaseConflict("DEMO-KPI-001 configuration actors are missing");
  }
  const showcaseConfiguration = kpiConfiguration!;
  const q4Target = await db.kpiTarget.findFirst({
    where: {
      tenantId: input.tenantId,
      kpiConfigurationId: showcaseConfiguration.id,
      period: "2026-Q4",
      approvalStatus: "APPROVED",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!q4Target) showcaseConflict("DEMO-KPI-001 Q4 target is missing");
  const showcaseTarget = q4Target!;
  let showcaseActual = await db.kpiActual.findFirst({
    where: {
      tenantId: input.tenantId,
      kpiConfigurationId: showcaseConfiguration.id,
      period: "2026-Q4",
      deletedAt: null,
    },
  });
  if (!showcaseActual) {
    const created = await actualService.submitActual(
      input.tenantId,
      showcaseConfiguration.ownerId,
      {
        kpiConfigurationId: showcaseConfiguration.id,
        period: "2026-Q4",
        actualValue: "90",
        evidenceStatus: "AVAILABLE",
        comments: "Synthetic Q4 KPI actual linked to the Evidence showcase.",
      },
      showcaseContext,
    );
    showcaseActual = await db.kpiActual.findUniqueOrThrow({
      where: { id: created.id },
    });
  }
  if (
    showcaseActual.kpiTargetId !== showcaseTarget.id ||
    !showcaseActual.actualValue.equals("90") ||
    showcaseActual.ragStatus !== "GREEN"
  ) {
    showcaseConflict(
      "DEMO-KPI-001 Q4 actual differs from the approved showcase",
    );
  }

  for (const definition of EVIDENCE_SHOWCASE.filter(
    (item) => item.linkToKpiActual,
  )) {
    const evidence = evidenceRows.get(definition.code)!;
    if (!evidence) showcaseConflict(`${definition.code} is missing`);
    const link = await db.evidenceKpiActualLink.findUnique({
      where: {
        tenantId_evidenceId_kpiActualId: {
          tenantId: input.tenantId,
          evidenceId: evidence.id,
          kpiActualId: showcaseActual.id,
        },
      },
    });
    if (!link?.isActive) {
      if (
        evidence.lifecycleStatus !== "DRAFT" ||
        showcaseActual.approvalStatus === "APPROVED"
      ) {
        showcaseConflict(
          `${definition.code} cannot restore its immutable KPI actual link`,
        );
      }
      await evidenceService.linkKpiActual(
        input.tenantId,
        evidence.id,
        showcaseActual.id,
        actorFor(definition.actorIndex).userId,
        showcaseContext,
      );
    }
  }

  for (const definition of EVIDENCE_SHOWCASE) {
    const actor = actorFor(definition.actorIndex);
    const reviewer = actorFor(definition.actorIndex + 5);
    let evidence = await db.evidence.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (
      definition.lifecycleStatus !== "DRAFT" &&
      evidence.lifecycleStatus === "DRAFT"
    ) {
      await evidenceService.submit(
        input.tenantId,
        evidence.id,
        actor.userId,
        showcaseContext,
      );
      evidence = await db.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
    }
    if (
      definition.lifecycleStatus === "APPROVED" &&
      evidence.lifecycleStatus === "SUBMITTED"
    ) {
      await evidenceService.approve(
        input.tenantId,
        evidence.id,
        reviewer.userId,
        { comment: "Approved for the synthetic DEMO-UAT assurance record." },
        showcaseContext,
      );
      evidence = await db.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
    }
    if (
      definition.lifecycleStatus === "REJECTED" &&
      evidence.lifecycleStatus === "SUBMITTED"
    ) {
      await evidenceService.reject(
        input.tenantId,
        evidence.id,
        reviewer.userId,
        {
          reason: "The synthetic sample requires clearer reviewer attribution.",
        },
        showcaseContext,
      );
      evidence = await db.evidence.findUniqueOrThrow({
        where: { id: evidence.id },
      });
    }
    if (evidence.lifecycleStatus !== definition.lifecycleStatus) {
      showcaseConflict(
        `${definition.code} is ${evidence.lifecycleStatus}, not ${definition.lifecycleStatus}`,
      );
    }
  }

  if (
    showcaseActual.approvalStatus === "SUBMITTED" ||
    showcaseActual.approvalStatus === "PENDING_APPROVAL"
  ) {
    await actualService.approveActual(
      input.tenantId,
      showcaseActual.id,
      showcaseConfiguration.approverId!,
      "Approved after the showcase Evidence links were fixed.",
      showcaseContext,
    );
    showcaseActual = await db.kpiActual.findUniqueOrThrow({
      where: { id: showcaseActual.id },
    });
  }
  if (showcaseActual.approvalStatus !== "APPROVED") {
    showcaseConflict(
      `DEMO-KPI-001 Q4 actual is ${showcaseActual.approvalStatus}, not APPROVED`,
    );
  }

  for (const definition of CHECKPOINT_SHOWCASE) {
    const checkpoint = checkpoints.get(definition.code)!;
    if (!checkpoint) showcaseConflict(`${definition.code} is missing`);
    const existingReview = await db.checkpointReview.findUnique({
      where: {
        tenantId_checkpointId_reviewPeriod: {
          tenantId: input.tenantId,
          checkpointId: checkpoint.id,
          reviewPeriod: definition.reviewPeriod,
        },
      },
    });
    if (!existingReview) {
      await checkpointService.createReview(
        input.tenantId,
        checkpoint.id,
        actorFor(definition.actorIndex + 3).userId,
        {
          reviewPeriod: definition.reviewPeriod,
          reviewDate: definition.reviewDate,
          outcome: definition.outcome,
          observation:
            definition.outcome === "FAIL"
              ? "The sample exposed a controlled demonstration finding."
              : "The sample was completed for the demonstration period.",
          recommendation:
            definition.outcome === "PASS"
              ? "Continue the scheduled verification."
              : "Track the observation through the Gap and CAPA registers.",
          nextReviewDate: "2026-08-31",
        },
        showcaseContext,
      );
    } else if (existingReview.outcome !== definition.outcome) {
      showcaseConflict(
        `${definition.code} review outcome differs from the showcase`,
      );
    }
  }

  const gaps = new Map<string, { id: string; status: GapStatus }>();
  for (const [index, definition] of GAP_SHOWCASE.entries()) {
    const actor = actorFor(definition.actorIndex);
    const control = controls.get(definition.controlCode)!;
    const checkpoint = definition.checkpointCode
      ? checkpoints.get(definition.checkpointCode)!
      : null;
    const framework = frameworkFor(definition.frameworkCode);
    const frameworkRule = ruleFor(definition.frameworkCode);
    if (!control || (definition.checkpointCode && !checkpoint)) {
      showcaseConflict(`${definition.code} has a missing governance source`);
    }
    let gap = await db.gap.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!gap) {
      gap = await db.gap.create({
        data: {
          tenantId: input.tenantId,
          code: definition.code,
          title: definition.title,
          description:
            "Invented demonstration finding with no customer source data.",
          source: checkpoint
            ? "Checkpoint Review"
            : "Internal Compliance Review",
          frameworkId: framework.id,
          frameworkRuleId: frameworkRule.id,
          controlId: control.id,
          checkpointId: checkpoint?.id ?? null,
          clauseRef: "DEMO-R1",
          recommendedAction:
            "Complete the assigned remediation and retain approval evidence.",
          severity: definition.severity,
          status: "OPEN",
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          identifiedOn: date(`2026-06-${String(index + 10).padStart(2, "0")}`),
          dueDate: date(`2026-09-${String(index + 10).padStart(2, "0")}`),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "GAP_CREATED",
        entityType: "GAP",
        entityId: gap.id,
        metadata: { code: gap.code, severity: gap.severity, showcase: true },
      });
    }
    if (
      gap.title !== definition.title ||
      gap.severity !== definition.severity ||
      gap.ownerId !== actor.userId ||
      gap.departmentId !== actor.departmentId ||
      gap.frameworkId !== framework.id ||
      gap.frameworkRuleId !== frameworkRule.id ||
      gap.controlId !== control.id ||
      gap.checkpointId !== (checkpoint?.id ?? null) ||
      gap.deletedAt !== null ||
      (gap.status !== "OPEN" && gap.status !== definition.desiredStatus)
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }
    if (definition.evidenceCode) {
      const evidence = evidenceRows.get(definition.evidenceCode)!;
      if (!evidence) showcaseConflict(`${definition.evidenceCode} is missing`);
      const existingLink = await db.gapEvidenceLink.findUnique({
        where: {
          tenantId_gapId_evidenceId: {
            tenantId: input.tenantId,
            gapId: gap.id,
            evidenceId: evidence.id,
          },
        },
      });
      if (!existingLink?.isActive) {
        await gapService.linkEvidence(
          input.tenantId,
          gap.id,
          actor.userId,
          {
            evidenceId: evidence.id,
            linkReason:
              "Supports the synthetic finding and its closure decision.",
          },
          showcaseContext,
        );
      }
    }
    if (definition.desiredStatus === "IN_PROGRESS" && gap.status === "OPEN") {
      await gapService.update(
        input.tenantId,
        gap.id,
        actor.userId,
        { status: "IN_PROGRESS" },
        showcaseContext,
      );
      gap = await db.gap.findUniqueOrThrow({ where: { id: gap.id } });
    }
    if (definition.desiredStatus === "CLOSED" && gap.status !== "CLOSED") {
      await gapService.close(
        input.tenantId,
        gap.id,
        actorFor(definition.actorIndex + 3).userId,
        {
          closureNote:
            "Remediation was verified against approved synthetic Evidence.",
        },
        showcaseContext,
      );
      gap = await db.gap.findUniqueOrThrow({ where: { id: gap.id } });
    }
    if (gap.status !== definition.desiredStatus) {
      showcaseConflict(
        `${definition.code} is ${gap.status}, not ${definition.desiredStatus}`,
      );
    }
    gaps.set(definition.code, { id: gap.id, status: gap.status });
  }

  for (const [index, definition] of CAPA_SHOWCASE.entries()) {
    const actor = actorFor(definition.actorIndex);
    const framework = frameworkFor(definition.frameworkCode);
    const gap = definition.gapCode ? gaps.get(definition.gapCode)! : null;
    if (definition.gapCode && (!gap || gap.status === "CLOSED")) {
      showcaseConflict(
        `${definition.code} requires an active ${definition.gapCode}`,
      );
    }
    let capa = await db.capa.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!capa) {
      capa = await db.capa.create({
        data: {
          tenantId: input.tenantId,
          code: definition.code,
          title: definition.title,
          description: "Invented corrective action for the DEMO-UAT showcase.",
          gapId: gap?.id ?? null,
          source: "Compliance Review",
          sourceRef: definition.gapCode ?? `DEMO-ACTION-${index + 1}`,
          frameworkId: framework.id,
          rootCause:
            "The demonstration process lacked a consistently applied verification step.",
          correctiveAction:
            "Complete the assigned correction and submit objective evidence.",
          preventiveAction:
            "Add a recurring owner review to prevent recurrence.",
          priority: definition.priority,
          status: "OPEN",
          ownerId: actor.userId,
          departmentId: actor.departmentId,
          raisedOn: date(`2026-06-${String(index + 11).padStart(2, "0")}`),
          dueDate: date(definition.dueDate),
          completionPercentage: definition.completionPercentage,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await ensureAudit(db, {
        tenantId: input.tenantId,
        userId: actor.userId,
        action: "CAPA_CREATED",
        entityType: "CAPA",
        entityId: capa.id,
        metadata: { code: capa.code, priority: capa.priority, showcase: true },
      });
    }
    if (
      capa.title !== definition.title ||
      capa.priority !== definition.priority ||
      capa.ownerId !== actor.userId ||
      capa.departmentId !== actor.departmentId ||
      capa.gapId !== (gap?.id ?? null) ||
      capa.frameworkId !== framework.id ||
      dateOnly(capa.dueDate) !== definition.dueDate ||
      capa.deletedAt !== null ||
      (capa.status !== "OPEN" && capa.status !== definition.desiredStatus)
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }
    if (definition.evidenceCode) {
      const evidence = evidenceRows.get(definition.evidenceCode)!;
      if (!evidence) showcaseConflict(`${definition.evidenceCode} is missing`);
      const existingLink = await db.capaEvidenceLink.findUnique({
        where: {
          tenantId_capaId_evidenceId: {
            tenantId: input.tenantId,
            capaId: capa.id,
            evidenceId: evidence.id,
          },
        },
      });
      if (!existingLink?.isActive) {
        await capaService.linkEvidence(
          input.tenantId,
          capa.id,
          actor.userId,
          {
            evidenceId: evidence.id,
            linkReason:
              "Demonstrates implementation and verification of this action.",
          },
          showcaseContext,
        );
      }
    }
    if (
      (definition.desiredStatus === "IN_PROGRESS" ||
        definition.desiredStatus === "PENDING_VERIFICATION") &&
      capa.status === "OPEN"
    ) {
      await capaService.update(
        input.tenantId,
        capa.id,
        actor.userId,
        {
          status: definition.desiredStatus,
          completionPercentage: definition.completionPercentage,
        },
        showcaseContext,
      );
      capa = await db.capa.findUniqueOrThrow({ where: { id: capa.id } });
    }
    if (definition.desiredStatus === "CLOSED" && capa.status !== "CLOSED") {
      await capaService.close(
        input.tenantId,
        capa.id,
        actorFor(definition.actorIndex + 3).userId,
        {
          closureNote:
            "Approved synthetic Evidence confirms effective completion.",
        },
        showcaseContext,
      );
      capa = await db.capa.findUniqueOrThrow({ where: { id: capa.id } });
    }
    if (capa.status !== definition.desiredStatus) {
      showcaseConflict(
        `${definition.code} is ${capa.status}, not ${definition.desiredStatus}`,
      );
    }
  }

  const fieldConfiguration = [
    { key: "category", label: "Category", type: "text" },
    { key: "businessImpact", label: "Business impact", type: "text" },
    { key: "reviewNote", label: "Review note", type: "text" },
  ] satisfies Prisma.InputJsonValue;
  for (const [registerIndex, definition] of REGISTER_SHOWCASE.entries()) {
    let registerType = await db.operationalRegisterType.findUnique({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (!registerType) {
      registerType = await db.operationalRegisterType.create({
        data: {
          tenantId: input.tenantId,
          code: definition.code,
          name: definition.name,
          description: `Invented ${definition.name.toLowerCase()} data for the DEMO-UAT showcase.`,
          sourceSheet: null,
          fieldConfiguration,
          active: true,
        },
      });
    }
    if (
      registerType.name !== definition.name ||
      !registerType.active ||
      canonicalJson(registerType.fieldConfiguration) !==
        canonicalJson(fieldConfiguration)
    ) {
      showcaseConflict(`${definition.code} differs from the approved showcase`);
    }
    for (let recordIndex = 1; recordIndex <= 15; recordIndex += 1) {
      const actor = actorFor(registerIndex * 3 + recordIndex - 1);
      const businessRecordCode = `${definition.prefix}-${String(recordIndex).padStart(3, "0")}`;
      const status =
        definition.statuses[(recordIndex - 1) % definition.statuses.length]!;
      const recordDate = `2026-06-${String(recordIndex).padStart(2, "0")}`;
      const dueDate = `2026-09-${String(recordIndex).padStart(2, "0")}`;
      const payload = {
        category: `${definition.name} sample ${recordIndex}`,
        businessImpact:
          recordIndex % 3 === 0
            ? "High assurance attention"
            : "Routine monitoring",
        reviewNote:
          "Invented record for a client demonstration; no customer data.",
      };
      const existing = await db.operationalRegisterRecord.findUnique({
        where: {
          tenantId_registerTypeId_businessRecordCode: {
            tenantId: input.tenantId,
            registerTypeId: registerType.id,
            businessRecordCode,
          },
        },
      });
      if (!existing) {
        await registerService.createRecord(
          input.tenantId,
          definition.code,
          actor.userId,
          {
            businessRecordCode,
            title: `${definition.subject} ${recordIndex}`,
            status,
            ownerId: actor.userId,
            departmentId: actor.departmentId,
            recordDate,
            dueDate,
            payload,
          },
          showcaseContext,
        );
      } else if (
        existing.title !== `${definition.subject} ${recordIndex}` ||
        existing.status !== status ||
        existing.ownerId !== actor.userId ||
        existing.departmentId !== actor.departmentId ||
        dateOnly(existing.recordDate) !== recordDate ||
        dateOnly(existing.dueDate) !== dueDate ||
        canonicalJson(existing.payload) !== canonicalJson(payload) ||
        existing.deletedAt !== null
      ) {
        showcaseConflict(
          `${businessRecordCode} differs from the approved showcase`,
        );
      }
    }
  }

  for (const definition of CONTROL_SHOWCASE.filter((item) => item.inactive)) {
    const control = await db.control.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: input.tenantId, code: definition.code },
      },
    });
    if (control.lifecycleStatus === "ACTIVE") {
      await controlService.deactivate(
        input.tenantId,
        control.id,
        actorFor(definition.actorIndex).userId,
        showcaseContext,
      );
    } else if (control.lifecycleStatus !== "INACTIVE") {
      showcaseConflict(`${definition.code} is not INACTIVE`);
    }
  }

  return {
    policies: POLICY_SHOWCASE.length,
    controls: CONTROL_SHOWCASE.length,
    checkpoints: CHECKPOINT_SHOWCASE.length,
    evidence: EVIDENCE_SHOWCASE.length,
    gaps: GAP_SHOWCASE.length,
    capas: CAPA_SHOWCASE.length,
    operationalRegisterTypes: REGISTER_SHOWCASE.length,
    operationalRegisterRecords: REGISTER_SHOWCASE.length * 15,
  };
}
