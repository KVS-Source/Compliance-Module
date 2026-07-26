import { z } from 'zod';
export const createMappingSchema = z.object({
  kpi_id: z.string().uuid(), framework_id: z.string().uuid(), control_id: z.string().uuid().nullable().optional(),
  policy_id: z.string().uuid().nullable().optional(), rule_text: z.string().nullable().optional(), evidence_required: z.boolean().optional(),
  mapping_status: z.string().max(50).optional(), status: z.string().max(50).optional(),
});
export const updateMappingSchema = createMappingSchema.omit({ kpi_id: true }).partial();
