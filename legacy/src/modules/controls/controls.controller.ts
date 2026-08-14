import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as service from './controls.service';
import { createControlSchema, updateControlSchema } from './controls.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(
    await service.list({
      framework_id: req.query.framework_id ? String(req.query.framework_id) : undefined,
      includeOutOfScope: req.query.include_out_of_scope === 'true',
    }),
  );
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createControlSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateControlSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
