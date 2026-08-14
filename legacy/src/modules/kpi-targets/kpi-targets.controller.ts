import { Request, Response } from 'express';
import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { parsePagination } from '../../utils/pagination';
import * as service from './kpi-targets.service';
import { createKpiTargetSchema, updateKpiTargetSchema } from './kpi-targets.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { skip, take } = parsePagination(req);
  res.json(await service.list(getClientId(req), { skip, take, kpi_id: req.query.kpi_id ? String(req.query.kpi_id) : undefined }));
});
export const get = asyncHandler(async (req: Request, res: Response) => res.json(await service.get(getClientId(req), req.params.id)));
export const create = asyncHandler(async (req: Request, res: Response) => res.status(201).json(await service.create(getActor(req), createKpiTargetSchema.parse(req.body))));
export const update = asyncHandler(async (req: Request, res: Response) => res.json(await service.update(getActor(req), req.params.id, updateKpiTargetSchema.parse(req.body))));
