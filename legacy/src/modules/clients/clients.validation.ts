import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, numbers and dashes')
    .max(100),
  contact_email: z.string().email().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  status: z.string().optional(),
  contact_email: z.string().email().nullable().optional(),
});
