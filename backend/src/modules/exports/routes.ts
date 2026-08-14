import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { exportFilename } from "./csv.js";
import type { ExportService } from "./service.js";

const registerParamsSchema = z
  .object({ registerCode: z.string().trim().min(1).max(64) })
  .strict();

/**
 * Sends a CSV body with a deterministic filename.
 *
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
 * together stop a browser rendering the response inline, which is what turns a
 * text file into a stored-XSS vector on the API origin.
 */
const sendCsv = (res: Response, module: string, body: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${exportFilename(module)}"`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(body);
};

/**
 * CSV exports. Each route carries `exports:read` in addition to the reading
 * permission for its module, so export can be withheld from a role that may
 * still browse the data in the product.
 */
export const exportRoutes = (service: ExportService) => {
  const router = Router();

  router.get(
    "/gaps.csv",
    permit("exports:read"),
    permit("gaps:read"),
    asyncHandler(async (req: Request, res: Response) =>
      sendCsv(res, "gaps", await service.gaps(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/capas.csv",
    permit("exports:read"),
    permit("capa:read"),
    asyncHandler(async (req: Request, res: Response) =>
      sendCsv(res, "capas", await service.capas(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/kpi-actuals.csv",
    permit("exports:read"),
    permit("kpis:read"),
    asyncHandler(async (req: Request, res: Response) =>
      sendCsv(res, "kpi-actuals", await service.kpiActuals(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/risks.csv",
    permit("exports:read"),
    permit("risk:read"),
    asyncHandler(async (req: Request, res: Response) =>
      sendCsv(res, "risks", await service.risks(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/evidence.csv",
    permit("exports:read"),
    permit("evidence:read"),
    asyncHandler(async (req: Request, res: Response) =>
      sendCsv(res, "evidence", await service.evidence(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/operational-registers/:registerCode.csv",
    permit("exports:read"),
    permit("registers:read"),
    validate(registerParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      const registerCode = String(req.params.registerCode);
      return sendCsv(
        res,
        `register-${registerCode.toLowerCase()}`,
        await service.registerRecords(req.auth!.tenantId, registerCode),
      );
    }),
  );

  return router;
};
