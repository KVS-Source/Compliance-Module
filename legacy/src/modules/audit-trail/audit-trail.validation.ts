import { z } from 'zod'; export const auditQuerySchema = z.object({ module: z.string().optional(), action: z.string().optional(), record_id: z.string().uuid().optional() });
