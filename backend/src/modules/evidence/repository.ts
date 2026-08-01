import {
  Prisma,
  type EvidenceLifecycleStatus,
  type PrismaClient,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../governance/code-generation.js";
import type { EvidenceListQuery } from "./validators.js";

export type AuditContext = { ip?: string; userAgent?: string };

const personSelect = { id: true, code: true, fullName: true } as const;
const departmentSelect = { id: true, code: true, name: true } as const;
const supersedesSelect = {
  id: true,
  code: true,
  lifecycleStatus: true,
} as const;

export const evidenceDetailInclude =
  Prisma.validator<Prisma.EvidenceInclude>()({
    owner: { select: personSelect },
    department: { select: departmentSelect },
    supersedes: { select: supersedesSelect },
    uploadedBy: { select: personSelect },
  });

export type EvidenceRecord = Prisma.EvidenceGetPayload<{
  include: typeof evidenceDetailInclude;
}>;

const writeAudit = (
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: "EVIDENCE";
    entityId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  },
) =>
  transaction.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ...(input.context.ip ? { ipAddress: input.context.ip } : {}),
      ...(input.context.userAgent
        ? { userAgent: input.context.userAgent }
        : {}),
    },
  });

export class EvidenceRepository {
  constructor(private readonly db: PrismaClient) {}

  findTenantUser(tenantId: string, userId: string) {
    return this.db.userCompany.findFirst({
      where: {
        tenantId,
        userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
  }

  findDepartment(tenantId: string, id: string) {
    return this.db.orgDepartment.findFirst({
      where: { tenantId, id, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findEvidence(tenantId: string, evidenceId: string) {
    return this.db.evidence.findFirst({
      where: { tenantId, id: evidenceId },
      include: evidenceDetailInclude,
    });
  }

  findEvidenceForUpdate(tenantId: string, evidenceId: string) {
    return this.db.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        code: string;
        title: string;
        description: string | null;
        lifecycle_status: EvidenceLifecycleStatus;
        owner_id: string | null;
        department_id: string | null;
        issue_date: Date | null;
        expires_at: Date | null;
        supersedes_evidence_id: string | null;
        storage_key: string | null;
        content_sha256: string | null;
        byte_size: number | null;
        mime_type: string | null;
        detected_mime_type: string | null;
        original_file_name: string | null;
        created_by_id: string;
        uploaded_by_id: string | null;
      }>
    >`
      SELECT
        id,
        tenant_id,
        code,
        title,
        description,
        lifecycle_status,
        owner_id,
        department_id,
        issue_date,
        expires_at,
        supersedes_evidence_id,
        storage_key,
        content_sha256,
        byte_size,
        mime_type,
        detected_mime_type,
        original_file_name,
        created_by_id,
        uploaded_by_id
      FROM evidence
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${evidenceId}::uuid
      FOR UPDATE
    `;
  }

  findPriorEvidence(tenantId: string, evidenceId: string) {
    return this.db.evidence.findFirst({
      where: { tenantId, id: evidenceId },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
      },
    });
  }

  async list(tenantId: string, query: EvidenceListQuery) {
    const where: Prisma.EvidenceWhereInput = {
      tenantId,
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.expiresBefore || query.expiresAfter
        ? {
            expiresAt: {
              ...(query.expiresAfter
                ? { gte: new Date(`${query.expiresAfter}T00:00:00.000Z`) }
                : {}),
              ...(query.expiresBefore
                ? { lte: new Date(`${query.expiresBefore}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { title: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.evidence.findMany({
        where,
        include: evidenceDetailInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.evidence.count({ where }),
    ]);
    return { items, total };
  }

  async listAuditEvents(
    tenantId: string,
    evidenceId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      entityType: "EVIDENCE",
      entityId: evidenceId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return { items, total };
  }

  createEvidence(input: {
    tenantId: string;
    actorUserId: string;
    title: string;
    description: string | null;
    ownerId: string | null;
    departmentId: string | null;
    issueDate: Date | null;
    expiresAt: Date | null;
    supersedesEvidenceId: string | null;
    supersedesCode: string | null;
    issueDateIso: string | null;
    expiresAtIso: string | null;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const codes = new GovernanceCodeRepository(transaction);
      const code = await codes.allocateEvidenceCode(input.tenantId);
      const created = await transaction.evidence.create({
        data: {
          tenantId: input.tenantId,
          code,
          title: input.title,
          description: input.description,
          lifecycleStatus: "DRAFT",
          ownerId: input.ownerId,
          departmentId: input.departmentId,
          issueDate: input.issueDate,
          expiresAt: input.expiresAt,
          supersedesEvidenceId: input.supersedesEvidenceId,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
        include: evidenceDetailInclude,
      });
      const baseMetadata: Prisma.InputJsonValue = {
        code,
        lifecycleStatus: "DRAFT",
        ownerId: input.ownerId,
        departmentId: input.departmentId,
        issueDate: input.issueDateIso,
        expiresAt: input.expiresAtIso,
        hasFile: false,
        ...(input.supersedesEvidenceId
          ? {
              supersedesEvidenceId: input.supersedesEvidenceId,
              supersedesCode: input.supersedesCode,
            }
          : {}),
      };
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_CREATED",
        entityType: "EVIDENCE",
        entityId: created.id,
        metadata: baseMetadata,
        context: input.context,
      });
      if (input.supersedesEvidenceId) {
        await writeAudit(transaction, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "EVIDENCE_REPLACEMENT_CREATED",
          entityType: "EVIDENCE",
          entityId: created.id,
          metadata: {
            code,
            lifecycleStatus: "DRAFT",
            supersedesEvidenceId: input.supersedesEvidenceId,
            supersedesCode: input.supersedesCode,
            hasFile: false,
          },
          context: input.context,
        });
      }
      return created;
    });
  }

  updateEvidence(input: {
    tenantId: string;
    evidenceId: string;
    actorUserId: string;
    data: Prisma.EvidenceUncheckedUpdateInput;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const updated = await transaction.evidence.update({
        where: { id: input.evidenceId },
        data: {
          ...input.data,
          updatedById: input.actorUserId,
        },
        include: evidenceDetailInclude,
      });
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_UPDATED",
        entityType: "EVIDENCE",
        entityId: updated.id,
        metadata: input.metadata,
        context: input.context,
      });
      return updated;
    });
  }

  archiveEvidence(input: {
    tenantId: string;
    evidenceId: string;
    actorUserId: string;
    metadata: Prisma.InputJsonValue;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const updated = await transaction.evidence.update({
        where: { id: input.evidenceId },
        data: {
          lifecycleStatus: "ARCHIVED",
          archivedAt: new Date(),
          updatedById: input.actorUserId,
        },
        include: evidenceDetailInclude,
      });
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_ARCHIVED",
        entityType: "EVIDENCE",
        entityId: updated.id,
        metadata: input.metadata,
        context: input.context,
      });
      return updated;
    });
  }

  finalizeFileUpload(input: {
    tenantId: string;
    evidenceId: string;
    actorUserId: string;
    originalFileName: string;
    storageKey: string;
    mimeType: string;
    detectedMimeType: string;
    byteSize: number;
    contentSha256: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
          storage_key: string | null;
        }>
      >`
        SELECT id, code, lifecycle_status, storage_key
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "not_found" as const };
      const row = locked[0]!;
      if (row.lifecycle_status !== "DRAFT") {
        return { kind: "invalid_state" as const, status: row.lifecycle_status };
      }
      if (row.storage_key) {
        return { kind: "already_exists" as const };
      }
      try {
        await transaction.evidence.update({
          where: { id: input.evidenceId },
          data: {
            originalFileName: input.originalFileName,
            storageKey: input.storageKey,
            mimeType: input.mimeType,
            detectedMimeType: input.detectedMimeType,
            byteSize: input.byteSize,
            contentSha256: input.contentSha256,
            uploadedById: input.actorUserId,
            uploadedAt: new Date(),
            updatedById: input.actorUserId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return { kind: "duplicate" as const };
        }
        throw error;
      }
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_FILE_UPLOADED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: row.code,
          byteSize: input.byteSize,
          detectedMimeType: input.detectedMimeType,
          contentSha256: input.contentSha256,
          hasFile: true,
        },
        context: input.context,
      });
      const detail = await transaction.evidence.findFirst({
        where: { tenantId: input.tenantId, id: input.evidenceId },
        include: evidenceDetailInclude,
      });
      return { kind: "ok" as const, evidence: detail! };
    });
  }

  submitWithFile(input: {
    tenantId: string;
    evidenceId: string;
    actorUserId: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
          storage_key: string | null;
          content_sha256: string | null;
          byte_size: number | null;
        }>
      >`
        SELECT id, code, lifecycle_status, storage_key, content_sha256, byte_size
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "not_found" as const };
      const row = locked[0]!;
      if (row.lifecycle_status === "ARCHIVED") {
        return { kind: "archived" as const };
      }
      if (row.lifecycle_status !== "DRAFT") {
        return { kind: "invalid_state" as const };
      }
      if (
        !row.storage_key ||
        !row.content_sha256 ||
        row.byte_size == null ||
        row.byte_size <= 0
      ) {
        return { kind: "file_required" as const };
      }
      await transaction.evidence.update({
        where: { id: input.evidenceId },
        data: {
          lifecycleStatus: "SUBMITTED",
          submittedById: input.actorUserId,
          submittedAt: new Date(),
          updatedById: input.actorUserId,
        },
      });
      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_SUBMITTED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: row.code,
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          hasFile: true,
          contentSha256: row.content_sha256,
          byteSize: row.byte_size,
        },
        context: input.context,
      });
      const detail = await transaction.evidence.findFirst({
        where: { tenantId: input.tenantId, id: input.evidenceId },
        include: evidenceDetailInclude,
      });
      return { kind: "ok" as const, evidence: detail! };
    });
  }

  writeDownloadAudit(input: {
    tenantId: string;
    actorUserId: string;
    evidenceId: string;
    code: string;
    byteSize: number | null;
    detectedMimeType: string | null;
    contentSha256: string | null;
    context: AuditContext;
  }) {
    return this.db.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "EVIDENCE_FILE_DOWNLOADED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: input.code,
          ...(input.byteSize != null ? { byteSize: input.byteSize } : {}),
          ...(input.detectedMimeType
            ? { detectedMimeType: input.detectedMimeType }
            : {}),
          ...(input.contentSha256
            ? { contentSha256: input.contentSha256 }
            : {}),
          hasFile: true,
        },
        ...(input.context.ip ? { ipAddress: input.context.ip } : {}),
        ...(input.context.userAgent
          ? { userAgent: input.context.userAgent }
          : {}),
      },
    });
  }

  writeAudit = writeAudit;
}
