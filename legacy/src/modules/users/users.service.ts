import { prisma } from '../../config/db';
import { ActorContext } from '../../middleware/audit.middleware';
import { writeAudit } from '../../utils/audit';
import { notFound } from '../../utils/errors';
import { hashPassword } from '../../utils/password';

// Never return password_hash to clients.
const publicSelect = {
  id: true,
  client_id: true,
  email: true,
  full_name: true,
  status: true,
  is_active: true,
  is_superuser: true,
  is_platform_admin: true,
  is_hr: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
} as const;

export function list(clientId: string, opts: { skip?: number; take?: number } = {}) {
  return prisma.user.findMany({
    where: { client_id: clientId },
    orderBy: { email: 'asc' },
    skip: opts.skip,
    take: opts.take,
    select: publicSelect,
  });
}

export async function get(clientId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, client_id: clientId }, select: publicSelect });
  if (!user) {
    throw notFound('User not found');
  }
  return user;
}

export async function create(
  actor: ActorContext,
  input: { email: string; password: string; full_name: string; is_superuser?: boolean; is_hr?: boolean },
) {
  const clientId = actor.user.client_id;
  const data = {
    email: input.email.toLowerCase(),
    full_name: input.full_name,
    is_superuser: input.is_superuser ?? false,
    is_hr: input.is_hr ?? false,
    password_hash: await hashPassword(input.password),
  };

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { client_id: clientId, ...data }, select: publicSelect });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'user',
      action: 'create',
      recordId: user.id,
      newValue: { email: data.email, full_name: data.full_name },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return user;
  });
}

export async function update(actor: ActorContext, id: string, data: Record<string, unknown>) {
  const clientId = actor.user.client_id;
  const existing = await prisma.user.findFirst({ where: { id, client_id: clientId }, select: publicSelect });
  if (!existing) {
    throw notFound('User not found');
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data, select: publicSelect });
    await writeAudit(tx, {
      clientId,
      userId: actor.user.id,
      module: 'user',
      action: 'update',
      recordId: id,
      oldValue: existing,
      newValue: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return user;
  });
}
