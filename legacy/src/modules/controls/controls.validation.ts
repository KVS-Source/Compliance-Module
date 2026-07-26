import { z } from 'zod';

export const createControlSchema = z.object({
  framework_id: z.string().uuid(),
  control_code: z.string().min(1).max(100),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
});

export const updateControlSchema = z.object({
  control_code: z.string().min(1).max(100).optional(),
  title: z.string().min(2).max(300).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
});
