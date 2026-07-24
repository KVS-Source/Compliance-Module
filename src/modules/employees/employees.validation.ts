import { z } from 'zod';

export const createEmployeeSchema = z.object({
  employee_code: z.string().min(1).max(50),
  full_name: z.string().min(2).max(200),
  email: z.string().email().optional(),
  department_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  employment_type: z.string().max(50).optional(),
  designation: z.string().max(150).optional(),
  joining_date: z.coerce.date().optional(),
  current_work: z.string().optional(),
});

export const updateEmployeeSchema = z.object({
  full_name: z.string().min(2).max(200).optional(),
  email: z.string().email().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  employment_type: z.string().max(50).nullable().optional(),
  designation: z.string().max(150).nullable().optional(),
  joining_date: z.coerce.date().nullable().optional(),
  current_work: z.string().nullable().optional(),
  status: z.string().optional(),
  // Sensitive HR fields - only HR-authorized users reach the update route.
  exit_date: z.coerce.date().nullable().optional(),
  exit_reason: z.string().nullable().optional(),
});
