import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  full_name: z.string().min(2).max(200),
  is_superuser: z.boolean().optional(),
  is_hr: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(2).max(200).optional(),
  status: z.string().optional(),
  is_active: z.boolean().optional(),
  is_superuser: z.boolean().optional(),
  is_hr: z.boolean().optional(),
});
