import type { EvidenceLifecycleStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { GovernanceRuleError } from "../governance/domain-error.js";
import {
  assertEvidenceArchiveAllowed,
  assertEvidenceMetadataMutable,
  assertEvidenceSubmitAllowed,
  assertEvidenceSupersedeTargetAllowed,
  hasEvidenceFile,
  safeEvidenceAuditMetadata,
} from "./domain.js";
import type {
  AuditContext,
  EvidenceRecord,
  EvidenceRepository,
} from "./repository.js";
import type {
  CreateEvidenceBody,
  EvidenceAuditListQuery,
  EvidenceListQuery,
  UpdateEvidenceBody,
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

const supersedesDto = (
  prior:
    | { id: string; code: string; lifecycleStatus: EvidenceLifecycleStatus }
    | null
    | undefined,
) =>
  prior
    ? {
        id: prior.id,
        code: prior.code,
        lifecycleStatus: prior.lifecycleStatus,
      }
    : null;

const mapGovernanceError = (error: unknown): never => {
  if (error instanceof GovernanceRuleError) {
    if (error.code === "EVIDENCE_FILE_REQUIRED") {
      throw new AppError(409, "EVIDENCE_FILE_REQUIRED", error.message);
    }
    if (error.code === "EVIDENCE_ARCHIVED") {
      throw new AppError(409, "EVIDENCE_ARCHIVED", error.message);
    }
    if (error.code === "EVIDENCE_SELF_REVIEW_FORBIDDEN") {
      throw new AppError(403, "EVIDENCE_SELF_REVIEW_FORBIDDEN", error.message);
    }
    if (error.code === "EVIDENCE_SUPERSEDE_INVALID") {
      throw new AppError(409, "EVIDENCE_SUPERSEDE_INVALID", error.message);
    }
    if (error.code === "EVIDENCE_INVALID_STATE") {
      throw new AppError(409, "EVIDENCE_INVALID_STATE", error.message);
    }
    throw new AppError(400, error.code, error.message);
  }
  throw error;
};

const evidenceNotFound = () =>
  new AppError(404, "EVIDENCE_NOT_FOUND", "Evidence not found");

const ownerInvalid = () =>
  new AppError(
    400,
    "EVIDENCE_OWNER_INVALID",
    "Owner is not an active Company member",
  );

const departmentInvalid = () =>
  new AppError(
    400,
    "EVIDENCE_DEPARTMENT_INVALID",
    "Department was not found for this Company",
  );

const supersedeInvalid = () =>
  new AppError(
    409,
    "EVIDENCE_SUPERSEDE_INVALID",
    "Replacement target is invalid for this Company",
  );

export const evidenceDto = (evidence: EvidenceRecord) => ({
  id: evidence.id,
  code: evidence.code,
  title: evidence.title,
  description: evidence.description,
  lifecycleStatus: evidence.lifecycleStatus,
  owner: personDto(evidence.owner),
  department: departmentDto(evidence.department),
  issueDate: dateOnly(evidence.issueDate),
  expiresAt: dateOnly(evidence.expiresAt),
  supersedesEvidenceId: evidence.supersedesEvidenceId,
  supersedes: supersedesDto(evidence.supersedes),
  hasFile: hasEvidenceFile({
    storageKey: evidence.storageKey,
    contentSha256: evidence.contentSha256,
    byteSize: evidence.byteSize,
  }),
  submittedById: evidence.submittedById,
  submittedAt: evidence.submittedAt,
  reviewedById: evidence.reviewedById,
  reviewedAt: evidence.reviewedAt,
  archivedAt: evidence.archivedAt,
  createdById: evidence.createdById,
  updatedById: evidence.updatedById,
  createdAt: evidence.createdAt,
  updatedAt: evidence.updatedAt,
});

export class EvidenceService {
  constructor(private readonly repository: EvidenceRepository) {}

  private async assertActiveMember(tenantId: string, userId: string | null) {
    if (!userId) return;
    const member = await this.repository.findTenantUser(tenantId, userId);
    if (!member) throw ownerInvalid();
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
    if (!department) throw departmentInvalid();
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: CreateEvidenceBody,
    context: AuditContext,
  ) {
    const ownerId = body.ownerId ?? null;
    const departmentId = body.departmentId ?? null;
    const supersedesEvidenceId = body.supersedesEvidenceId ?? null;

    await this.assertActiveMember(tenantId, ownerId);
    await this.assertDepartment(tenantId, departmentId);

    let supersedesCode: string | null = null;
    if (supersedesEvidenceId) {
      const prior = await this.repository.findPriorEvidence(
        tenantId,
        supersedesEvidenceId,
      );
      if (!prior) throw supersedeInvalid();
      try {
        assertEvidenceSupersedeTargetAllowed(prior.lifecycleStatus);
      } catch (error) {
        mapGovernanceError(error);
      }
      supersedesCode = prior.code;
    }

    const issueDate = inputDate(body.issueDate ?? null);
    const expiresAt = inputDate(body.expiresAt ?? null);

    const created = await this.repository.createEvidence({
      tenantId,
      actorUserId,
      title: body.title,
      description: body.description ?? null,
      ownerId,
      departmentId,
      issueDate,
      expiresAt,
      supersedesEvidenceId,
      supersedesCode,
      issueDateIso: dateOnly(issueDate),
      expiresAtIso: dateOnly(expiresAt),
      context,
    });

    return evidenceDto(created);
  }

  async list(tenantId: string, query: EvidenceListQuery) {
    const result = await this.repository.list(tenantId, query);
    return {
      data: result.items.map(evidenceDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async get(tenantId: string, evidenceId: string) {
    const evidence = await this.repository.findEvidence(tenantId, evidenceId);
    if (!evidence) throw evidenceNotFound();
    return evidenceDto(evidence);
  }

  async update(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    body: UpdateEvidenceBody,
    context: AuditContext,
  ) {
    const locked = await this.repository.findEvidenceForUpdate(
      tenantId,
      evidenceId,
    );
    if (locked.length === 0) throw evidenceNotFound();
    const current = locked[0]!;

    try {
      assertEvidenceMetadataMutable(current.lifecycle_status);
    } catch (error) {
      mapGovernanceError(error);
    }

    if (body.ownerId !== undefined) {
      await this.assertActiveMember(tenantId, body.ownerId);
    }
    if (body.departmentId !== undefined) {
      await this.assertDepartment(tenantId, body.departmentId);
    }

    const nextIssueDate =
      body.issueDate !== undefined
        ? inputDate(body.issueDate)
        : current.issue_date;
    const nextExpiresAt =
      body.expiresAt !== undefined
        ? inputDate(body.expiresAt)
        : current.expires_at;
    if (
      nextIssueDate &&
      nextExpiresAt &&
      dateOnly(nextExpiresAt)! < dateOnly(nextIssueDate)!
    ) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "expiresAt must not be before issueDate",
      );
    }

    const changedFields: string[] = [];
    const data: {
      title?: string;
      description?: string | null;
      ownerId?: string | null;
      departmentId?: string | null;
      issueDate?: Date | null;
      expiresAt?: Date | null;
    } = {};

    if (body.title !== undefined && body.title !== current.title) {
      changedFields.push("title");
      data.title = body.title;
    }
    if (
      body.description !== undefined &&
      body.description !== current.description
    ) {
      changedFields.push("description");
      data.description = body.description;
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
    if (body.issueDate !== undefined) {
      const next = dateOnly(nextIssueDate);
      const prev = dateOnly(current.issue_date);
      if (next !== prev) {
        changedFields.push("issueDate");
        data.issueDate = nextIssueDate;
      }
    }
    if (body.expiresAt !== undefined) {
      const next = dateOnly(nextExpiresAt);
      const prev = dateOnly(current.expires_at);
      if (next !== prev) {
        changedFields.push("expiresAt");
        data.expiresAt = nextExpiresAt;
      }
    }

    if (changedFields.length === 0) {
      const existing = await this.repository.findEvidence(
        tenantId,
        evidenceId,
      );
      if (!existing) throw evidenceNotFound();
      return evidenceDto(existing);
    }

    const updated = await this.repository.updateEvidence({
      tenantId,
      evidenceId,
      actorUserId,
      data,
      metadata: safeEvidenceAuditMetadata({
        code: current.code,
        lifecycleStatus: current.lifecycle_status,
        changedFields,
        hasFile: hasEvidenceFile({
          storageKey: current.storage_key,
          contentSha256: current.content_sha256,
          byteSize: current.byte_size,
        }),
      }),
      context,
    });
    return evidenceDto(updated);
  }

  async submit(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    void actorUserId;
    void context;
    const locked = await this.repository.findEvidenceForUpdate(
      tenantId,
      evidenceId,
    );
    if (locked.length === 0) throw evidenceNotFound();
    const current = locked[0]!;
    try {
      assertEvidenceSubmitAllowed({
        lifecycleStatus: current.lifecycle_status,
        file: {
          storageKey: current.storage_key,
          contentSha256: current.content_sha256,
          byteSize: current.byte_size,
        },
      });
    } catch (error) {
      mapGovernanceError(error);
    }
    // Successful submit is not reachable in Slice 5.1 without a file.
    throw new AppError(
      409,
      "EVIDENCE_FILE_REQUIRED",
      "Evidence cannot be submitted until a file has been uploaded",
    );
  }

  async archive(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const locked = await this.repository.findEvidenceForUpdate(
      tenantId,
      evidenceId,
    );
    if (locked.length === 0) throw evidenceNotFound();
    const current = locked[0]!;
    try {
      assertEvidenceArchiveAllowed(current.lifecycle_status);
    } catch (error) {
      mapGovernanceError(error);
    }

    const updated = await this.repository.archiveEvidence({
      tenantId,
      evidenceId,
      actorUserId,
      metadata: safeEvidenceAuditMetadata({
        code: current.code,
        fromStatus: current.lifecycle_status,
        toStatus: "ARCHIVED",
        lifecycleStatus: "ARCHIVED",
        hasFile: hasEvidenceFile({
          storageKey: current.storage_key,
          contentSha256: current.content_sha256,
          byteSize: current.byte_size,
        }),
      }),
      context,
    });
    return evidenceDto(updated);
  }

  async listAuditEvents(
    tenantId: string,
    evidenceId: string,
    query: EvidenceAuditListQuery,
  ) {
    const existing = await this.repository.findEvidence(tenantId, evidenceId);
    if (!existing) throw evidenceNotFound();
    const result = await this.repository.listAuditEvents(
      tenantId,
      evidenceId,
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
