import { z } from 'zod';

export const createRiskSchema = z.object({
  risk_code: z.string().min(1).max(80),
  risk_title: z.string().min(2).max(300),
  risk_description: z.string().optional(),
  classification: z.enum(['major', 'minor']).default('minor'),
  kpi_id: z.string().uuid().optional(),
  kpi_target_id: z.string().uuid().optional(),
  kpi_actual_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation_plan: z.string().optional(),
  due_date: z.coerce.date().optional(),
});

export const updateRiskSchema = z.object({
  risk_title: z.string().min(2).max(300).optional(),
  risk_description: z.string().nullable().optional(),
  classification: z.enum(['major', 'minor']).optional(),
  kpi_id: z.string().uuid().nullable().optional(),
  kpi_target_id: z.string().uuid().nullable().optional(),
  kpi_actual_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  probability: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  mitigation_plan: z.string().nullable().optional(),
  due_date: z.coerce.date().nullable().optional(),
  status: z.string().optional(),
});
