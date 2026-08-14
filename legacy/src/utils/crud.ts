import { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '../config/db';
import { ActorContext } from '../middleware/audit.middleware';
import { writeAudit } from './audit';
import { findTenantOr404 } from './tenant';

type DbClient = PrismaClient | Prisma.TransactionClient;
// A delegate function returns the right Prisma model for either the shared client
// or a transaction client, e.g. (db) => db.department.
type DelegateFn = (db: DbClient) => any;

export interface TenantCrudConfig {
  auditModule: string;
  delegate: DelegateFn;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

// A tiny reusable CRUD service for straightforward tenant-scoped master tables.
// Every create/update is wrapped in a transaction together with its audit row.
export function createTenantCrud(cfg: TenantCrudConfig) {
  const name = cfg.auditModule;

  return {
    list(
      clientId: string,
      opts: { skip?: number; take?: number; where?: Record<string, unknown> } = {},
    ) {
      return cfg.delegate(prisma).findMany({
        where: { client_id: clientId, ...(opts.where ?? {}) },
        orderBy: cfg.orderBy,
        skip: opts.skip,
        take: opts.take,
      });
    },

    get(clientId: string, id: string) {
      return findTenantOr404(cfg.delegate(prisma), id, clientId, name);
    },

    async create(actor: ActorContext, data: Record<string, unknown>) {
      const clientId = actor.user.client_id;
      return prisma.$transaction(async (tx) => {
        const record = await cfg.delegate(tx).create({ data: { client_id: clientId, ...data } });
        await writeAudit(tx, {
          clientId,
          userId: actor.user.id,
          module: name,
          action: 'create',
          recordId: record.id,
          newValue: data,
          ip: actor.ip,
          userAgent: actor.userAgent,
        });
        return record;
      });
    },

    async update(actor: ActorContext, id: string, data: Record<string, unknown>) {
      const clientId = actor.user.client_id;
      const existing = await findTenantOr404(cfg.delegate(prisma), id, clientId, name);
      return prisma.$transaction(async (tx) => {
        const record = await cfg.delegate(tx).update({ where: { id }, data });
        await writeAudit(tx, {
          clientId,
          userId: actor.user.id,
          module: name,
          action: 'update',
          recordId: id,
          oldValue: existing,
          newValue: data,
          ip: actor.ip,
          userAgent: actor.userAgent,
        });
        return record;
      });
    },
  };
}
