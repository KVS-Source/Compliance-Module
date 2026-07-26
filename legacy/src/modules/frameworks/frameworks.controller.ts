import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as service from './frameworks.service';
import { createFrameworkSchema, updateFrameworkSchema } from './frameworks.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const includeOutOfScope = req.query.include_out_of_scope === 'true';
  res.json(await service.list(includeOutOfScope));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createFrameworkSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateFrameworkSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
