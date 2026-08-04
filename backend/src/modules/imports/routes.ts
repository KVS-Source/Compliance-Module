import { readFile } from "node:fs/promises";
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
import { importUploadRateLimiter } from "../../common/middleware/rate-limit.js";
import { exportFilename } from "../exports/csv.js";
import type { WorkbookImportService } from "./service.js";
import { MAX_WORKBOOK_BYTES } from "./service.js";
import {
  cleanupImportTemp,
  parseImportMultipartUpload,
} from "./multipart.js";
import {
  CSV_IMPORT_TYPES,
  MAX_CSV_BYTES,
  csvTemplateBody,
  isCsvImportType,
  listCsvTemplates,
} from "./csv-templates.js";

const importIdParamsSchema = z.object({ importId: z.string().uuid() }).strict();
const importListSchema = paginationSchema.strict();
const importErrorListSchema = paginationSchema
  .extend({ sheet: z.string().trim().min(1).max(120).optional() })
  .strict();
const csvTypeParamsSchema = z
  .object({
    type: z.enum(CSV_IMPORT_TYPES),
  })
  .strict();

/**
 * Import batch read APIs plus secure browser workbook/CSV preview and commit.
 * Tenant is always taken from the authenticated JWT — never from the body.
 */
export const importRoutes = (service: WorkbookImportService) => {
  const router = Router();

  router.get(
    "/csv/templates",
    permit("imports:read"),
    asyncHandler(async (_req: Request, res: Response) =>
      ok(res, listCsvTemplates()),
    ),
  );

  router.get(
    "/csv/templates/:type",
    permit("imports:read"),
    validate(csvTypeParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      const type = String(req.params.type);
      if (!isCsvImportType(type)) throw notFound("CSV template not found");
      const body = csvTemplateBody(type);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename(`import-template-${type.toLowerCase()}`)}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(body);
    }),
  );

  router.post(
    "/workbook/preview",
    permit("imports:write"),
    importUploadRateLimiter(),
    asyncHandler(async (req: Request, res: Response) => {
      const uploaded = await parseImportMultipartUpload(req, {
        tenantId: req.auth!.tenantId,
        maxBytes: MAX_WORKBOOK_BYTES,
        allowedExtensions: [".xlsx"],
      });
      try {
        const buffer = await readFile(uploaded.tempPath);
        const result = await service.previewUpload(
          req.auth!.tenantId,
          req.auth!.userId,
          uploaded.clientFilename,
          uploaded.tempPath,
          buffer,
          "BROWSER_XLSX",
        );
        return ok(res, {
          importId: result.importId,
          alreadyImported: result.alreadyImported,
          preview: result.preview,
        });
      } catch (error) {
        await cleanupImportTemp(uploaded.tempPath);
        throw error;
      }
    }),
  );

  router.post(
    "/csv/preview",
    permit("imports:write"),
    importUploadRateLimiter(),
    asyncHandler(async (req: Request, res: Response) => {
      const importTypeRaw =
        typeof req.query.type === "string" ? req.query.type : "";
      if (!isCsvImportType(importTypeRaw)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Query parameter type must be an approved CSV import type",
            details: { allowed: CSV_IMPORT_TYPES },
          },
        });
      }
      const uploaded = await parseImportMultipartUpload(req, {
        tenantId: req.auth!.tenantId,
        maxBytes: MAX_CSV_BYTES,
        allowedExtensions: [".csv"],
      });
      try {
        const buffer = await readFile(uploaded.tempPath);
        const result = await service.previewCsvUpload(
          req.auth!.tenantId,
          req.auth!.userId,
          importTypeRaw,
          uploaded.clientFilename,
          uploaded.tempPath,
          buffer,
        );
        return ok(res, {
          importId: result.importId,
          alreadyImported: result.alreadyImported,
          csvImportType: importTypeRaw,
          preview: result.preview,
        });
      } catch (error) {
        await cleanupImportTemp(uploaded.tempPath);
        throw error;
      }
    }),
  );

  router.post(
    "/:importId/commit",
    permit("imports:write"),
    importUploadRateLimiter(),
    validate(importIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      const report = await service.commitPreview(
        req.auth!.tenantId,
        req.auth!.userId,
        String(req.params.importId),
      );
      return ok(res, report);
    }),
  );

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
