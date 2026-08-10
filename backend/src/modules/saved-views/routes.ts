import { Router, type Request } from "express";
import { asyncHandler, validate } from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { SavedViewService } from "./service.js";
import {
  createSavedViewSchema,
  savedViewIdParamsSchema,
  savedViewListSchema,
  updateSavedViewSchema,
  type SavedViewRegisterKey,
} from "./validators.js";

const context = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const savedViewRoutes = (service: SavedViewService) => {
  const router = Router();

  router.get(
    "/",
    validate(savedViewListSchema, "query"),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.list(
          req.auth!.tenantId,
          req.auth!.userId,
          req.auth!.permissions,
          req.query.registerKey as SavedViewRegisterKey,
        ),
      ),
    ),
  );

  router.post(
    "/",
    validate(createSavedViewSchema),
    asyncHandler(async (req, res) =>
      created(
        res,
        await service.create(
          req.auth!.tenantId,
          req.auth!.userId,
          req.auth!.permissions,
          req.body,
          context(req),
        ),
      ),
    ),
  );

  router.patch(
    "/:savedViewId",
    validate(savedViewIdParamsSchema, "params"),
    validate(updateSavedViewSchema),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          req.auth!.userId,
          req.auth!.permissions,
          String(req.params.savedViewId),
          req.body,
          context(req),
        ),
      ),
    ),
  );

  router.delete(
    "/:savedViewId",
    validate(savedViewIdParamsSchema, "params"),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.delete(
          req.auth!.tenantId,
          req.auth!.userId,
          req.auth!.permissions,
          String(req.params.savedViewId),
          context(req),
        ),
      ),
    ),
  );

  return router;
};
