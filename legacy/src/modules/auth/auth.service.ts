import { prisma } from '../../config/db';
import { writeAudit } from '../../utils/audit';
import { unauthorized } from '../../utils/errors';
import { signAccessToken } from '../../utils/jwt';
import { verifyPassword } from '../../utils/password';
import { LoginInput } from './auth.validation';

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// Email is unique per client, so login requires the client slug too.
export async function login(input: LoginInput, meta: RequestMeta) {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email.toLowerCase(),
      is_active: true,
      client: { slug: input.client_slug, status: 'active' },
    },
  });

  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  if (!passwordOk) {
    // The user is identifiable, so record the failed attempt.
    await writeAudit(prisma, {
      clientId: user.client_id,
      userId: user.id,
      module: 'auth',
      action: 'login_failed',
      recordId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw unauthorized('Invalid credentials');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    await writeAudit(tx, {
      clientId: user.client_id,
      userId: user.id,
      module: 'auth',
      action: 'login',
      recordId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });

  return {
    access_token: signAccessToken(user.id, user.client_id),
    token_type: 'bearer',
  };
}
