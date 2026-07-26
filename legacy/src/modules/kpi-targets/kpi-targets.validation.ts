import { z } from 'zod';

const targetFields = {
  target_value: z.coerce.number(),
  target_period: z.string().max(80).nullable().optional(),
  target_source: z.string().nullable().optional(),
  frequency: z.string().max(80).nullable().optional(),
  enabled: z.boolean(),
  owner_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  approval_status: z.string().max(50),
  effective_from: z.coerce.date().nullable().optional(),
  effective_to: z.coerce.date().nullable().optional(),
  status: z.string().max(50),
};

export const createKpiTargetSchema = z.object({
  kpi_id: z.string().uuid(),
  ...targetFields,
}).partial({ enabled: true, approval_status: true, status: true });

export const updateKpiTargetSchema = z.object(targetFields).partial();
