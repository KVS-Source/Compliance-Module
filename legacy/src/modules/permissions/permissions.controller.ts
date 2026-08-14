import { Request, Response } from 'express';

import { getActor } from '../../middleware/audit.middleware';
import { getClientId } from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as service from './permissions.service';
import { assignPermissionSchema, createPermissionSchema } from './permissions.validation';

export const listPermissions = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.listPermissions());
});

export const createPermission = asyncHandler(async (req: Request, res: Response) => {
  const data = createPermissionSchema.parse(req.body);
  res.status(201).json(await service.createPermission(getActor(req), data));
});

export const listRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listRolePermissions(getClientId(req), req.params.roleId));
});

export const assignPermission = asyncHandler(async (req: Request, res: Response) => {
  const { permission_id } = assignPermissionSchema.parse(req.body);
  res.status(201).json(await service.assignPermission(getActor(req), req.params.roleId, permission_id));
});

export const removePermission = asyncHandler(async (req: Request, res: Response) => {
  await service.removePermission(getActor(req), req.params.roleId, req.params.permissionId);
  res.status(204).send();
});
