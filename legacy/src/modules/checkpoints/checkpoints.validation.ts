import { z } from 'zod';

export const createCheckpointSchema = z.object({
  framework_id: z.string().uuid(),
  control_id: z.string().uuid(),
  checkpoint_code: z.string().min(1).max(100),
  title: z.string().min(2).max(300),
  guidance: z.string().optional(),
  evidence_required: z.boolean().optional(),
});

export const updateCheckpointSchema = z.object({
  checkpoint_code: z.string().min(1).max(100).optional(),
  title: z.string().min(2).max(300).optional(),
  guidance: z.string().nullable().optional(),
  evidence_required: z.boolean().optional(),
  status: z.string().optional(),
});
