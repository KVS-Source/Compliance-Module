import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { parsePagination } from '../../utils/pagination';
import * as service from './policies.service';
import { createPolicySchema, updatePolicySchema } from './policies.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { skip, take } = parsePagination(req);
  res.json(await service.list(getClientId(req), { skip, take }));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.get(getClientId(req), req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createPolicySchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updatePolicySchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
