import { z } from 'zod';

export const loginSchema = z.object({
  client_slug: z.string().min(1, 'client_slug is required'),
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
