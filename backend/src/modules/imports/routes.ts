import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import { notFound } from "../../common/errors/app-error.js";
import { paginationSchema } from "../../common/responses/pagination.js";
import { pageMeta } from "../../common/responses/envelope.js";
import type { WorkbookImportService } from "./service.js";

const importIdParamsSchema = z.object({ importId: z.string().uuid() }).strict();

const importListSchema = paginationSchema.strict();

const importErrorListSchema = paginationSchema
  .extend({ sheet: z.string().trim().min(1).max(120).optional() })
  .strict();

/**
 * Read APIs over import batches recorded by the CLI.
 *
 * Upload endpoints are intentionally absent for this milestone: the CLI is the
 * delivery path, and adding multipart intake would have introduced an untested
 * write surface close to the deadline. The batch and row records these routes
 * expose are written by the same service either way, so a later upload
 * endpoint is additive.
 */
export const importRoutes = (service: WorkbookImportService) => {
  const router = Router();

  router.get(
    "/",
    permit("imports:read"),
    validate(importListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query as unknown as z.infer<typeof importListSchema>;
      const result = await service.listBatches(req.auth!.tenantId, query);
      return ok(
        res,
        result.data,
        pageMeta(query.page, query.pageSize, result.total),
      );
    }),
  );

  router.get(
    "/:importId",
    permit("imports:read"),
    validate(importIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      const batch = await service.getBatch(
        req.auth!.tenantId,
        String(req.params.importId),
      );
      if (!batch) throw notFound("Import batch not found");
      return ok(res, batch);
    }),
  );

  router.get(
    "/:importId/errors",
    permit("imports:read"),
    validate(importIdParamsSchema, "params"),
    validate(importErrorListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query as unknown as z.infer<
        typeof importErrorListSchema
      >;
      const result = await service.listBatchErrors(
        req.auth!.tenantId,
        String(req.params.importId),
        query,
      );
      return ok(
        res,
        result.data,
        pageMeta(query.page, query.pageSize, result.total),
      );
    }),
  );

  return router;
};
