import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { parsePagination } from '../../utils/pagination';
import * as service from './risks.service';
import { createRiskSchema, updateRiskSchema } from './risks.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { skip, take } = parsePagination(req);
  const status = req.query.status ? String(req.query.status) : undefined;
  const classification = req.query.classification ? String(req.query.classification) : undefined;
  const kpi_id = req.query.kpi_id ? String(req.query.kpi_id) : undefined;
  res.json(await service.list(getClientId(req), { skip, take, status, classification, kpi_id }));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(getClientId(req), req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createRiskSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateRiskSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
