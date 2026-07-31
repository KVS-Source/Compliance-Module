import {
  Prisma,
  type CheckpointOutcome,
  type GovernanceRecordStatus,
} from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { GovernanceRuleError } from "../governance/domain-error.js";
import {
  assertCheckpointReview,
  assertCheckpointTextContent,
  assertGovernanceLifecycleTransition,
  assertSameStateCheckpointLifecycleForbidden,
  safeCheckpointAuditMetadata,
} from "./domain.js";
import type {
  AuditContext,
  CheckpointCounts,
  CheckpointRecord,
  CheckpointRepository,
  CheckpointReviewRecord,
} from "./repository.js";
import type {
  CheckpointAuditListQuery,
  CheckpointListQuery,
  CheckpointReviewListQuery,
  CreateCheckpointBody,
  CreateCheckpointReviewBody,
  UpdateCheckpointBody,
} from "./validators.js";

const dateOnly = (value: Date | null | undefined) =>
  value == null ? null : value.toISOString().slice(0, 10);

const inputDate = (value: string | null | undefined) =>
  value == null ? null : new Date(`${value}T00:00:00.000Z`);

const personDto = (
  person: { id: string; code: string; fullName: string } | null | undefined,
) =>
  person ? { id: person.id, code: person.code, name: person.fullName } : null;

const departmentDto = (
  department:
    | { id: string; code: string; name: string }
    | null
    | undefined,
) =>
  department
    ? {
        id: department.id,
        code: department.code,
        name: department.name,
      }
    : null;

const controlSummaryDto = (
  control:
    | {
        id: string;
        code: string;
        title: string;
        lifecycleStatus: GovernanceRecordStatus;
      }
    | null
    | undefined,
) =>
  control
    ? {
        id: control.id,
        code: control.code,
        title: control.title,
        lifecycleStatus: control.lifecycleStatus,
      }
    : null;

const latestReviewSummaryDto = (
  review: CheckpointRecord["latestReview"] | null | undefined,
) =>
  review
    ? {
        id: review.id,
        reviewPeriod: review.reviewPeriod,
        reviewDate: dateOnly(review.reviewDate),
        outcome: review.outcome,
        nextReviewDate: dateOnly(review.nextReviewDate),
        submittedAt: review.submittedAt,
        reviewer: personDto(review.reviewer),
      }
    : null;

const mapGovernanceError = (error: unknown): never => {
  if (error instanceof GovernanceRuleError) {
    if (
      error.code === "CHECKPOINT_INVALID_STATE" ||
      error.code === "GOVERNANCE_ARCHIVE_TERMINAL"
    ) {
      throw new AppError(409, "CHECKPOINT_INVALID_STATE", error.message);
    }
    if (
      error.code === "CHECKPOINT_REVIEW_PERIOD_INVALID" ||
      error.code === "CHECKPOINT_OBSERVATION_REQUIRED" ||
      error.code === "CHECKPOINT_REVIEW_DATE_INVALID"
    ) {
      throw new AppError(400, "CHECKPOINT_REVIEW_INVALID", error.message);
    }
    if (error.code === "CHECKPOINT_CONTENT_HTML_FORBIDDEN") {
      throw new AppError(400, "VALIDATION_ERROR", error.message);
    }
    throw new AppError(400, error.code, error.message);
  }
  throw error;
};

const relatedInvalid = (message: string) =>
  new AppError(400, "RELATED_RECORD_INVALID", message);

const checkpointNotFound = () =>
  new AppError(404, "CHECKPOINT_NOT_FOUND", "Checkpoint not found");

const checkpointArchived = () =>
  new AppError(
    409,
    "CHECKPOINT_INVALID_STATE",
    "Checkpoint is archived and cannot be modified",
  );

const parentControlArchived = (message: string) =>
  new AppError(409, "CHECKPOINT_PARENT_CONTROL_ARCHIVED", message);

const invalidState = (message: string) =>
  new AppError(409, "CHECKPOINT_INVALID_STATE", message);

const reviewDuplicate = () =>
  new AppError(
    409,
    "CHECKPOINT_REVIEW_DUPLICATE",
    "A Review already exists for this Checkpoint and review period",
  );

const reviewConflict = (message: string) =>
  new AppError(409, "CHECKPOINT_REVIEW_CONFLICT", message);

const isReviewPeriodUniqueViolation = (error: unknown) => {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some(
      (field) =>
        typeof field === "string" &&
        (field.includes("review_period") || field.includes("reviewPeriod")),
    );
  }
  if (typeof target === "string") {
    return (
      target.includes("review_period") || target.includes("reviewPeriod")
    );
  }
  // Unique index name fallback when Prisma withholds field names.
  return true;
};

export const checkpointDetailDto = (
  checkpoint: CheckpointRecord,
  counts: CheckpointCounts,
) => ({
  id: checkpoint.id,
  code: checkpoint.code,
  title: checkpoint.title,
  description: checkpoint.description,
  verificationFrequency: checkpoint.verificationFrequency,
  owner: personDto(checkpoint.owner),
  department: departmentDto(checkpoint.department),
  expectedResult: checkpoint.expectedResult,
  evidenceRequired: checkpoint.evidenceRequired,
  lifecycleStatus: checkpoint.lifecycleStatus,
  initialReviewDate: dateOnly(checkpoint.initialReviewDate),
  nextReviewDate: dateOnly(checkpoint.nextReviewDate),
  lastReviewedAt: checkpoint.lastReviewedAt,
  control: controlSummaryDto(checkpoint.control),
  latestReview: latestReviewSummaryDto(checkpoint.latestReview),
  totalReviewCount: counts.totalReviewCount,
  activePolicyVersionMappingCount: counts.activePolicyVersionMappingCount,
  activeFrameworkMappingCount: counts.activeFrameworkMappingCount,
  activeFrameworkRuleMappingCount: counts.activeFrameworkRuleMappingCount,
  archivedAt: checkpoint.archivedAt,
  createdAt: checkpoint.createdAt,
  updatedAt: checkpoint.updatedAt,
});

export const checkpointListDto = (
  checkpoint: CheckpointRecord,
  counts: CheckpointCounts,
) => ({
  id: checkpoint.id,
  code: checkpoint.code,
  title: checkpoint.title,
  verificationFrequency: checkpoint.verificationFrequency,
  owner: personDto(checkpoint.owner),
  department: departmentDto(checkpoint.department),
  evidenceRequired: checkpoint.evidenceRequired,
  lifecycleStatus: checkpoint.lifecycleStatus,
  initialReviewDate: dateOnly(checkpoint.initialReviewDate),
  nextReviewDate: dateOnly(checkpoint.nextReviewDate),
  lastReviewedAt: checkpoint.lastReviewedAt,
  control: controlSummaryDto(checkpoint.control),
  latestOutcome: checkpoint.latestReview?.outcome ?? null,
  totalReviewCount: counts.totalReviewCount,
  archivedAt: checkpoint.archivedAt,
  createdAt: checkpoint.createdAt,
  updatedAt: checkpoint.updatedAt,
});

export const checkpointReviewDto = (review: CheckpointReviewRecord) => ({
  id: review.id,
  checkpointId: review.checkpointId,
  reviewPeriod: review.reviewPeriod,
  reviewDate: dateOnly(review.reviewDate),
  outcome: review.outcome,
  observation: review.observation,
  recommendation: review.recommendation,
  nextReviewDate: dateOnly(review.nextReviewDate),
  submittedAt: review.submittedAt,
  reviewer: personDto(review.reviewer),
});

export class CheckpointService {
  constructor(private readonly repository: CheckpointRepository) {}

  private async assertActiveMember(tenantId: string, userId: string | null) {
    if (!userId) return;
    const member = await this.repository.findTenantUser(tenantId, userId);
    if (!member) {
      throw relatedInvalid("Related user is not an active Company member");
    }
  }

  private async assertDepartment(
    tenantId: string,
    departmentId: string | null,
  ) {
    if (!departmentId) return;
    const department = await this.repository.findDepartment(
      tenantId,
      departmentId,
    );
    if (!department) {
      throw relatedInvalid("Department was not found for this Company");
    }
  }

  private requireCheckpoint(checkpoint: CheckpointRecord | null) {
    if (!checkpoint) throw checkpointNotFound();
    return checkpoint;
  }

  private async loadWithCounts(tenantId: string, checkpointId: string) {
    const checkpoint = this.requireCheckpoint(
      await this.repository.findCheckpoint(tenantId, checkpointId),
    );
    const counts = await this.repository.getCheckpointCounts(tenantId, [
      { id: checkpointId, controlId: checkpoint.controlId },
    ]);
    return { checkpoint, counts: counts.get(checkpointId)! };
  }

  async list(tenantId: string, query: CheckpointListQuery) {
    const result = await this.repository.listCheckpoints(tenantId, query);
    return {
      data: result.items.map((item) =>
        checkpointListDto(item, result.counts.get(item.id)!),
      ),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, checkpointId: string) {
    const { checkpoint, counts } = await this.loadWithCounts(
      tenantId,
      checkpointId,
    );
    return checkpointDetailDto(checkpoint, counts);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateCheckpointBody,
    context: AuditContext,
  ) {
    try {
      assertCheckpointTextContent("description", body.description);
      assertCheckpointTextContent("expectedResult", body.expectedResult);
    } catch (error) {
      mapGovernanceError(error);
    }
    await this.assertActiveMember(tenantId, body.ownerId ?? null);
    await this.assertDepartment(tenantId, body.departmentId ?? null);

    const created = await this.repository.createCheckpoint({
      tenantId,
      actorUserId,
      controlId: body.controlId,
      title: body.title,
      description: body.description ?? null,
      verificationFrequency: body.verificationFrequency,
      ownerId: body.ownerId ?? null,
      departmentId: body.departmentId ?? null,
      expectedResult: body.expectedResult,
      evidenceRequired: body.evidenceRequired ?? false,
      initialReviewDate: inputDate(body.initialReviewDate),
      context,
    });

    if ("error" in created) {
      if (created.error === "CONTROL_NOT_FOUND") {
        throw relatedInvalid("Parent Control was not found for this Company");
      }
      throw parentControlArchived(
        "Cannot create a Checkpoint under an archived Control",
      );
    }
    if (!created.checkpoint) throw checkpointNotFound();
    const counts = await this.repository.getCheckpointCounts(tenantId, [
      {
        id: created.checkpoint.id,
        controlId: created.checkpoint.controlId,
      },
    ]);
    return checkpointDetailDto(
      created.checkpoint,
      counts.get(created.checkpoint.id)!,
    );
  }

  async update(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    body: UpdateCheckpointBody,
    context: AuditContext,
  ) {
    const existing = this.requireCheckpoint(
      await this.repository.findCheckpoint(tenantId, checkpointId),
    );
    if (existing.lifecycleStatus === "ARCHIVED") throw checkpointArchived();

    try {
      if (body.description !== undefined) {
        assertCheckpointTextContent("description", body.description);
      }
      if (body.expectedResult !== undefined) {
        assertCheckpointTextContent("expectedResult", body.expectedResult);
      }
    } catch (error) {
      mapGovernanceError(error);
    }

    if (body.ownerId !== undefined) {
      await this.assertActiveMember(tenantId, body.ownerId);
    }
    if (body.departmentId !== undefined) {
      await this.assertDepartment(tenantId, body.departmentId);
    }

    const updated = await this.repository.runInTransaction(async (tx) => {
      const locked = await this.repository.lockCheckpoint(
        tx,
        tenantId,
        checkpointId,
      );
      if (!locked[0]) throw checkpointNotFound();
      if (locked[0].lifecycle_status === "ARCHIVED") throw checkpointArchived();

      const current = locked[0];
      const reviewCount = await this.repository.countReviews(
        tx,
        tenantId,
        checkpointId,
      );
      const changedFields: string[] = [];
      const data: Record<string, unknown> = { updatedById: actorUserId };

      if (body.title !== undefined && body.title !== current.title) {
        changedFields.push("title");
        data.title = body.title;
      }
      if (body.description !== undefined) {
        const next = body.description;
        if (next !== current.description) {
          changedFields.push("description");
          data.description = next;
        }
      }
      if (
        body.expectedResult !== undefined &&
        body.expectedResult !== current.expected_result
      ) {
        changedFields.push("expectedResult");
        data.expectedResult = body.expectedResult;
      }
      if (body.ownerId !== undefined && body.ownerId !== current.owner_id) {
        changedFields.push("ownerId");
        data.ownerId = body.ownerId;
      }
      if (
        body.departmentId !== undefined &&
        body.departmentId !== current.department_id
      ) {
        changedFields.push("departmentId");
        data.departmentId = body.departmentId;
      }
      if (
        body.evidenceRequired !== undefined &&
        body.evidenceRequired !== current.evidence_required
      ) {
        changedFields.push("evidenceRequired");
        data.evidenceRequired = body.evidenceRequired;
      }
      if (body.verificationFrequency !== undefined) {
        if (
          body.verificationFrequency !== current.verification_frequency
        ) {
          if (reviewCount > 0) {
            throw invalidState(
              "verificationFrequency cannot change after the first Review",
            );
          }
          changedFields.push("verificationFrequency");
          data.verificationFrequency = body.verificationFrequency;
        }
      }
      if (body.initialReviewDate !== undefined) {
        const next = inputDate(body.initialReviewDate);
        if (dateOnly(next) !== dateOnly(current.initial_review_date)) {
          if (reviewCount > 0) {
            throw invalidState(
              "initialReviewDate cannot change after the first Review",
            );
          }
          changedFields.push("initialReviewDate");
          data.initialReviewDate = next;
        }
      }
      if (body.nextReviewDate !== undefined) {
        const next = inputDate(body.nextReviewDate);
        if (dateOnly(next) !== dateOnly(current.next_review_date)) {
          changedFields.push("nextReviewDate");
          data.nextReviewDate = next;
        }
      }

      if (changedFields.length === 0) {
        return this.repository.findCheckpoint(tenantId, checkpointId, tx);
      }

      await tx.checkpoint.update({
        where: { id: checkpointId },
        data,
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action: "CHECKPOINT_UPDATED",
        entityType: "CHECKPOINT",
        entityId: checkpointId,
        metadata: safeCheckpointAuditMetadata({
          code: current.code,
          changedFields,
        }),
        context,
      });
      return this.repository.findCheckpoint(tenantId, checkpointId, tx);
    });

    const checkpoint = this.requireCheckpoint(updated);
    const counts = await this.repository.getCheckpointCounts(tenantId, [
      { id: checkpointId, controlId: checkpoint.controlId },
    ]);
    return checkpointDetailDto(checkpoint, counts.get(checkpointId)!);
  }

  private async transitionLifecycle(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    target: GovernanceRecordStatus,
    action:
      | "CHECKPOINT_ACTIVATED"
      | "CHECKPOINT_DEACTIVATED"
      | "CHECKPOINT_ARCHIVED",
    context: AuditContext,
  ) {
    const updated = await this.repository.runInTransaction(async (tx) => {
      // Load control_id first without lock, then lock Control then Checkpoint.
      const existing = await tx.checkpoint.findFirst({
        where: { tenantId, id: checkpointId },
        select: { controlId: true },
      });
      if (!existing) throw checkpointNotFound();

      if (target === "ACTIVE" || target === "ARCHIVED") {
        const lockedControl = await this.repository.lockControl(
          tx,
          tenantId,
          existing.controlId,
        );
        if (!lockedControl[0]) {
          throw relatedInvalid("Parent Control was not found for this Company");
        }
        if (
          target === "ACTIVE" &&
          lockedControl[0].lifecycle_status === "ARCHIVED"
        ) {
          throw parentControlArchived(
            "Cannot activate a Checkpoint under an archived Control",
          );
        }
      }

      const locked = await this.repository.lockCheckpoint(
        tx,
        tenantId,
        checkpointId,
      );
      if (!locked[0]) throw checkpointNotFound();
      const current = locked[0].lifecycle_status;
      try {
        assertSameStateCheckpointLifecycleForbidden(current, target);
        assertGovernanceLifecycleTransition(current, target);
      } catch (error) {
        mapGovernanceError(error);
      }

      await tx.checkpoint.update({
        where: { id: checkpointId },
        data: {
          lifecycleStatus: target,
          archivedAt: target === "ARCHIVED" ? new Date() : null,
          updatedById: actorUserId,
        },
      });
      await this.repository.writeAudit(tx, {
        tenantId,
        actorUserId,
        action,
        entityType: "CHECKPOINT",
        entityId: checkpointId,
        metadata: safeCheckpointAuditMetadata({
          code: locked[0].code,
          fromStatus: current,
          toStatus: target,
          changedFields: ["lifecycleStatus"],
        }),
        context,
      });
      return this.repository.findCheckpoint(tenantId, checkpointId, tx);
    });
    const checkpoint = this.requireCheckpoint(updated);
    const counts = await this.repository.getCheckpointCounts(tenantId, [
      { id: checkpointId, controlId: checkpoint.controlId },
    ]);
    return checkpointDetailDto(checkpoint, counts.get(checkpointId)!);
  }

  activate(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      checkpointId,
      actorUserId,
      "ACTIVE",
      "CHECKPOINT_ACTIVATED",
      context,
    );
  }

  deactivate(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      checkpointId,
      actorUserId,
      "INACTIVE",
      "CHECKPOINT_DEACTIVATED",
      context,
    );
  }

  archive(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    return this.transitionLifecycle(
      tenantId,
      checkpointId,
      actorUserId,
      "ARCHIVED",
      "CHECKPOINT_ARCHIVED",
      context,
    );
  }

  async createReview(
    tenantId: string,
    checkpointId: string,
    actorUserId: string,
    body: CreateCheckpointReviewBody,
    context: AuditContext,
  ) {
    await this.assertActiveMember(tenantId, actorUserId);
    try {
      assertCheckpointTextContent("observation", body.observation);
      assertCheckpointTextContent("recommendation", body.recommendation);
    } catch (error) {
      mapGovernanceError(error);
    }

    try {
      const reviewId = await this.repository.runInTransaction(async (tx) => {
        const existing = await tx.checkpoint.findFirst({
          where: { tenantId, id: checkpointId },
          select: { controlId: true },
        });
        if (!existing) throw checkpointNotFound();

        const lockedControl = await this.repository.lockControl(
          tx,
          tenantId,
          existing.controlId,
        );
        if (!lockedControl[0]) {
          throw relatedInvalid("Parent Control was not found for this Company");
        }
        if (lockedControl[0].lifecycle_status === "ARCHIVED") {
          throw parentControlArchived(
            "Cannot review a Checkpoint under an archived Control",
          );
        }

        const locked = await this.repository.lockCheckpoint(
          tx,
          tenantId,
          checkpointId,
        );
        if (!locked[0]) throw checkpointNotFound();
        if (locked[0].lifecycle_status !== "ACTIVE") {
          throw invalidState(
            "Checkpoint reviews require an ACTIVE Checkpoint",
          );
        }

        try {
          assertCheckpointReview({
            frequency: locked[0].verification_frequency,
            reviewPeriod: body.reviewPeriod,
            outcome: body.outcome,
            observation: body.observation ?? null,
            reviewDate: body.reviewDate,
            nextReviewDate: body.nextReviewDate ?? null,
          });
        } catch (error) {
          mapGovernanceError(error);
        }

        const previousLatestReviewId = locked[0].latest_review_id;
        let created;
        try {
          created = await tx.checkpointReview.create({
            data: {
              tenantId,
              checkpointId,
              reviewPeriod: body.reviewPeriod,
              reviewDate: inputDate(body.reviewDate)!,
              reviewerId: actorUserId,
              outcome: body.outcome,
              observation: body.observation ?? null,
              recommendation: body.recommendation ?? null,
              nextReviewDate: inputDate(body.nextReviewDate),
            },
          });
        } catch (error) {
          if (isReviewPeriodUniqueViolation(error)) {
            throw reviewDuplicate();
          }
          throw error;
        }

        const refreshed = await tx.checkpoint.findFirst({
          where: { tenantId, id: checkpointId },
          select: { latestReviewId: true },
        });
        if (!refreshed?.latestReviewId) {
          throw reviewConflict(
            "Latest review state could not be synchronized",
          );
        }

        await this.repository.writeAudit(tx, {
          tenantId,
          actorUserId,
          action: "CHECKPOINT_REVIEWED",
          entityType: "CHECKPOINT",
          entityId: checkpointId,
          metadata: safeCheckpointAuditMetadata({
            code: locked[0].code,
            reviewId: created.id,
            reviewPeriod: created.reviewPeriod,
            outcome: created.outcome,
            previousLatestReviewId,
            latestReviewId: refreshed.latestReviewId,
          }),
          context,
        });
        return created.id;
      });

      const review = await this.repository.findReview(
        tenantId,
        checkpointId,
        reviewId,
      );
      if (!review) throw checkpointNotFound();
      return checkpointReviewDto(review);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isReviewPeriodUniqueViolation(error)) throw reviewDuplicate();
      throw error;
    }
  }

  async listReviews(
    tenantId: string,
    checkpointId: string,
    query: CheckpointReviewListQuery,
  ) {
    this.requireCheckpoint(
      await this.repository.findCheckpoint(tenantId, checkpointId),
    );
    const result = await this.repository.listReviews(
      tenantId,
      checkpointId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.items.map(checkpointReviewDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async getLatestReview(tenantId: string, checkpointId: string) {
    const checkpoint = this.requireCheckpoint(
      await this.repository.findCheckpoint(tenantId, checkpointId),
    );
    if (!checkpoint.latestReviewId || !checkpoint.latestReview) {
      return null;
    }
    const review = await this.repository.findReview(
      tenantId,
      checkpointId,
      checkpoint.latestReviewId,
    );
    if (!review) return null;
    return checkpointReviewDto(review);
  }

  async traceability(tenantId: string, checkpointId: string) {
    const result = await this.repository.getTraceability(
      tenantId,
      checkpointId,
    );
    if (!result) throw checkpointNotFound();

    const mapPolicy = (mapping: (typeof result.policyMappings)[number]) => ({
      id: mapping.id,
      isActive: mapping.isActive,
      policy: {
        id: mapping.policyVersion.policy.id,
        code: mapping.policyVersion.policy.code,
        title: mapping.policyVersion.policy.title,
      },
      policyVersion: {
        id: mapping.policyVersion.id,
        status: mapping.policyVersion.status,
        label: `${mapping.policyVersion.versionMajor}.${mapping.policyVersion.versionMinor}`,
        sequence: mapping.policyVersion.sequence,
      },
    });
    const mapFramework = (
      mapping: (typeof result.frameworkMappings)[number],
    ) => ({
      id: mapping.id,
      isActive: mapping.isActive,
      framework: {
        id: mapping.framework.id,
        code: mapping.framework.code,
        name: mapping.framework.name,
        version: mapping.framework.version,
      },
    });
    const mapRule = (mapping: (typeof result.ruleMappings)[number]) => ({
      id: mapping.id,
      isActive: mapping.isActive,
      frameworkRule: {
        id: mapping.frameworkRule.id,
        frameworkId: mapping.frameworkRule.frameworkId,
        code: mapping.frameworkRule.code,
        title: mapping.frameworkRule.title,
      },
    });

    return {
      checkpoint: {
        id: result.checkpoint.id,
        code: result.checkpoint.code,
        title: result.checkpoint.title,
        lifecycleStatus: result.checkpoint.lifecycleStatus,
        verificationFrequency: result.checkpoint.verificationFrequency,
      },
      control: controlSummaryDto(result.checkpoint.control),
      latestReview: latestReviewSummaryDto(result.checkpoint.latestReview),
      totalReviewCount: result.counts.totalReviewCount,
      policyVersionMappings: {
        active: result.policyMappings.filter((m) => m.isActive).map(mapPolicy),
        historical: result.policyMappings
          .filter((m) => !m.isActive)
          .map(mapPolicy),
      },
      frameworkMappings: {
        active: result.frameworkMappings
          .filter((m) => m.isActive)
          .map(mapFramework),
        historical: result.frameworkMappings
          .filter((m) => !m.isActive)
          .map(mapFramework),
      },
      frameworkRuleMappings: {
        active: result.ruleMappings.filter((m) => m.isActive).map(mapRule),
        historical: result.ruleMappings
          .filter((m) => !m.isActive)
          .map(mapRule),
      },
    };
  }

  async listAuditEvents(
    tenantId: string,
    checkpointId: string,
    query: CheckpointAuditListQuery,
  ) {
    this.requireCheckpoint(
      await this.repository.findCheckpoint(tenantId, checkpointId),
    );
    const result = await this.repository.listAuditEvents(
      tenantId,
      checkpointId,
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

/** Exported for unit tests of AppError mapping helpers. */
export const mapCheckpointGovernanceErrorForTest = (error: unknown) => {
  try {
    mapGovernanceError(error);
  } catch (mapped) {
    return mapped;
  }
  return null;
};

export type { CheckpointOutcome };
