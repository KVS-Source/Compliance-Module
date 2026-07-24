import { z } from 'zod';

export const createLookupSchema = z.object({
  category: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateLookupSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.any()).optional(),
  status: z.string().optional(),
});
