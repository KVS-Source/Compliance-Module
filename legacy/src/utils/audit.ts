import { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  clientId: string;
  userId?: string | null;
  module: string;
  action: string;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  status?: string;
}

// Writes one immutable audit_trail row. Call inside the same transaction as the
// mutation so the audit record and the change commit together.
export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditTrail.create({
    data: {
      client_id: entry.clientId,
      user_id: entry.userId ?? null,
      module: entry.module,
      action: entry.action,
      record_id: entry.recordId ?? null,
      old_value:
        entry.oldValue === undefined ? Prisma.DbNull : (entry.oldValue as Prisma.InputJsonValue),
      new_value:
        entry.newValue === undefined ? Prisma.DbNull : (entry.newValue as Prisma.InputJsonValue),
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      status: entry.status ?? 'recorded',
    },
  });
}
