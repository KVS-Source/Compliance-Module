import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import { paginationSchema } from "../../common/responses/pagination.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import type { GenracSyncService } from "./service.js";

const syncIdParams = z.object({ syncRunId: z.string().uuid() }).strict();
const configureCsvSchema = z
  .object({ filename: z.string().trim().min(1).max(200) })
  .strict();

const syncRateLimiter = () =>
  createRateLimiter({
    limit: 20,
    code: "RATE_LIMITED",
    message: "Too many GenRAC sync attempts. Try again later.",
  });

export const genracRoutes = (service: GenracSyncService) => {
  const router = Router();

  router.get(
    "/status",
    permit("integrations:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.status(req.auth!.tenantId)),
    ),
  );

  router.post(
    "/test-connection",
    permit("integrations:write"),
    syncRateLimiter(),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.testConnection(req.auth!.tenantId)),
    ),
  );

  router.post(
    "/configure-csv",
    permit("integrations:write"),
    validate(configureCsvSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.configureCsvAdapter(
          req.auth!.tenantId,
          req.body.filename as string,
        ),
      ),
    ),
  );

  router.post(
    "/preview",
    permit("integrations:write"),
    syncRateLimiter(),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.preview(req.auth!.tenantId, req.auth!.userId),
      ),
    ),
  );

  router.post(
    "/sync",
    permit("integrations:write"),
    syncRateLimiter(),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.commit(req.auth!.tenantId, req.auth!.userId),
      ),
    ),
  );

  router.get(
    "/history",
    permit("integrations:read"),
    validate(paginationSchema.strict(), "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query as unknown as {
        page: number;
        pageSize: number;
      };
      const result = await service.history(req.auth!.tenantId, query);
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/history/:syncRunId",
    permit("integrations:read"),
    validate(syncIdParams, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.getRun(
          req.auth!.tenantId,
          String(req.params.syncRunId),
        ),
      ),
    ),
  );

  return router;
};
