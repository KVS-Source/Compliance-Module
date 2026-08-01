import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { EvidenceLifecycleStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { env } from "../../config/env.js";
import {
  buildEvidenceStorageKey,
  type FileStorageProvider,
} from "../../providers/file-storage/file-storage.js";
import { GovernanceRuleError } from "../governance/domain-error.js";
import {
  assertEvidenceArchiveAllowed,
  assertEvidenceMetadataMutable,
  assertEvidenceSupersedeTargetAllowed,
  hasEvidenceFile,
  safeEvidenceAuditMetadata,
} from "./domain.js";
import {
  buildContentDisposition,
  validateEvidenceUploadFile,
} from "./file-types.js";
import {
  parseEvidenceMultipartUpload,
} from "./multipart.js";
import type {
  ActiveLinkCounts,
  AuditContext,
  EvidenceCheckpointLinkRecord,
  EvidenceControlLinkRecord,
  EvidenceRecord,
  EvidenceRepository,
} from "./repository.js";
import type {
  CreateEvidenceBody,
  EvidenceAuditListQuery,
  EvidenceLinkListQuery,
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
    if (error.code === "CONTROL_INVALID_STATE") {
      throw new AppError(409, "CONTROL_INVALID_STATE", error.message);
    }
    if (error.code === "CHECKPOINT_INVALID_STATE") {
      throw new AppError(409, "CHECKPOINT_INVALID_STATE", error.message);
    }
    throw new AppError(400, error.code, error.message);
  }
  throw error;
};

const evidenceNotFound = () =>
  new AppError(404, "EVIDENCE_NOT_FOUND", "Evidence not found");

const controlNotFound = () =>
  new AppError(404, "CONTROL_NOT_FOUND", "Control not found");

const checkpointNotFound = () =>
  new AppError(404, "CHECKPOINT_NOT_FOUND", "Checkpoint not found");

const evidenceInvalidStateForLink = () =>
  new AppError(
    409,
    "EVIDENCE_INVALID_STATE",
    "Only DRAFT Evidence can change Control or Checkpoint links",
  );

const controlInvalidStateForLink = () =>
  new AppError(
    409,
    "CONTROL_INVALID_STATE",
    "Only ACTIVE Controls can receive Evidence links",
  );

const checkpointInvalidStateForLink = () =>
  new AppError(
    409,
    "CHECKPOINT_INVALID_STATE",
    "Only ACTIVE Checkpoints can receive Evidence links",
  );

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

const fileSummary = (evidence: EvidenceRecord) => {
  const hasFile = hasEvidenceFile({
    storageKey: evidence.storageKey,
    contentSha256: evidence.contentSha256,
    byteSize: evidence.byteSize,
  });
  if (!hasFile) return { hasFile: false, file: null as null };
  return {
    hasFile: true,
    file: {
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      detectedMimeType: evidence.detectedMimeType,
      byteSize: evidence.byteSize,
      contentSha256: evidence.contentSha256,
      uploadedAt: evidence.uploadedAt,
      uploadedBy: personDto(evidence.uploadedBy),
    },
  };
};

export const evidenceDto = (
  evidence: EvidenceRecord,
  counts?: ActiveLinkCounts,
) => ({
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
  ...fileSummary(evidence),
  ...(counts
    ? {
        activeControlLinkCount: counts.activeControlLinkCount,
        activeCheckpointLinkCount: counts.activeCheckpointLinkCount,
      }
    : {}),
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

export const controlLinkDto = (link: EvidenceControlLinkRecord) => ({
  id: link.id,
  isActive: link.isActive,
  control: {
    id: link.control.id,
    code: link.control.code,
    title: link.control.title,
    lifecycleStatus: link.control.lifecycleStatus,
  },
  linkedAt: link.createdAt,
  linkedBy: personDto(link.createdBy),
  updatedAt: link.updatedAt,
  updatedBy: personDto(link.updatedBy),
});

export const checkpointLinkDto = (link: EvidenceCheckpointLinkRecord) => ({
  id: link.id,
  isActive: link.isActive,
  checkpoint: {
    id: link.checkpoint.id,
    code: link.checkpoint.code,
    title: link.checkpoint.title,
    lifecycleStatus: link.checkpoint.lifecycleStatus,
    controlId: link.checkpoint.controlId,
  },
  linkedAt: link.createdAt,
  linkedBy: personDto(link.createdBy),
  updatedAt: link.updatedAt,
  updatedBy: personDto(link.updatedBy),
});

export class EvidenceService {
  constructor(
    private readonly repository: EvidenceRepository,
    private readonly storage: FileStorageProvider,
  ) {}

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

    return this.withDetailCounts(tenantId, created);
  }

  async list(tenantId: string, query: EvidenceListQuery) {
    const result = await this.repository.list(tenantId, query);
    return {
      data: result.items.map((item) => evidenceDto(item)),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  private async withDetailCounts(
    tenantId: string,
    evidence: EvidenceRecord,
  ) {
    const counts = await this.repository.countActiveLinks(
      tenantId,
      evidence.id,
    );
    return evidenceDto(evidence, counts);
  }

  async get(tenantId: string, evidenceId: string) {
    const evidence = await this.repository.findEvidence(tenantId, evidenceId);
    if (!evidence) throw evidenceNotFound();
    return this.withDetailCounts(tenantId, evidence);
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
      return this.withDetailCounts(tenantId, existing);
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
    return this.withDetailCounts(tenantId, updated);
  }

  async submit(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const result = await this.repository.submitWithFile({
      tenantId,
      evidenceId,
      actorUserId,
      context,
    });
    if (result.kind === "not_found") throw evidenceNotFound();
    if (result.kind === "archived") {
      throw new AppError(
        409,
        "EVIDENCE_ARCHIVED",
        "Archived Evidence cannot be submitted",
      );
    }
    if (result.kind === "invalid_state") {
      throw new AppError(
        409,
        "EVIDENCE_INVALID_STATE",
        "Only DRAFT Evidence can be submitted",
      );
    }
    if (result.kind === "file_required") {
      throw new AppError(
        409,
        "EVIDENCE_FILE_REQUIRED",
        "Evidence cannot be submitted until a file has been uploaded",
      );
    }
    return this.withDetailCounts(tenantId, result.evidence);
  }

  async uploadFile(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    req: Request,
    context: AuditContext,
  ) {
    const existing = await this.repository.findEvidence(tenantId, evidenceId);
    if (!existing) throw evidenceNotFound();
    if (existing.lifecycleStatus !== "DRAFT") {
      throw new AppError(
        409,
        "EVIDENCE_INVALID_STATE",
        "Only DRAFT Evidence accepts file upload",
      );
    }
    if (
      hasEvidenceFile({
        storageKey: existing.storageKey,
        contentSha256: existing.contentSha256,
        byteSize: existing.byteSize,
      })
    ) {
      throw new AppError(
        409,
        "EVIDENCE_FILE_ALREADY_EXISTS",
        "Evidence already has an uploaded file",
      );
    }

    let parsed;
    try {
      parsed = await parseEvidenceMultipartUpload(req, {
        storageRoot: this.storage.getRoot(),
        tenantId,
        maxBytes: env.EVIDENCE_MAX_UPLOAD_BYTES,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Invalid multipart upload request",
      );
    }

    let storageKey: string | null = null;
    try {
      if (parsed.byteSize > env.EVIDENCE_MAX_UPLOAD_BYTES) {
        throw new AppError(
          413,
          "EVIDENCE_FILE_TOO_LARGE",
          "Evidence file exceeds the maximum allowed size",
        );
      }
      const validated = await validateEvidenceUploadFile({
        absolutePath: parsed.tempPath,
        clientFilename: parsed.clientFilename,
        declaredMime: parsed.declaredMime,
        byteSize: parsed.byteSize,
      });
      storageKey = buildEvidenceStorageKey({
        tenantId,
        evidenceId,
        objectId: randomUUID(),
      });
      await this.storage.promoteTempFile(
        parsed.tempPath,
        storageKey,
        validated.declaredMime,
      );
      // temp file moved; clear so catch doesn't double-delete wrong path
      parsed.tempPath = "";

      const finalized = await this.repository.finalizeFileUpload({
        tenantId,
        evidenceId,
        actorUserId,
        originalFileName: validated.originalFileName,
        storageKey,
        mimeType: validated.declaredMime,
        detectedMimeType: validated.detectedMimeType,
        byteSize: parsed.byteSize,
        contentSha256: parsed.contentSha256,
        context,
      });

      if (finalized.kind === "not_found") {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw evidenceNotFound();
      }
      if (finalized.kind === "invalid_state") {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw new AppError(
          409,
          "EVIDENCE_INVALID_STATE",
          "Only DRAFT Evidence accepts file upload",
        );
      }
      if (finalized.kind === "already_exists") {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw new AppError(
          409,
          "EVIDENCE_FILE_ALREADY_EXISTS",
          "Evidence already has an uploaded file",
        );
      }
      if (finalized.kind === "duplicate") {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw new AppError(
          409,
          "EVIDENCE_FILE_DUPLICATE",
          "An identical evidence file already exists for this Company",
        );
      }
      return this.withDetailCounts(tenantId, finalized.evidence);
    } catch (error) {
      if (parsed.tempPath) {
        await unlink(parsed.tempPath).catch(() => undefined);
      }
      if (storageKey) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        500,
        "EVIDENCE_STORAGE_FAILED",
        "Evidence file could not be stored",
      );
    }
  }

  async downloadFile(
    tenantId: string,
    evidenceId: string,
    actorUserId: string,
    res: Response,
    context: AuditContext,
  ) {
    const evidence = await this.repository.findEvidence(tenantId, evidenceId);
    if (!evidence) throw evidenceNotFound();
    if (
      !hasEvidenceFile({
        storageKey: evidence.storageKey,
        contentSha256: evidence.contentSha256,
        byteSize: evidence.byteSize,
      }) ||
      !evidence.storageKey
    ) {
      throw new AppError(
        404,
        "EVIDENCE_FILE_UNAVAILABLE",
        "Evidence file is not available",
      );
    }

    let stream;
    try {
      stream = await this.storage.getStream(evidence.storageKey);
    } catch {
      throw new AppError(
        404,
        "EVIDENCE_FILE_UNAVAILABLE",
        "Evidence file is not available",
      );
    }

    const contentType = evidence.detectedMimeType || evidence.mimeType || "application/octet-stream";
    const filename =
      evidence.originalFileName || "evidence-file.bin";
    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", buildContentDisposition(filename));
    if (evidence.byteSize != null) {
      res.setHeader("Content-Length", String(evidence.byteSize));
    }

    let completed = false;
    res.on("finish", () => {
      if (completed) return;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        completed = true;
        void this.repository
          .writeDownloadAudit({
            tenantId,
            actorUserId,
            evidenceId,
            code: evidence.code,
            byteSize: evidence.byteSize,
            detectedMimeType: evidence.detectedMimeType,
            contentSha256: evidence.contentSha256,
            context,
          })
          .catch(() => undefined);
      }
    });

    try {
      await pipeline(stream, res);
    } catch {
      if (!res.headersSent) {
        throw new AppError(
          500,
          "EVIDENCE_STORAGE_FAILED",
          "Evidence file could not be downloaded",
        );
      }
    }
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
    return this.withDetailCounts(tenantId, updated);
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

  async listControlLinks(
    tenantId: string,
    evidenceId: string,
    query: EvidenceLinkListQuery,
  ) {
    const existing = await this.repository.findEvidence(tenantId, evidenceId);
    if (!existing) throw evidenceNotFound();
    const result = await this.repository.listControlLinks(
      tenantId,
      evidenceId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.items.map(controlLinkDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async listCheckpointLinks(
    tenantId: string,
    evidenceId: string,
    query: EvidenceLinkListQuery,
  ) {
    const existing = await this.repository.findEvidence(tenantId, evidenceId);
    if (!existing) throw evidenceNotFound();
    const result = await this.repository.listCheckpointLinks(
      tenantId,
      evidenceId,
      query.page,
      query.pageSize,
    );
    return {
      data: result.items.map(checkpointLinkDto),
      meta: pageMeta(query.page, query.pageSize, result.total),
    };
  }

  async linkControl(
    tenantId: string,
    evidenceId: string,
    controlId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const member = await this.repository.findTenantUser(tenantId, actorUserId);
    if (!member) {
      throw new AppError(403, "FORBIDDEN", "Active Company membership required");
    }
    const result = await this.repository.linkControl({
      tenantId,
      evidenceId,
      controlId,
      actorUserId,
      context,
    });
    if (result.kind === "evidence_not_found") throw evidenceNotFound();
    if (result.kind === "evidence_invalid_state") {
      throw evidenceInvalidStateForLink();
    }
    if (result.kind === "control_not_found") throw controlNotFound();
    if (result.kind === "control_invalid_state") {
      throw controlInvalidStateForLink();
    }
    if (result.kind === "exists") {
      throw new AppError(
        409,
        "EVIDENCE_CONTROL_LINK_EXISTS",
        "Evidence is already linked to this Control",
      );
    }
    return {
      created: result.kind === "created",
      data: controlLinkDto(result.link),
    };
  }

  async unlinkControl(
    tenantId: string,
    evidenceId: string,
    controlId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const member = await this.repository.findTenantUser(tenantId, actorUserId);
    if (!member) {
      throw new AppError(403, "FORBIDDEN", "Active Company membership required");
    }
    const result = await this.repository.unlinkControl({
      tenantId,
      evidenceId,
      controlId,
      actorUserId,
      context,
    });
    if (result.kind === "evidence_not_found") throw evidenceNotFound();
    if (result.kind === "evidence_invalid_state") {
      throw evidenceInvalidStateForLink();
    }
    if (result.kind === "control_not_found") throw controlNotFound();
    if (result.kind === "link_not_found") {
      throw new AppError(
        404,
        "EVIDENCE_CONTROL_LINK_NOT_FOUND",
        "Active Evidence Control link not found",
      );
    }
    return controlLinkDto(result.link);
  }

  async linkCheckpoint(
    tenantId: string,
    evidenceId: string,
    checkpointId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const member = await this.repository.findTenantUser(tenantId, actorUserId);
    if (!member) {
      throw new AppError(403, "FORBIDDEN", "Active Company membership required");
    }
    const result = await this.repository.linkCheckpoint({
      tenantId,
      evidenceId,
      checkpointId,
      actorUserId,
      context,
    });
    if (result.kind === "evidence_not_found") throw evidenceNotFound();
    if (result.kind === "evidence_invalid_state") {
      throw evidenceInvalidStateForLink();
    }
    if (result.kind === "checkpoint_not_found") throw checkpointNotFound();
    if (result.kind === "checkpoint_invalid_state") {
      throw checkpointInvalidStateForLink();
    }
    if (result.kind === "exists") {
      throw new AppError(
        409,
        "EVIDENCE_CHECKPOINT_LINK_EXISTS",
        "Evidence is already linked to this Checkpoint",
      );
    }
    return {
      created: result.kind === "created",
      data: checkpointLinkDto(result.link),
    };
  }

  async unlinkCheckpoint(
    tenantId: string,
    evidenceId: string,
    checkpointId: string,
    actorUserId: string,
    context: AuditContext,
  ) {
    const member = await this.repository.findTenantUser(tenantId, actorUserId);
    if (!member) {
      throw new AppError(403, "FORBIDDEN", "Active Company membership required");
    }
    const result = await this.repository.unlinkCheckpoint({
      tenantId,
      evidenceId,
      checkpointId,
      actorUserId,
      context,
    });
    if (result.kind === "evidence_not_found") throw evidenceNotFound();
    if (result.kind === "evidence_invalid_state") {
      throw evidenceInvalidStateForLink();
    }
    if (result.kind === "checkpoint_not_found") throw checkpointNotFound();
    if (result.kind === "link_not_found") {
      throw new AppError(
        404,
        "EVIDENCE_CHECKPOINT_LINK_NOT_FOUND",
        "Active Evidence Checkpoint link not found",
      );
    }
    return checkpointLinkDto(result.link);
  }
}
