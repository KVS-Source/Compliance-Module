import { z } from 'zod';

export const createKpiActualSchema = z.object({
  kpi_id: z.string().uuid(),
  kpi_target_id: z.string().uuid().nullable().optional(),
  period: z.string().min(1).max(80),
  target_value: z.coerce.number(),
  actual_value: z.coerce.number(),
  evidence_required: z.boolean().optional(),
  comments: z.string().nullable().optional(),
});

export const updateKpiActualSchema = z.object({
  kpi_target_id: z.string().uuid().nullable().optional(),
  period: z.string().min(1).max(80).optional(),
  target_value: z.coerce.number().optional(),
  actual_value: z.coerce.number().optional(),
  evidence_required: z.boolean().optional(),
  comments: z.string().nullable().optional(),
}).strict();

export const rejectionSchema = z.object({ reason: z.string().min(2).max(2000) });

export const createRiskFromActualSchema = z.object({
  risk_code: z.string().min(1).max(80),
  classification: z.enum(['major', 'minor']).default('minor'),
  risk_title: z.string().min(2).max(300).optional(),
  risk_description: z.string().max(2000).optional(),
  department_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  mitigation_plan: z.string().max(4000).optional(),
  due_date: z.coerce.date().optional(),
});
