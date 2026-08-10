import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import { permissionAllowed } from "../../common/middleware/http.js";
import type { DelegationService } from "./service.js";

const createSchema = z
  .object({
    delegateUserId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const idParams = z.object({ id: z.string().uuid() });

export const delegationRoutes = (service: DelegationService) => {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    permit("users:read"),
    asyncHandler(async (req: Request, res: Response) => {
      const admin = permissionAllowed(req.auth!.permissions, "users:write");
      const rows = admin
        ? await service.listForAdmin(req.auth!.tenantId)
        : await service.list(req.auth!.tenantId, req.auth!.userId);
      return ok(res, rows);
    }),
  );

  router.post(
    "/",
    // Any authenticated user may open a window for their own approvals;
    // company-wide management still needs users:write to list others'.
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw parsed.error;
      const userAgent = req.get("user-agent");
      return created(
        res,
        await service.create(
          req.auth!.tenantId,
          req.auth!.userId,
          {
            delegateUserId: parsed.data.delegateUserId,
            startsAt: new Date(parsed.data.startsAt),
            endsAt: new Date(parsed.data.endsAt),
            reason: parsed.data.reason ?? null,
          },
          {
            ...(req.ip ? { ip: req.ip } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
        ),
      );
    }),
  );

  router.post(
    "/:id/revoke",
    validate(idParams, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      const userAgent = req.get("user-agent");
      const allowAdmin = permissionAllowed(
        req.auth!.permissions,
        "users:write",
      );
      return ok(
        res,
        await service.revoke(
          req.auth!.tenantId,
          req.auth!.userId,
          String(req.params.id),
          {
            ...(req.ip ? { ip: req.ip } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
          { allowAdmin },
        ),
      );
    }),
  );

  return router;
};
