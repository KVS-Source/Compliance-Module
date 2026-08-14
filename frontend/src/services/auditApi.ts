import { apiRequest } from "./apiClient";

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  recordCode: string | null;
  source: "SYSTEM" | "USER" | "IMPORT" | "EXTERNAL_SYNC";
  storedSource: string;
  success: boolean;
  correlationId: string | null;
  requestId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; code: string; name: string } | null;
};

export type AuditListQuery = {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  userId?: string;
  entityType?: string;
  action?: string;
  entityId?: string;
  source?: AuditEvent["source"];
  q?: string;
};

const fallbackMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export const auditApi = {
  async list(query: AuditListQuery = {}) {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.userId) params.set("userId", query.userId);
    if (query.entityType) params.set("entityType", query.entityType);
    if (query.action) params.set("action", query.action);
    if (query.entityId) params.set("entityId", query.entityId);
    if (query.source) params.set("source", query.source);
    if (query.q) params.set("q", query.q);
    const response = await apiRequest<AuditEvent[]>(`/audit-events?${params}`);
    return {
      data: response.data,
      meta:
        response.meta ??
        fallbackMeta(query.page ?? 1, query.pageSize ?? 20, response.data.length),
    };
  },
  async get(eventId: string) {
    return (
      await apiRequest<AuditEvent>(
        `/audit-events/${encodeURIComponent(eventId)}`,
      )
    ).data;
  },
};
