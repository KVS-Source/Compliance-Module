import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { parsePagination } from '../../utils/pagination';
import * as service from './kpis.service';
import { createKpiSchema, updateKpiSchema } from './kpis.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { skip, take } = parsePagination(req);
  const status = req.query.status ? String(req.query.status) : undefined;
  const in_scope = req.query.in_scope === undefined ? undefined : req.query.in_scope === 'true';
  res.json(await service.list(getClientId(req), { skip, take, status, in_scope }));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(getClientId(req), req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.create(getActor(req), createKpiSchema.parse(req.body)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.update(getActor(req), req.params.id, updateKpiSchema.parse(req.body)));
});
