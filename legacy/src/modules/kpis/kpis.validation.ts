import { z } from 'zod';

const fields = {
  kpi_name: z.string().min(2).max(250),
  description: z.string().nullable().optional(),
  unit: z.string().max(80).nullable().optional(),
  direction: z.enum(['higher_is_better', 'lower_is_better']),
  frequency: z.string().min(1).max(80),
  default_data_source: z.string().nullable().optional(),
  owner_suggestion: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  owner_text: z.string().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  use_in_scope: z.boolean(),
  compliance_framework_mapping_text: z.string().nullable().optional(),
  status: z.string().min(1).max(50),
};

export const createKpiSchema = z.object({
  kpi_code: z.string().min(1).max(80),
  ...fields,
}).partial({ direction: true, frequency: true, use_in_scope: true, status: true });

export const updateKpiSchema = z.object(fields).partial();
