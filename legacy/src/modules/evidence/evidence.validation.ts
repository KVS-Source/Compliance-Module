import { z } from 'zod';
export const uploadEvidenceSchema = z.object({ evidence_code: z.string().min(1).max(80), title: z.string().min(2).max(300), description: z.string().optional(), evidence_type: z.string().max(80).optional(), owner_id: z.string().uuid().optional(), remarks: z.string().optional() });
export const linkEvidenceSchema = z.object({ linked_entity_type: z.enum(['kpi_actual', 'policy_register', 'capa', 'gap', 'checkpoint', 'risk', 'audit_report', 'training_record', 'incident', 'vendor']), linked_entity_id: z.string().uuid(), link_reason: z.string().max(1000).optional() });
export const reviewEvidenceSchema = z.object({ remarks: z.string().max(2000).optional() });
export const rejectEvidenceSchema = z.object({ reason: z.string().min(2).max(2000) });
