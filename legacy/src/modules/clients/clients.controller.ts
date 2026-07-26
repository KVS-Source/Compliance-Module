import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as service from './clients.service';
import { createClientSchema, updateClientSchema } from './clients.validation';

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getMe(getClientId(req)));
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.listAll());
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getById(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createClientSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateClientSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
