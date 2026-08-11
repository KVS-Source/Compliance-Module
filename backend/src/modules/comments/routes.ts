import { Router, type Request, type Response } from "express";
import type { CommentEntityType } from "@prisma/client";
import { z } from "zod";
import { asyncHandler, validate } from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import {
  COMMENT_ENTITY_TYPES,
  MAX_COMMENT_LENGTH,
  type RecordCommentService,
} from "./service.js";

const paramsSchema = z
  .object({
    entityType: z.enum(
      COMMENT_ENTITY_TYPES as [CommentEntityType, ...CommentEntityType[]],
    ),
    entityId: z.string().uuid(),
  })
  .strict();

const createSchema = z
  .object({
    body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
  })
  .strict();

/**
 * Comments are mounted once and dispatch on `entityType` rather than being
 * repeated under each register. There is no update or delete route: the
 * append-only rule is the point of putting the conversation here.
 *
 * No `permit()` middleware — the required permission depends on which record
 * is being discussed, so the service resolves it per entity type.
 */
export const commentRoutes = (service: RecordCommentService) => {
  const router = Router();

  router.get(
    "/:entityType/:entityId/comments",
    validate(paramsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.list(
          req.params.entityType as CommentEntityType,
          String(req.params.entityId),
          req.auth!.tenantId,
          req.auth!.permissions,
        ),
      ),
    ),
  );

  router.post(
    "/:entityType/:entityId/comments",
    validate(paramsSchema, "params"),
    validate(createSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const entityType = req.params.entityType as CommentEntityType;
      const entityId = String(req.params.entityId);
      await service.guardCreate(
        entityType,
        entityId,
        req.auth!.tenantId,
        req.auth!.permissions,
      );
      const userAgent = req.get("user-agent");
      return created(
        res,
        await service.create(
          entityType,
          entityId,
          req.auth!.tenantId,
          req.auth!.userId,
          String(req.body.body),
          {
            ...(req.ip ? { ip: req.ip } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
        ),
      );
    }),
  );

  return router;
};
