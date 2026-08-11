import { Router, type Request } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import type { NotificationService } from "./service.js";
import {
  markNotificationReadSchema,
  notificationIdParamsSchema,
  notificationListSchema,
  type NotificationListQuery,
} from "./validators.js";

const context = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const notificationRoutes = (service: NotificationService) => {
  const router = Router();
  router.use(permit("dashboard:read"));

  router.get(
    "/",
    validate(notificationListSchema, "query"),
    asyncHandler(async (req, res) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.auth!.userId,
        req.auth!.permissions,
        req.query as unknown as NotificationListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.patch(
    "/:notificationId/read",
    validate(notificationIdParamsSchema, "params"),
    validate(markNotificationReadSchema),
    asyncHandler(async (req, res) =>
      ok(
        res,
        await service.markRead(
          req.auth!.tenantId,
          req.auth!.userId,
          String(req.params.notificationId),
          context(req),
        ),
      ),
    ),
  );

  return router;
};
