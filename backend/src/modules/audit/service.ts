import type { AuditEventSource, Prisma, PrismaClient } from "@prisma/client";
import { notFound } from "../../common/errors/app-error.js";
import { pageMeta } from "../../common/responses/envelope.js";
import { toCsv, type CsvColumn } from "../exports/csv.js";
import type { AuditListQuery } from "./validators.js";

const SENSITIVE_KEY =
  /(password|token|secret|authorization|cookie|credential|api[_-]?key|private[_-]?key|evidence[_-]?content|file[_-]?bytes)/i;

const redactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(nested);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
};

/**
 * Presentation source. Runtime rows with an actor are USER; imported workbook
 * history stays IMPORT; GenRAC sync uses EXTERNAL_SYNC when stored.
 */
export const presentSource = (
  source: AuditEventSource,
  userId: string | null,
): "SYSTEM" | "USER" | "IMPORT" | "EXTERNAL_SYNC" => {
  if (source === "IMPORT") return "IMPORT";
  if (source === "EXTERNAL_SYNC") return "EXTERNAL_SYNC";
  if (userId) return "USER";
  return "SYSTEM";
};

const eventDto = (event: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  source: AuditEventSource;
  createdAt: Date;
  user: { id: string; code: string; fullName: string } | null;
}) => ({
  id: event.id,
  action: event.action,
  entityType: event.entityType,
  entityId: event.entityId,
  recordCode:
    typeof event.metadata === "object" &&
    event.metadata !== null &&
    "code" in event.metadata &&
    typeof (event.metadata as { code?: unknown }).code === "string"
      ? (event.metadata as { code: string }).code
      : event.entityId,
  source: presentSource(event.source, event.user?.id ?? null),
  storedSource: event.source,
  success:
    typeof event.metadata === "object" &&
    event.metadata !== null &&
    "success" in event.metadata
      ? Boolean((event.metadata as { success?: unknown }).success)
      : true,
  correlationId:
    typeof event.metadata === "object" &&
    event.metadata !== null &&
    "correlationId" in event.metadata &&
    typeof (event.metadata as { correlationId?: unknown }).correlationId ===
      "string"
      ? (event.metadata as { correlationId: string }).correlationId
      : null,
  requestId:
    typeof event.metadata === "object" &&
    event.metadata !== null &&
    "requestId" in event.metadata &&
    typeof (event.metadata as { requestId?: unknown }).requestId === "string"
      ? (event.metadata as { requestId: string }).requestId
      : null,
  metadata: redactValue(event.metadata),
  ipAddress: event.ipAddress,
  userAgent: event.userAgent
    ? event.userAgent.slice(0, 240)
    : null,
  createdAt: event.createdAt,
  user: event.user
    ? {
        id: event.user.id,
        code: event.user.code,
        name: event.user.fullName,
      }
    : null,
});

export class AuditTrailService {
  constructor(private readonly db: PrismaClient) {}

  private where(tenantId: string, query: AuditListQuery): Prisma.AuditEventWhereInput {
    const sourceFilter = (): Prisma.AuditEventWhereInput | undefined => {
      if (!query.source) return undefined;
      if (query.source === "IMPORT") return { source: "IMPORT" };
      if (query.source === "EXTERNAL_SYNC") return { source: "EXTERNAL_SYNC" };
      if (query.source === "USER") {
        return { source: "SYSTEM", userId: { not: null } };
      }
      return { source: "SYSTEM", userId: null };
    };

    return {
      tenantId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(sourceFilter() ?? {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: "insensitive" } },
              { entityType: { contains: query.q, mode: "insensitive" } },
              { entityId: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  async list(tenantId: string, query: AuditListQuery) {
    const where = this.where(tenantId, query);
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: { select: { id: true, code: true, fullName: true } },
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return {
      data: items.map(eventDto),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async get(tenantId: string, eventId: string) {
    const event = await this.db.auditEvent.findFirst({
      where: { tenantId, id: eventId },
      include: {
        user: { select: { id: true, code: true, fullName: true } },
      },
    });
    if (!event) throw notFound("Audit event not found");
    return eventDto(event);
  }

  async exportCsv(tenantId: string, query: AuditListQuery) {
    const where = this.where(tenantId, query);
    const rows = await this.db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5_000,
      include: {
        user: { select: { id: true, code: true, fullName: true } },
      },
    });
    const mapped = rows.map(eventDto);
    const columns: CsvColumn<(typeof mapped)[number]>[] = [
      { header: "Occurred At", value: (row) => row.createdAt.toISOString() },
      { header: "Source", value: (row) => row.source },
      { header: "Action", value: (row) => row.action },
      { header: "Entity Type", value: (row) => row.entityType },
      { header: "Entity ID", value: (row) => row.entityId },
      { header: "Record Code", value: (row) => row.recordCode },
      { header: "User", value: (row) => row.user?.name ?? "" },
      { header: "User Code", value: (row) => row.user?.code ?? "" },
      { header: "Success", value: (row) => row.success },
      { header: "Correlation ID", value: (row) => row.correlationId },
      { header: "Request ID", value: (row) => row.requestId },
    ];
    return toCsv(columns, mapped);
  }
}
