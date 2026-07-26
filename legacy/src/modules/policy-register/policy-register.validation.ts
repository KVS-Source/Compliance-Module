import { z } from 'zod';
const fields = { policy_name: z.string().min(2).max(300), department_id: z.string().uuid().nullable().optional(), owner_id: z.string().uuid().nullable().optional(), linked_framework_id: z.string().uuid().nullable().optional(), linked_control_id: z.string().uuid().nullable().optional(), linked_kpi_id: z.string().uuid().nullable().optional(), version: z.string().max(40), effective_date: z.coerce.date().nullable().optional(), next_review_date: z.coerce.date().nullable().optional(), uploaded_document_id: z.string().uuid().nullable().optional(), reviewer_id: z.string().uuid().nullable().optional(), remarks: z.string().nullable().optional(), status: z.string().max(50) };
export const createPolicyRegisterSchema = z.object({ policy_id: z.string().uuid().nullable().optional(), policy_code: z.string().min(1).max(80), ...fields }).partial({ version: true, status: true });
export const updatePolicyRegisterSchema = z.object(fields).partial();
export const reviewRemarksSchema = z.object({ remarks: z.string().max(2000).optional() });
export const rejectPolicySchema = z.object({ reason: z.string().min(2).max(2000) });
