import type { PolicyVersionStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { GovernanceRuleError } from "../governance/domain-error.js";
import {
  allocatePolicyVersion,
  assertPolicyApprovalAllowed,
  assertPolicyContent,
  assertPolicyVersionTransition,
  safePolicyAuditMetadata,
  type PolicyVersionBump,
} from "./domain.js";
import type { EvidenceGateService } from "../evidence/evidence-gate-service.js";
import { utcDateString } from "../evidence/eligibility.js";
import type {
  AuditContext,
  PolicyDetailRecord,
  PolicyListRecord,
  PolicyRepository,
  PolicyVersionRecord,
} from "./repository.js";
import type {
  ApprovePolicyVersionBody,
  CreatePolicyBody,
  CreatePolicyVersionBody,
  PolicyAuditListQuery,
  PolicyListQuery,
  RejectPolicyVersionBody,
  ReplacePolicyFrameworksBody,
  UpdatePolicyBody,
  UpdatePolicyVersionBody,
} from "./validators.js";

const dateOnly = (value: Date | null | undefined) =>
  value == null ? null : value.toISOString().slice(0, 10);

const inputDate = (value: string | null | undefined) =>
  value == null ? null : new Date(`${value}T00:00:00.000Z`);

const utcToday = () => new Date().toISOString().slice(0, 10);

const personDto = (
  person: { id: string; code: string; fullName: string } | null | undefined,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const versionLabel = (version: {
  versionMajor: number;
  versionMinor: number;
}) => `${version.versionMajor}.${version.versionMinor}`;

const mapGovernanceError = (error: unknown): never => {
  if (error instanceof GovernanceRuleError) {
    const status =
      error.code === "EVIDENCE_GATE_NOT_IMPLEMENTED"
        ? 501
        : error.code === "POLICY_SELF_APPROVAL_FORBIDDEN"
          ? 403
          : error.code === "POLICY_VERSION_INVALID_STATE" ||
              error.code === "POLICY_VERSION_IMMUTABLE" ||
              error.code === "POLICY_CONTENT_INVALID" ||
              error.code === "POLICY_CONTENT_HTML_FORBIDDEN"
            ? error.code.startsWith("POLICY_CONTENT")
              ? 400
              : 409
            : 400;
    throw new AppError(status, error.code, error.message);
  }
  throw error;
};

const relatedInvalid = (message: string) =>
  new AppError(400, "RELATED_RECORD_INVALID", message);

const policyNotFound = () =>
  new AppError(404, "POLICY_NOT_FOUND", "Policy not found");

const versionNotFound = () =>
  new AppError(404, "POLICY_VERSION_NOT_FOUND", "Policy Version not found");

const policyArchived = () =>
  new AppError(409, "POLICY_ARCHIVED", "Policy is archived");

const versionImmutable = () =>
  new AppError(
    409,
    "POLICY_VERSION_IMMUTABLE",
    "Policy Version cannot be modified in its current state",
  );

const frameworkDto = (version: PolicyVersionRecord) =>
  version.frameworkMappings.map((mapping) => ({
    id: mapping.id,
    frameworkId: mapping.frameworkId,
    isActive: mapping.isActive,
    framework: mapping.framework
      ? {
          id: mapping.framework.id,
          code: mapping.framework.code,
          name: mapping.framework.name,
          version: mapping.framework.version,
        }
      : null,
  }));

export const policyVersionDto = (version: PolicyVersionRecord) => ({
  id: version.id,
  policyId: version.policyId,
  sequence: version.sequence,
  version: versionLabel(version),
  versionMajor: version.versionMajor,
  versionMinor: version.versionMinor,
  content: version.content,
  purpose: version.purpose,
  scope: version.scope,
  changeSummary: version.changeSummary,
  status: version.status,
  effectiveDate: dateOnly(version.effectiveDate),
  reviewDate: dateOnly(version.reviewDate),
  requiresEvidence: version.requiresEvidence,
  requestedApprover: personDto(version.requestedApprover),
  submittedBy: personDto(version.submittedBy),
  submittedAt: version.submittedAt,
  approvedBy: personDto(version.approvedBy),
  approvedAt: version.approvedAt,
  supersededById: version.supersededById,
  frameworks: frameworkDto(version),
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
});

/** List summaries omit bulky Version body fields. */
export const policyVersionListDto = (version: PolicyVersionRecord) => ({
  id: version.id,
  policyId: version.policyId,
  sequence: version.sequence,
  version: versionLabel(version),
  versionMajor: version.versionMajor,
  versionMinor: version.versionMinor,
  status: version.status,
  effectiveDate: dateOnly(version.effectiveDate),
  reviewDate: dateOnly(version.reviewDate),
  requiresEvidence: version.requiresEvidence,
  requestedApprover: personDto(version.requestedApprover),
  submittedBy: personDto(version.submittedBy),
  submittedAt: version.submittedAt,
  approvedBy: personDto(version.approvedBy),
  approvedAt: version.approvedAt,
  supersededById: version.supersededById,
  frameworks: frameworkDto(version),
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
});

export const policyDto = (policy: PolicyDetailRecord | PolicyListRecord) => {
  const latest = policy.versions[0] ?? null;
  return {
    id: policy.id,
    code: policy.code,
    title: policy.title,
    description: policy.description,
    lifecycleStatus: policy.lifecycleStatus,
    owner: personDto(policy.owner),
    department: policy.department
      ? {
          id: policy.department.id,
          code: policy.department.code,
          name: policy.department.name,
        }
      : null,
    currentApprovedVersion: policy.currentApprovedVersion
      ? policyVersionDto(policy.currentApprovedVersion)
      : null,
    latestVersion: latest ? policyVersionDto(latest) : null,
    archivedAt: policy.archivedAt,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
};

export const policyListDto = (policy: PolicyListRecord) => {
  const latest = policy.versions[0] ?? null;
  return {
    id: policy.id,
    code: policy.code,
    title: policy.title,
    description: policy.description,
    lifecycleStatus: policy.lifecycleStatus,
    owner: personDto(policy.owner),
    department: policy.department
      ? {
          id: policy.department.id,
          code: policy.department.code,
          name: policy.department.name,
        }
      : null,
    currentApprovedVersion: policy.currentApprovedVersion
      ? policyVersionListDto(policy.currentApprovedVersion)
      : null,
    latestVersion: latest ? policyVersionListDto(latest) : null,
    archivedAt: policy.archivedAt,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
};

const assertEditableVersion = (status: PolicyVersionStatus) => {
  if (status !== "DRAFT" && status !== "REJECTED") {
    throw versionImmutable();
  }
};

/**
 * Fill null governance dates so APPROVED rows can satisfy
 * policy_versions_submission_fields_consistent.
 *
 * The lifecycle trigger only allows status/approver fields to change on
 * SUBMITTED → APPROVED, so null dates must be filled while still DRAFT/REJECTED
 * (typically on submit) rather than on the approve update itself.
 */
export const resolveApprovalDates = (input: {
  effectiveDate: Date | null;
  reviewDate: Date | null;
  /** UTC instant used when effectiveDate is null (approval/submit time). */
  decisionAt: Date;
}) => {
  const decisionDay = dateOnly(input.decisionAt)!;
  const effective = dateOnly(input.effectiveDate) ?? decisionDay;

  let review = dateOnly(input.reviewDate);
  if (!review) {
    const filled = new Date(`${effective}T00:00:00.000Z`);
    filled.setUTCFullYear(filled.getUTCFullYear() + 1);
    review = dateOnly(filled)!;
  }
  if (review <= effective) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Review date must be later than effective date",
    );
  }
  return {
    effectiveDate: new Date(`${effective}T00:00:00.000Z`),
    reviewDate: new Date(`${review}T00:00:00.000Z`),
  };
};

/** Aligns merged dates with policy_versions_dates_valid. */
export const assertPolicyDatesPair = (
  effectiveDate: Date | null,
  reviewDate: Date | null,
) => {
  if ((effectiveDate == null) !== (reviewDate == null)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "effectiveDate and reviewDate must both be set or both be null",
    );
  }
  if (
    effectiveDate &&
    reviewDate &&
    dateOnly(reviewDate)! <= dateOnly(effectiveDate)!
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Review date must be later than effective date",
    );
  }
};

const assertDatesForApproval = (input: {
  effectiveDate: Date | null;
  reviewDate: Date | null;
}) => {
  const effective = dateOnly(input.effectiveDate);
  const review = dateOnly(input.reviewDate);
  if (!effective || !review) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Effective date and review date are required before approval",
    );
  }
  if (review <= effective) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Review date must be later than effective date",
    );
  }
  if (effective > utcToday()) {
    throw new AppError(
      409,
      "POLICY_VERSION_INVALID_STATE",
      "Future-effective Policy approval is unsupported",
    );
  }
};

export class PolicyService {
  constructor(
    private readonly repository: PolicyRepository,
    private readonly evidenceGate: EvidenceGateService,
  ) {}

  private async assertActiveMember(tenantId: string, userId: string | null) {
    if (!userId) return;
    const member = await this.repository.findTenantUser(tenantId, userId);
    if (!member) {
      throw relatedInvalid("Related user is not an active Company member");
    }
  }

  private async assertDepartment(tenantId: string, departmentId: string | null) {
    if (!departmentId) return;
    const department = await this.repository.findDepartment(
      tenantId,
      departmentId,
    );
    if (!department) {
      throw relatedInvalid("Department was not found for this Company");
    }
  }

  private async assertFrameworks(frameworkIds: string[]) {
    const unique = [...new Set(frameworkIds)];
    if (unique.length === 0) return unique;
    const found = await this.repository.findActiveFrameworks(unique);
    if (found.length !== unique.length) {
      throw relatedInvalid("One or more Frameworks are invalid or inactive");
    }
    return unique;
  }

  private requirePolicy(policy: PolicyDetailRecord | null) {
    if (!policy) throw policyNotFound();
    return policy;
  }

  async list(tenantId: string, query: PolicyListQuery) {
    const result = await this.repository.listPolicies(tenantId, query);
    return {
      data: result.items.map((item) => policyListDto(item)),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, policyId: string) {
    return policyDto(
      this.requirePolicy(await this.repository.findPolicy(tenantId, policyId)),
    );
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreatePolicyBody,
    context: AuditContext,
  ) {
    try {
      assertPolicyContent(body.content);
    } catch (error) {
      mapGovernanceError(error);
    }
    await this.assertActiveMember(tenantId, body.ownerId ?? null);
    await this.assertActiveMember(tenantId, body.requestedApproverId ?? null);
    await this.assertDepartment(tenantId, body.departmentId ?? null);
    const frameworkIds = await this.assertFrameworks(body.frameworkIds ?? []);

    const created = await this.repository.createPolicyWithInitialVersion({
      tenantId,
      actorUserId,
      title: body.title,
      description: body.description ?? null,
      ownerId: body.ownerId ?? null,
      departmentId: body.departmentId ?? null,
      content: body.content,
      purpose: body.purpose ?? null,
      scope: body.scope ?? null,
      changeSummary: body.changeSummary ?? null,
      effectiveDate: inputDate(body.effectiveDate),
      reviewDate: inputDate(body.reviewDate),
      requiresEvidence: body.requiresEvidence ?? false,
      requestedApproverId: body.requestedApproverId ?? null,
      frameworkIds,
      context,
    });
    if (!created) throw policyNotFound();
    return policyDto(created);
  }

  async update(
    tenantId: string,
    policyId: string,
    actorUserId: string,
    body: UpdatePolicyBody,
    context: AuditContext,
  ) {
    const existing = this.requirePolicy(
      await this.repository.findPolicy(tenantId, policyId),
    );
    if (existing.lifecycleStatus === "ARCHIVED") throw policyArchived();
    if (body.ownerId !== undefined) {
      await this.assertActiveMember(tenantId, body.ownerId);
    }
    if (body.departmentId !== undefined) {
      await this.assertDepartment(tenantId, body.departmentId);
    }
    const changedFields = Object.keys(body);
    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockPolicy(tx, tenantId, policyId);
      if (!locked[0]) throw policyNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw policyArchived();
      await tx.policy.update({
        where: { id: policyId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
          ...(body.departmentId !== undefined
            ? { departmentId: body.departmentId }
            : {}),
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_UPDATED",
        entityType: "POLICY",
        entityId: policyId,
        metadata: safePolicyAuditMetadata({
          code: locked[0].code,
          changedFields,
        }),
        context,
      });
      return this.repository.findPolicy(tenantId, policyId, tx);
    });
    return policyDto(this.requirePolicy(updated));
  }

  async archive(
    tenantId: string,
    policyId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockPolicy(tx, tenantId, policyId);
      if (!locked[0]) throw policyNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") {
        throw new AppError(409, "POLICY_ARCHIVED", "Policy is already archived");
      }
      const submitted = await tx.policyVersion.count({
        where: { tenantId, policyId, status: "SUBMITTED" },
      });
      if (submitted > 0) {
        throw new AppError(
          409,
          "POLICY_VERSION_INVALID_STATE",
          "Policy cannot be archived while a Version is SUBMITTED",
        );
      }
      await tx.policy.update({
        where: { id: policyId },
        data: {
          lifecycleStatus: "ARCHIVED",
          archivedAt: new Date(),
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_ARCHIVED",
        entityType: "POLICY",
        entityId: policyId,
        metadata: safePolicyAuditMetadata({
          code: locked[0].code,
          changedFields: ["lifecycleStatus"],
        }),
        context,
      });
      return this.repository.findPolicy(tenantId, policyId, tx);
    });
    return policyDto(this.requirePolicy(updated));
  }

  async listVersions(tenantId: string, policyId: string) {
    this.requirePolicy(await this.repository.findPolicy(tenantId, policyId));
    const versions = await this.repository.listVersions(tenantId, policyId);
    return versions.map((version) => policyVersionDto(version));
  }

  async getVersion(tenantId: string, policyId: string, versionId: string) {
    this.requirePolicy(await this.repository.findPolicy(tenantId, policyId));
    const version = await this.repository.findVersionForPolicy(
      tenantId,
      policyId,
      versionId,
    );
    if (!version) throw versionNotFound();
    return policyVersionDto(version);
  }

  async createVersion(
    tenantId: string,
    policyId: string,
    actorUserId: string,
    body: CreatePolicyVersionBody,
    context: AuditContext,
  ) {
    try {
      assertPolicyContent(body.content);
    } catch (error) {
      mapGovernanceError(error);
    }
    await this.assertActiveMember(tenantId, body.requestedApproverId ?? null);
    const frameworkIds = await this.assertFrameworks(body.frameworkIds ?? []);

    const created = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockPolicy(tx, tenantId, policyId);
      if (!locked[0]) throw policyNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw policyArchived();

      const latest = await tx.policyVersion.findFirst({
        where: { tenantId, policyId },
        orderBy: { sequence: "desc" },
        select: { versionMajor: true, versionMinor: true },
      });
      const allocated = allocatePolicyVersion(
        locked[0].next_version_sequence,
        latest
          ? { major: latest.versionMajor, minor: latest.versionMinor }
          : null,
        body.bump as PolicyVersionBump,
      );

      await tx.policy.update({
        where: { id: policyId },
        data: {
          nextVersionSequence: { increment: 1 },
          updatedById: actorUserId,
        },
      });

      const version = await tx.policyVersion.create({
        data: {
          tenantId,
          policyId,
          sequence: allocated.sequence,
          versionMajor: allocated.major,
          versionMinor: allocated.minor,
          content: body.content,
          purpose: body.purpose ?? null,
          scope: body.scope ?? null,
          changeSummary: body.changeSummary ?? null,
          status: "DRAFT",
          effectiveDate: inputDate(body.effectiveDate),
          reviewDate: inputDate(body.reviewDate),
          requiresEvidence: body.requiresEvidence ?? false,
          requestedApproverId: body.requestedApproverId ?? null,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      });

      if (frameworkIds.length > 0) {
        await tx.policyFramework.createMany({
          data: frameworkIds.map((frameworkId) => ({
            tenantId,
            policyId,
            policyVersionId: version.id,
            frameworkId,
            isActive: true,
            createdById: actorUserId,
            updatedById: actorUserId,
          })),
        });
      }

      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_VERSION_CREATED",
        entityType: "POLICY_VERSION",
        entityId: version.id,
        metadata: safePolicyAuditMetadata({
          code: locked[0].code,
          version: allocated.label,
          toStatus: "DRAFT",
        }),
        context,
      });
      if (frameworkIds.length > 0) {
        await this.repository.writeAudit(tx, {
          tenantId,
          actorUserId,
          action: "POLICY_FRAMEWORKS_CHANGED",
          entityType: "POLICY_VERSION",
          entityId: version.id,
          metadata: {
            code: locked[0].code,
            version: allocated.label,
            frameworkCount: frameworkIds.length,
            frameworkIds,
          },
          context,
        });
      }
      return this.repository.findVersionForPolicy(
        tenantId,
        policyId,
        version.id,
        tx,
      );
    });
    if (!created) throw versionNotFound();
    return policyVersionDto(created);
  }

  async updateVersion(
    tenantId: string,
    versionId: string,
    actorUserId: string,
    body: UpdatePolicyVersionBody,
    context: AuditContext,
  ) {
    if (body.content !== undefined) {
      try {
        assertPolicyContent(body.content);
      } catch (error) {
        mapGovernanceError(error);
      }
    }
    if (body.requestedApproverId !== undefined) {
      await this.assertActiveMember(tenantId, body.requestedApproverId);
    }

    const updated = await this.repository.runInTransaction(async (tx) => {
      const lockedVersion = await this.repository.lockVersion(
        tx,
        tenantId,
        versionId,
      );
      if (!lockedVersion[0]) throw versionNotFound();
      const lockedPolicy = await this.repository.lockPolicy(
        tx,
        tenantId,
        lockedVersion[0].policy_id,
      );
      if (!lockedPolicy[0]) throw policyNotFound();
      if (lockedPolicy[0].lifecycle_status === "ARCHIVED") throw policyArchived();
      assertEditableVersion(lockedVersion[0].status);

      const effectiveDate =
        body.effectiveDate !== undefined
          ? inputDate(body.effectiveDate)
          : lockedVersion[0].effective_date;
      const reviewDate =
        body.reviewDate !== undefined
          ? inputDate(body.reviewDate)
          : lockedVersion[0].review_date;
      assertPolicyDatesPair(effectiveDate, reviewDate);

      await tx.policyVersion.update({
        where: { id: versionId },
        data: {
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
          ...(body.changeSummary !== undefined
            ? { changeSummary: body.changeSummary }
            : {}),
          ...(body.effectiveDate !== undefined
            ? { effectiveDate: inputDate(body.effectiveDate) }
            : {}),
          ...(body.reviewDate !== undefined
            ? { reviewDate: inputDate(body.reviewDate) }
            : {}),
          ...(body.requiresEvidence !== undefined
            ? { requiresEvidence: body.requiresEvidence }
            : {}),
          ...(body.requestedApproverId !== undefined
            ? { requestedApproverId: body.requestedApproverId }
            : {}),
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_VERSION_UPDATED",
        entityType: "POLICY_VERSION",
        entityId: versionId,
        metadata: safePolicyAuditMetadata({
          code: lockedPolicy[0].code,
          version: `${lockedVersion[0].version_major}.${lockedVersion[0].version_minor}`,
          changedFields: Object.keys(body),
        }),
        context,
      });
      return this.repository.findVersion(tenantId, versionId, tx);
    });
    if (!updated) throw versionNotFound();
    return policyVersionDto(updated);
  }

  async replaceFrameworks(
    tenantId: string,
    versionId: string,
    actorUserId: string,
    body: ReplacePolicyFrameworksBody,
    context: AuditContext,
  ) {
    const frameworkIds = await this.assertFrameworks(body.frameworkIds);
    const unique = [...new Set(frameworkIds)];

    const updated = await this.repository.runInTransaction(async (tx) => {
      const lockedVersion = await this.repository.lockVersion(
        tx,
        tenantId,
        versionId,
      );
      if (!lockedVersion[0]) throw versionNotFound();
      const lockedPolicy = await this.repository.lockPolicy(
        tx,
        tenantId,
        lockedVersion[0].policy_id,
      );
      if (!lockedPolicy[0]) throw policyNotFound();
      if (lockedPolicy[0].lifecycle_status === "ARCHIVED") throw policyArchived();
      assertEditableVersion(lockedVersion[0].status);

      const existing = await tx.policyFramework.findMany({
        where: {
          tenantId,
          policyVersionId: versionId,
        },
      });
      const desired = new Set(unique);
      for (const mapping of existing) {
        const shouldBeActive = desired.has(mapping.frameworkId);
        if (mapping.isActive !== shouldBeActive) {
          await tx.policyFramework.update({
            where: { id: mapping.id },
            data: { isActive: shouldBeActive, updatedById: actorUserId },
          });
        }
        desired.delete(mapping.frameworkId);
      }
      for (const frameworkId of desired) {
        await tx.policyFramework.create({
          data: {
            tenantId,
            policyId: lockedVersion[0].policy_id,
            policyVersionId: versionId,
            frameworkId,
            isActive: true,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });
      }
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_FRAMEWORKS_CHANGED",
        entityType: "POLICY_VERSION",
        entityId: versionId,
        metadata: {
          code: lockedPolicy[0].code,
          version: `${lockedVersion[0].version_major}.${lockedVersion[0].version_minor}`,
          frameworkCount: unique.length,
          frameworkIds: unique,
        },
        context,
      });
      return this.repository.findVersion(tenantId, versionId, tx);
    });
    if (!updated) throw versionNotFound();
    return policyVersionDto(updated);
  }

  async submit(
    tenantId: string,
    versionId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      const lockedVersion = await this.repository.lockVersion(
        tx,
        tenantId,
        versionId,
      );
      if (!lockedVersion[0]) throw versionNotFound();
      const lockedPolicy = await this.repository.lockPolicy(
        tx,
        tenantId,
        lockedVersion[0].policy_id,
      );
      if (!lockedPolicy[0]) throw policyNotFound();
      if (lockedPolicy[0].lifecycle_status === "ARCHIVED") throw policyArchived();

      const fromStatus = lockedVersion[0].status;
      try {
        assertPolicyVersionTransition(fromStatus, "SUBMITTED");
      } catch (error) {
        mapGovernanceError(error);
      }
      if (lockedVersion[0].requested_approver_id) {
        const member = await tx.userCompany.findFirst({
          where: {
            tenantId,
            userId: lockedVersion[0].requested_approver_id,
            status: "ACTIVE",
            user: { status: "ACTIVE" },
          },
        });
        if (!member) {
          throw relatedInvalid(
            "Requested approver is not an active Company member",
          );
        }
      }

      const submittedAt = new Date();
      // Lifecycle trigger forbids date changes on SUBMITTED→APPROVED, so fill
      // null effective/review dates here (DRAFT/REJECTED→SUBMITTED is mutable).
      const approvalDates = resolveApprovalDates({
        effectiveDate: lockedVersion[0].effective_date,
        reviewDate: lockedVersion[0].review_date,
        decisionAt: submittedAt,
      });
      await tx.policyVersion.update({
        where: { id: versionId },
        data: {
          status: "SUBMITTED",
          submittedById: actorUserId,
          submittedAt,
          effectiveDate: approvalDates.effectiveDate,
          reviewDate: approvalDates.reviewDate,
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action:
          fromStatus === "REJECTED"
            ? "POLICY_VERSION_RESUBMITTED"
            : "POLICY_VERSION_SUBMITTED",
        entityType: "POLICY_VERSION",
        entityId: versionId,
        metadata: safePolicyAuditMetadata({
          code: lockedPolicy[0].code,
          version: `${lockedVersion[0].version_major}.${lockedVersion[0].version_minor}`,
          fromStatus,
          toStatus: "SUBMITTED",
        }),
        context,
      });
      return this.repository.findVersion(tenantId, versionId, tx);
    });
    if (!updated) throw versionNotFound();
    return policyVersionDto(updated);
  }

  private assertApproverActor(
    version: {
      submitted_by_id: string | null;
      requested_approver_id: string | null;
    },
    actorUserId: string,
  ) {
    if (version.submitted_by_id === actorUserId) {
      throw new AppError(
        403,
        "POLICY_SELF_APPROVAL_FORBIDDEN",
        "Policy Version self-approval is prohibited",
      );
    }
    if (
      version.requested_approver_id &&
      version.requested_approver_id !== actorUserId
    ) {
      throw new AppError(
        403,
        "POLICY_APPROVER_INVALID",
        "Only the requested Policy Version approver may decide",
      );
    }
  }

  async reject(
    tenantId: string,
    versionId: string,
    actorUserId: string,
    body: RejectPolicyVersionBody,
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      const lockedVersion = await this.repository.lockVersion(
        tx,
        tenantId,
        versionId,
      );
      if (!lockedVersion[0]) throw versionNotFound();
      const lockedPolicy = await this.repository.lockPolicy(
        tx,
        tenantId,
        lockedVersion[0].policy_id,
      );
      if (!lockedPolicy[0]) throw policyNotFound();
      if (lockedPolicy[0].lifecycle_status === "ARCHIVED") throw policyArchived();
      this.assertApproverActor(lockedVersion[0], actorUserId);
      try {
        assertPolicyVersionTransition(lockedVersion[0].status, "REJECTED");
      } catch (error) {
        mapGovernanceError(error);
      }

      await tx.policyVersion.update({
        where: { id: versionId },
        data: { status: "REJECTED", updatedById: actorUserId },
      });
      await tx.policyApproval.create({
        data: {
          tenantId,
          policyId: lockedVersion[0].policy_id,
          policyVersionId: versionId,
          actedById: actorUserId,
          decision: "REJECTED",
          comments: body.comments,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_VERSION_REJECTED",
        entityType: "POLICY_VERSION",
        entityId: versionId,
        metadata: safePolicyAuditMetadata({
          code: lockedPolicy[0].code,
          version: `${lockedVersion[0].version_major}.${lockedVersion[0].version_minor}`,
          fromStatus: "SUBMITTED",
          toStatus: "REJECTED",
        }),
        context,
      });
      return this.repository.findVersion(tenantId, versionId, tx);
    });
    if (!updated) throw versionNotFound();
    return policyVersionDto(updated);
  }

  async approve(
    tenantId: string,
    versionId: string,
    actorUserId: string,
    _body: ApprovePolicyVersionBody,
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      const lockedPolicyRows = await tx.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: string;
          current_approved_version_id: string | null;
        }>
      >`
        SELECT p.id, p.code, p.lifecycle_status, p.current_approved_version_id
        FROM policy_versions AS v
        INNER JOIN policies AS p
          ON p.tenant_id = v.tenant_id AND p.id = v.policy_id
        WHERE v.tenant_id = ${tenantId}::uuid AND v.id = ${versionId}::uuid
        FOR UPDATE OF p
      `;
      if (!lockedPolicyRows[0]) throw versionNotFound();
      const policy = lockedPolicyRows[0];
      if (policy.lifecycle_status === "ARCHIVED") throw policyArchived();

      const lockedVersion = await this.repository.lockVersion(
        tx,
        tenantId,
        versionId,
      );
      if (!lockedVersion[0]) throw versionNotFound();
      if (lockedVersion[0].policy_id !== policy.id) throw versionNotFound();

      try {
        assertPolicyApprovalAllowed({
          status: lockedVersion[0].status,
          submitterId: lockedVersion[0].submitted_by_id,
          actorId: actorUserId,
          requiresEvidence: lockedVersion[0].requires_evidence,
        });
      } catch (error) {
        mapGovernanceError(error);
      }
      this.assertApproverActor(lockedVersion[0], actorUserId);
      if (lockedVersion[0].requested_approver_id) {
        const member = await tx.userCompany.findFirst({
          where: {
            tenantId,
            userId: lockedVersion[0].requested_approver_id,
            status: "ACTIVE",
            user: { status: "ACTIVE" },
          },
        });
        if (!member) {
          throw relatedInvalid(
            "Requested approver is not an active Company member",
          );
        }
      }
      assertDatesForApproval({
        effectiveDate: lockedVersion[0].effective_date,
        reviewDate: lockedVersion[0].review_date,
      });

      // Real Policy Evidence gate (Slice 5.5C) before any approval writes.
      await this.evidenceGate.assertPolicyVersionApprovalSatisfied({
        tenantId,
        policyVersionId: versionId,
        requiresEvidence: lockedVersion[0].requires_evidence,
        asOfDate: utcDateString(),
        tx,
      });

      const previousId = policy.current_approved_version_id;
      if (previousId) {
        const previous = await this.repository.lockVersion(
          tx,
          tenantId,
          previousId,
        );
        if (!previous[0] || previous[0].status !== "APPROVED") {
          throw new AppError(
            409,
            "POLICY_CURRENT_VERSION_CONFLICT",
            "Current approved Policy Version is inconsistent",
          );
        }
        await tx.policyVersion.update({
          where: { id: previousId },
          data: {
            status: "SUPERSEDED",
            supersededById: versionId,
            updatedById: actorUserId,
          },
        });
        await this.repository.writeAudit(tx, {
          tenantId,
          actorUserId,
          action: "POLICY_VERSION_SUPERSEDED",
          entityType: "POLICY_VERSION",
          entityId: previousId,
          metadata: safePolicyAuditMetadata({
            code: policy.code,
            version: `${previous[0].version_major}.${previous[0].version_minor}`,
            fromStatus: "APPROVED",
            toStatus: "SUPERSEDED",
          }),
          context,
        });
      }

      const approvedAt = new Date();
      await tx.policyVersion.update({
        where: { id: versionId },
        data: {
          status: "APPROVED",
          approvedById: actorUserId,
          approvedAt,
          updatedById: actorUserId,
        },
      });
      await tx.policy.update({
        where: { id: policy.id },
        data: {
          currentApprovedVersionId: versionId,
          updatedById: actorUserId,
        },
      });
      await tx.policyApproval.create({
        data: {
          tenantId,
          policyId: policy.id,
          policyVersionId: versionId,
          actedById: actorUserId,
          decision: "APPROVED",
          comments: _body.comments ?? null,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "POLICY_VERSION_APPROVED",
        entityType: "POLICY_VERSION",
        entityId: versionId,
        metadata: safePolicyAuditMetadata({
          code: policy.code,
          version: `${lockedVersion[0].version_major}.${lockedVersion[0].version_minor}`,
          fromStatus: "SUBMITTED",
          toStatus: "APPROVED",
        }),
        context,
      });
      return this.repository.findVersion(tenantId, versionId, tx);
    });
    if (!updated) throw versionNotFound();
    return policyVersionDto(updated);
  }

  async traceability(tenantId: string, policyId: string) {
    const result = await this.repository.getTraceability(tenantId, policyId);
    if (!result) throw policyNotFound();
    return {
      policy: policyDto(result.policy),
      focusVersion: result.focusVersion
        ? policyVersionDto(result.focusVersion)
        : null,
      controlMappings: result.controlMappings.map((mapping) => ({
        id: mapping.id,
        isActive: mapping.isActive,
        control: {
          id: mapping.control.id,
          code: mapping.control.code,
          title: mapping.control.title,
          lifecycleStatus: mapping.control.lifecycleStatus,
        },
      })),
    };
  }

  async listAuditEvents(
    tenantId: string,
    policyId: string,
    query: PolicyAuditListQuery,
  ) {
    this.requirePolicy(await this.repository.findPolicy(tenantId, policyId));
    const result = await this.repository.listAuditEvents(
      tenantId,
      policyId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.items.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        metadata: item.metadata,
        createdAt: item.createdAt,
        userId: item.userId,
      })),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }
}
