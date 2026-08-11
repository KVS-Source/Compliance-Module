import type { CommentEntityType, Prisma, PrismaClient } from "@prisma/client";
import { forbidden, notFound } from "../../common/errors/app-error.js";
import { permissionAllowed } from "../../common/middleware/http.js";

/**
 * Record comments.
 *
 * A comment is remediation conversation kept inside the audit trail rather
 * than in somebody's inbox. Three rules hold it together:
 *
 * - **Append-only.** There is no update or delete route, and the
 *   `record_comments_append_only` trigger refuses the operation even if one
 *   were added later. History a reviewer has read cannot be rewritten.
 * - **The parent record governs access.** Comments carry no permission of
 *   their own: reading a Gap's comments needs `gaps:read` and posting one
 *   needs `gaps:write`. A read-only viewer can follow the conversation and
 *   cannot join it, without adding a permission to the profile catalogue.
 * - **The parent must exist in the caller's Company.** The id is resolved in
 *   the authenticated tenant, so a comment cannot be attached to — or read
 *   from — another Company's record.
 */

type Scope = {
  read: string;
  write: string;
  label: string;
};

const SCOPES: Record<CommentEntityType, Scope> = {
  GAP: { read: "gaps:read", write: "gaps:write", label: "Gap" },
  CAPA: { read: "capa:read", write: "capa:write", label: "CAPA" },
  RISK: { read: "risk:read", write: "risk:write", label: "Risk" },
  EVIDENCE: {
    read: "evidence:read",
    write: "evidence:write",
    label: "Evidence",
  },
};

export const COMMENT_ENTITY_TYPES = Object.keys(SCOPES) as CommentEntityType[];

export const MAX_COMMENT_LENGTH = 4000;

const dto = (comment: {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  body: string;
  createdAt: Date;
  author: { id: string; code: string; fullName: string } | null;
}) => ({
  id: comment.id,
  entityType: comment.entityType,
  entityId: comment.entityId,
  body: comment.body,
  createdAt: comment.createdAt,
  author: comment.author
    ? {
        id: comment.author.id,
        code: comment.author.code,
        name: comment.author.fullName,
      }
    : // A withdrawn account keeps its place in the trail rather than erasing
      // the comment it left behind.
      null,
});

export class RecordCommentService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Resolves the parent record inside the caller's Company. Soft-deleted
   * parents are treated as absent so a comment cannot be attached to a record
   * the registers no longer show.
   */
  private async requireParent(
    entityType: CommentEntityType,
    entityId: string,
    tenantId: string,
  ) {
    // Gap, CAPA and Risk are soft-deleted; Evidence carries no `deletedAt`
    // and is retired through its lifecycle status instead, so it is resolved
    // on tenant and id alone.
    const scoped = { id: entityId, tenantId, deletedAt: null };
    const found =
      entityType === "GAP"
        ? await this.db.gap.findFirst({ where: scoped, select: { id: true } })
        : entityType === "CAPA"
          ? await this.db.capa.findFirst({
              where: scoped,
              select: { id: true },
            })
          : entityType === "RISK"
            ? await this.db.risk.findFirst({
                where: scoped,
                select: { id: true },
              })
            : await this.db.evidence.findFirst({
                where: { id: entityId, tenantId },
                select: { id: true },
              });
    if (!found) throw notFound(`${SCOPES[entityType].label} not found`);
    return found;
  }

  private require(
    permissions: readonly string[],
    entityType: CommentEntityType,
    mode: "read" | "write",
  ) {
    if (!permissionAllowed(permissions, SCOPES[entityType][mode])) {
      throw forbidden();
    }
  }

  async list(
    entityType: CommentEntityType,
    entityId: string,
    tenantId: string,
    permissions: readonly string[],
  ) {
    this.require(permissions, entityType, "read");
    await this.requireParent(entityType, entityId, tenantId);

    const comments = await this.db.recordComment.findMany({
      where: { tenantId, entityType, entityId },
      // Oldest first: a conversation reads top to bottom. `id` breaks ties so
      // two comments written in the same transaction cannot reorder.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        entityType: true,
        entityId: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, code: true, fullName: true } },
      },
    });
    return comments.map(dto);
  }

  async create(
    entityType: CommentEntityType,
    entityId: string,
    tenantId: string,
    actorUserId: string,
    body: string,
    context: { ip?: string; userAgent?: string },
  ) {
    return this.db.$transaction(async (transaction) => {
      const comment = await transaction.recordComment.create({
        data: { tenantId, entityType, entityId, body, authorId: actorUserId },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, code: true, fullName: true } },
        },
      });

      /**
       * The comment body is not copied into the audit event. The event records
       * that a comment was added and points at it; duplicating the text would
       * create a second, mutable-looking copy of something the trigger
       * protects, and would put free-form prose into audit metadata.
       */
      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "RECORD_COMMENT_ADD",
          entityType,
          entityId,
          metadata: {
            commentId: comment.id,
            bodyLength: body.length,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });

      return dto(comment);
    });
  }

  /** Permission and parent checks run before any write is attempted. */
  async guardCreate(
    entityType: CommentEntityType,
    entityId: string,
    tenantId: string,
    permissions: readonly string[],
  ) {
    this.require(permissions, entityType, "write");
    await this.requireParent(entityType, entityId, tenantId);
  }
}
