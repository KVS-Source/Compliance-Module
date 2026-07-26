import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as service from './lookups.service';
import { createLookupSchema, updateLookupSchema } from './lookups.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  res.json(await service.list(getClientId(req), category));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(getClientId(req), req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createLookupSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateLookupSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
