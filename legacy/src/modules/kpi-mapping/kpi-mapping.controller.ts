import { Request, Response } from 'express'; import { getActor } from '../../middleware/audit.middleware'; import { getClientId } from '../../middleware/tenant.middleware'; import { asyncHandler } from '../../utils/async-handler'; import * as s from './kpi-mapping.service'; import { createMappingSchema, updateMappingSchema } from './kpi-mapping.validation';
export const list = asyncHandler(async (req: Request, res: Response) => res.json(await s.list(getClientId(req), req.query.kpi_id ? String(req.query.kpi_id) : undefined)));
export const sequence = asyncHandler(async (_req: Request, res: Response) => res.json(s.mappingSequence));
export const get = asyncHandler(async (req: Request, res: Response) => res.json(await s.get(getClientId(req), req.params.id)));
export const create = asyncHandler(async (req: Request, res: Response) => res.status(201).json(await s.create(getActor(req), createMappingSchema.parse(req.body))));
export const update = asyncHandler(async (req: Request, res: Response) => res.json(await s.update(getActor(req), req.params.id, updateMappingSchema.parse(req.body))));
export const deactivate = asyncHandler(async (req: Request, res: Response) => res.json(await s.deactivate(getActor(req), req.params.id)));
