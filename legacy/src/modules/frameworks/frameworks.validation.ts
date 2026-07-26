import { z } from 'zod';

export const createFrameworkSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  version: z.string().min(1).max(50),
  description: z.string().optional(),
});

export const updateFrameworkSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  is_active: z.boolean().optional(),
});
