import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.string().optional(),
});
