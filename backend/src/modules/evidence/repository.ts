import {
  Prisma,
  type EvidenceDecisionOutcome,
  type EvidenceLifecycleStatus,
  type PrismaClient,
} from "@prisma/client";
import { GovernanceCodeRepository } from "../governance/code-generation.js";
import type {
  EvidenceListQuery,
  EvidenceReviewQueueQuery,
} from "./validators.js";

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
    submittedBy: { select: personSelect },
    reviewedBy: { select: personSelect },
    createdBy: { select: personSelect },
  });

export type EvidenceRecord = Prisma.EvidenceGetPayload<{
  include: typeof evidenceDetailInclude;
}>;

const reviewDecisionInclude =
  Prisma.validator<Prisma.EvidenceReviewDecisionInclude>()({
    actedBy: { select: personSelect },
  });

export type EvidenceReviewDecisionRecord =
  Prisma.EvidenceReviewDecisionGetPayload<{
    include: typeof reviewDecisionInclude;
  }>;

const controlLinkInclude = Prisma.validator<Prisma.EvidenceControlLinkInclude>()(
  {
    control: {
      select: {
        id: true,
        code: true,
        title: true,
        lifecycleStatus: true,
      },
    },
    createdBy: { select: personSelect },
    updatedBy: { select: personSelect },
  },
);

const checkpointLinkInclude =
  Prisma.validator<Prisma.EvidenceCheckpointLinkInclude>()({
    checkpoint: {
      select: {
        id: true,
        code: true,
        title: true,
        lifecycleStatus: true,
        controlId: true,
      },
    },
    createdBy: { select: personSelect },
    updatedBy: { select: personSelect },
  });

export type EvidenceControlLinkRecord = Prisma.EvidenceControlLinkGetPayload<{
  include: typeof controlLinkInclude;
}>;

export type EvidenceCheckpointLinkRecord =
  Prisma.EvidenceCheckpointLinkGetPayload<{
    include: typeof checkpointLinkInclude;
  }>;

export type ActiveLinkCounts = {
  activeControlLinkCount: number;
  activeCheckpointLinkCount: number;
};

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

  async countActiveLinks(
    tenantId: string,
    evidenceId: string,
  ): Promise<ActiveLinkCounts> {
    const [activeControlLinkCount, activeCheckpointLinkCount] =
      await this.db.$transaction([
        this.db.evidenceControlLink.count({
          where: { tenantId, evidenceId, isActive: true },
        }),
        this.db.evidenceCheckpointLink.count({
          where: { tenantId, evidenceId, isActive: true },
        }),
      ]);
    return { activeControlLinkCount, activeCheckpointLinkCount };
  }

  async countActiveLinksForMany(
    tenantId: string,
    evidenceIds: readonly string[],
  ): Promise<Map<string, ActiveLinkCounts>> {
    const map = new Map<string, ActiveLinkCounts>();
    for (const id of evidenceIds) {
      map.set(id, {
        activeControlLinkCount: 0,
        activeCheckpointLinkCount: 0,
      });
    }
    if (evidenceIds.length === 0) return map;

    const [controlRows, checkpointRows] = await this.db.$transaction([
      this.db.evidenceControlLink.findMany({
        where: {
          tenantId,
          evidenceId: { in: [...evidenceIds] },
          isActive: true,
        },
        select: { evidenceId: true },
      }),
      this.db.evidenceCheckpointLink.findMany({
        where: {
          tenantId,
          evidenceId: { in: [...evidenceIds] },
          isActive: true,
        },
        select: { evidenceId: true },
      }),
    ]);

    for (const row of controlRows) {
      const current = map.get(row.evidenceId)!;
      current.activeControlLinkCount += 1;
    }
    for (const row of checkpointRows) {
      const current = map.get(row.evidenceId)!;
      current.activeCheckpointLinkCount += 1;
    }
    return map;
  }

  findControlTarget(tenantId: string, controlId: string) {
    return this.db.control.findFirst({
      where: { tenantId, id: controlId },
      select: {
        id: true,
        code: true,
        title: true,
        lifecycleStatus: true,
      },
    });
  }

  findCheckpointTarget(tenantId: string, checkpointId: string) {
    return this.db.checkpoint.findFirst({
      where: { tenantId, id: checkpointId },
      select: {
        id: true,
        code: true,
        title: true,
        lifecycleStatus: true,
        controlId: true,
      },
    });
  }

  async listControlLinks(
    tenantId: string,
    evidenceId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.EvidenceControlLinkWhereInput = {
      tenantId,
      evidenceId,
      isActive: true,
    };
    const [items, total] = await this.db.$transaction([
      this.db.evidenceControlLink.findMany({
        where,
        include: controlLinkInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.evidenceControlLink.count({ where }),
    ]);
    return { items, total };
  }

  async listCheckpointLinks(
    tenantId: string,
    evidenceId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.EvidenceCheckpointLinkWhereInput = {
      tenantId,
      evidenceId,
      isActive: true,
    };
    const [items, total] = await this.db.$transaction([
      this.db.evidenceCheckpointLink.findMany({
        where,
        include: checkpointLinkInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.evidenceCheckpointLink.count({ where }),
    ]);
    return { items, total };
  }

  linkControl(input: {
    tenantId: string;
    evidenceId: string;
    controlId: string;
    actorUserId: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
        }>
      >`
        SELECT id, code, lifecycle_status
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "evidence_not_found" as const };
      const evidence = locked[0]!;
      if (evidence.lifecycle_status !== "DRAFT") {
        return {
          kind: "evidence_invalid_state" as const,
          status: evidence.lifecycle_status,
        };
      }

      const control = await transaction.control.findFirst({
        where: { tenantId: input.tenantId, id: input.controlId },
        select: {
          id: true,
          code: true,
          title: true,
          lifecycleStatus: true,
        },
      });
      if (!control) return { kind: "control_not_found" as const };
      if (control.lifecycleStatus !== "ACTIVE") {
        return {
          kind: "control_invalid_state" as const,
          status: control.lifecycleStatus,
        };
      }

      const existing = await transaction.evidenceControlLink.findFirst({
        where: {
          tenantId: input.tenantId,
          evidenceId: input.evidenceId,
          controlId: input.controlId,
        },
      });

      if (existing?.isActive) {
        return { kind: "exists" as const };
      }

      let link: EvidenceControlLinkRecord;
      let reactivated = false;
      if (existing) {
        link = await transaction.evidenceControlLink.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            updatedById: input.actorUserId,
          },
          include: controlLinkInclude,
        });
        reactivated = true;
      } else {
        try {
          link = await transaction.evidenceControlLink.create({
            data: {
              tenantId: input.tenantId,
              evidenceId: input.evidenceId,
              controlId: input.controlId,
              isActive: true,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
            },
            include: controlLinkInclude,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return { kind: "exists" as const };
          }
          throw error;
        }
      }

      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_CONTROL_LINKED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: evidence.code,
          linkId: link.id,
          controlId: control.id,
          controlCode: control.code,
          isActive: true,
          ...(reactivated ? { reactivated: true } : {}),
        },
        context: input.context,
      });

      return {
        kind: reactivated ? ("reactivated" as const) : ("created" as const),
        link,
      };
    });
  }

  unlinkControl(input: {
    tenantId: string;
    evidenceId: string;
    controlId: string;
    actorUserId: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
        }>
      >`
        SELECT id, code, lifecycle_status
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "evidence_not_found" as const };
      const evidence = locked[0]!;
      if (evidence.lifecycle_status !== "DRAFT") {
        return {
          kind: "evidence_invalid_state" as const,
          status: evidence.lifecycle_status,
        };
      }

      const control = await transaction.control.findFirst({
        where: { tenantId: input.tenantId, id: input.controlId },
        select: {
          id: true,
          code: true,
          title: true,
          lifecycleStatus: true,
        },
      });
      if (!control) return { kind: "control_not_found" as const };

      const existing = await transaction.evidenceControlLink.findFirst({
        where: {
          tenantId: input.tenantId,
          evidenceId: input.evidenceId,
          controlId: input.controlId,
          isActive: true,
        },
      });
      if (!existing) return { kind: "link_not_found" as const };

      const link = await transaction.evidenceControlLink.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          updatedById: input.actorUserId,
        },
        include: controlLinkInclude,
      });

      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_CONTROL_UNLINKED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: evidence.code,
          linkId: link.id,
          controlId: control.id,
          controlCode: control.code,
          isActive: false,
        },
        context: input.context,
      });

      return { kind: "ok" as const, link };
    });
  }

  linkCheckpoint(input: {
    tenantId: string;
    evidenceId: string;
    checkpointId: string;
    actorUserId: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
        }>
      >`
        SELECT id, code, lifecycle_status
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "evidence_not_found" as const };
      const evidence = locked[0]!;
      if (evidence.lifecycle_status !== "DRAFT") {
        return {
          kind: "evidence_invalid_state" as const,
          status: evidence.lifecycle_status,
        };
      }

      const checkpoint = await transaction.checkpoint.findFirst({
        where: { tenantId: input.tenantId, id: input.checkpointId },
        select: {
          id: true,
          code: true,
          title: true,
          lifecycleStatus: true,
          controlId: true,
        },
      });
      if (!checkpoint) return { kind: "checkpoint_not_found" as const };
      if (checkpoint.lifecycleStatus !== "ACTIVE") {
        return {
          kind: "checkpoint_invalid_state" as const,
          status: checkpoint.lifecycleStatus,
        };
      }

      const existing = await transaction.evidenceCheckpointLink.findFirst({
        where: {
          tenantId: input.tenantId,
          evidenceId: input.evidenceId,
          checkpointId: input.checkpointId,
        },
      });

      if (existing?.isActive) {
        return { kind: "exists" as const };
      }

      let link: EvidenceCheckpointLinkRecord;
      let reactivated = false;
      if (existing) {
        link = await transaction.evidenceCheckpointLink.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            updatedById: input.actorUserId,
          },
          include: checkpointLinkInclude,
        });
        reactivated = true;
      } else {
        try {
          link = await transaction.evidenceCheckpointLink.create({
            data: {
              tenantId: input.tenantId,
              evidenceId: input.evidenceId,
              checkpointId: input.checkpointId,
              isActive: true,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
            },
            include: checkpointLinkInclude,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return { kind: "exists" as const };
          }
          throw error;
        }
      }

      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_CHECKPOINT_LINKED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: evidence.code,
          linkId: link.id,
          checkpointId: checkpoint.id,
          checkpointCode: checkpoint.code,
          isActive: true,
          ...(reactivated ? { reactivated: true } : {}),
        },
        context: input.context,
      });

      return {
        kind: reactivated ? ("reactivated" as const) : ("created" as const),
        link,
      };
    });
  }

  unlinkCheckpoint(input: {
    tenantId: string;
    evidenceId: string;
    checkpointId: string;
    actorUserId: string;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
        }>
      >`
        SELECT id, code, lifecycle_status
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "evidence_not_found" as const };
      const evidence = locked[0]!;
      if (evidence.lifecycle_status !== "DRAFT") {
        return {
          kind: "evidence_invalid_state" as const,
          status: evidence.lifecycle_status,
        };
      }

      const checkpoint = await transaction.checkpoint.findFirst({
        where: { tenantId: input.tenantId, id: input.checkpointId },
        select: {
          id: true,
          code: true,
          title: true,
          lifecycleStatus: true,
          controlId: true,
        },
      });
      if (!checkpoint) return { kind: "checkpoint_not_found" as const };

      const existing = await transaction.evidenceCheckpointLink.findFirst({
        where: {
          tenantId: input.tenantId,
          evidenceId: input.evidenceId,
          checkpointId: input.checkpointId,
          isActive: true,
        },
      });
      if (!existing) return { kind: "link_not_found" as const };

      const link = await transaction.evidenceCheckpointLink.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          updatedById: input.actorUserId,
        },
        include: checkpointLinkInclude,
      });

      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "EVIDENCE_CHECKPOINT_UNLINKED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: evidence.code,
          linkId: link.id,
          checkpointId: checkpoint.id,
          checkpointCode: checkpoint.code,
          isActive: false,
        },
        context: input.context,
      });

      return { kind: "ok" as const, link };
    });
  }

  async listReviewQueue(tenantId: string, query: EvidenceReviewQueueQuery) {
    const where: Prisma.EvidenceWhereInput = {
      tenantId,
      lifecycleStatus: "SUBMITTED",
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
        orderBy: [
          { submittedAt: "asc" },
          { id: "asc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.evidence.count({ where }),
    ]);
    return { items, total };
  }

  async listReviewDecisions(
    tenantId: string,
    evidenceId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.EvidenceReviewDecisionWhereInput = {
      tenantId,
      evidenceId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.evidenceReviewDecision.findMany({
        where,
        include: reviewDecisionInclude,
        orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.evidenceReviewDecision.count({ where }),
    ]);
    return { items, total };
  }

  findLatestReviewDecision(tenantId: string, evidenceId: string) {
    return this.db.evidenceReviewDecision.findFirst({
      where: { tenantId, evidenceId },
      include: reviewDecisionInclude,
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    });
  }

  decideEvidence(input: {
    tenantId: string;
    evidenceId: string;
    actorUserId: string;
    decision: EvidenceDecisionOutcome;
    reason: string | null;
    context: AuditContext;
  }) {
    return this.db.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          code: string;
          lifecycle_status: EvidenceLifecycleStatus;
          created_by_id: string;
          uploaded_by_id: string | null;
          submitted_by_id: string | null;
          storage_key: string | null;
          content_sha256: string | null;
          byte_size: number | null;
        }>
      >`
        SELECT
          id,
          code,
          lifecycle_status,
          created_by_id,
          uploaded_by_id,
          submitted_by_id,
          storage_key,
          content_sha256,
          byte_size
        FROM evidence
        WHERE tenant_id = ${input.tenantId}::uuid
          AND id = ${input.evidenceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "not_found" as const };
      const row = locked[0]!;

      if (row.lifecycle_status !== "SUBMITTED") {
        return {
          kind: "invalid_state" as const,
          status: row.lifecycle_status,
        };
      }

      if (input.actorUserId === row.created_by_id) {
        return { kind: "self_review" as const, role: "creator" as const };
      }
      if (
        row.uploaded_by_id != null &&
        row.uploaded_by_id.length > 0 &&
        input.actorUserId === row.uploaded_by_id
      ) {
        return { kind: "self_review" as const, role: "uploader" as const };
      }
      if (
        row.submitted_by_id != null &&
        row.submitted_by_id.length > 0 &&
        input.actorUserId === row.submitted_by_id
      ) {
        return { kind: "self_review" as const, role: "submitter" as const };
      }

      if (input.decision === "REJECTED") {
        const reason = input.reason?.trim() ?? "";
        if (reason.length < 2 || reason.length > 2000) {
          return { kind: "reason_required" as const };
        }
      }

      if (input.decision === "APPROVED") {
        if (
          !row.storage_key ||
          !row.content_sha256 ||
          row.byte_size == null ||
          row.byte_size <= 0
        ) {
          return { kind: "file_required" as const };
        }
      }

      const toStatus =
        input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
      const decidedAt = new Date();
      const storedReason =
        input.reason != null && input.reason.trim().length > 0
          ? input.reason.trim()
          : null;

      const decisionRow = await transaction.evidenceReviewDecision.create({
        data: {
          tenantId: input.tenantId,
          evidenceId: input.evidenceId,
          actedById: input.actorUserId,
          decision: input.decision,
          reason: storedReason,
          decidedAt,
        },
        include: reviewDecisionInclude,
      });

      await transaction.evidence.update({
        where: { id: input.evidenceId },
        data: {
          lifecycleStatus: toStatus,
          reviewedById: input.actorUserId,
          reviewedAt: decidedAt,
          updatedById: input.actorUserId,
        },
      });

      await writeAudit(transaction, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action:
          input.decision === "APPROVED"
            ? "EVIDENCE_APPROVED"
            : "EVIDENCE_REJECTED",
        entityType: "EVIDENCE",
        entityId: input.evidenceId,
        metadata: {
          code: row.code,
          reviewDecisionId: decisionRow.id,
          decision: input.decision,
          fromStatus: "SUBMITTED",
          toStatus,
          hasFile: true,
          hasComment: storedReason != null,
        },
        context: input.context,
      });

      const detail = await transaction.evidence.findFirst({
        where: { tenantId: input.tenantId, id: input.evidenceId },
        include: evidenceDetailInclude,
      });

      return {
        kind: "ok" as const,
        evidence: detail!,
        decision: decisionRow,
      };
    });
  }

  writeAudit = writeAudit;
}
