import { z } from 'zod';

export const createPolicySchema = z.object({
  policy_code: z.string().min(1).max(80),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  department_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  use_in_scope: z.boolean().optional(),
});

export const updatePolicySchema = z.object({
  title: z.string().min(2).max(300).optional(),
  description: z.string().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  use_in_scope: z.boolean().optional(),
  status: z.string().optional(),
});
