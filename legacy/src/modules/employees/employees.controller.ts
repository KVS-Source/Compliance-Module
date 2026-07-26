import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { hasHrAccess } from '../../middleware/rbac.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { parsePagination } from '../../utils/pagination';
import * as service from './employees.service';
import { createEmployeeSchema, updateEmployeeSchema } from './employees.validation';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { skip, take } = parsePagination(req);
  const department_id = req.query.department_id ? String(req.query.department_id) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const rows = await service.list(getClientId(req), { skip, take, department_id, status });
  const includeSensitive = hasHrAccess(req.currentUser!);
  res.json(rows.map((row) => service.maskSensitive(row, includeSensitive)));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const employee = await service.get(getClientId(req), req.params.id);
  res.json(service.maskSensitive(employee, hasHrAccess(req.currentUser!)));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createEmployeeSchema.parse(req.body);
  res.status(201).json(await service.create(getActor(req), data));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const data = updateEmployeeSchema.parse(req.body);
  res.json(await service.update(getActor(req), req.params.id, data));
});
