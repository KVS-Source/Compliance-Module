import { z } from 'zod';

export const createPermissionSchema = z.object({
  code: z.string().min(2).max(120),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
});

export const assignPermissionSchema = z.object({
  permission_id: z.string().uuid(),
});
