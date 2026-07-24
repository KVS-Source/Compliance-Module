import { z } from 'zod';

export const createDepartmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  parent_department_id: z.string().uuid().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.string().optional(),
  parent_department_id: z.string().uuid().nullable().optional(),
});
