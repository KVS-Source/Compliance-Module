import { Request, Response, NextFunction } from 'express';

import { prisma } from '../config/db';
import { CurrentUser } from '../types';
import { unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';

// Verifies the Bearer token, loads the active user for the token's client, and
// attaches the current user (with flattened permission codes) plus the tenant id.
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw unauthorized();
    }

    let payload;
    try {
      payload = verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      throw unauthorized();
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, client_id: payload.client_id, is_active: true },
      include: {
        user_roles: {
          include: { role: { include: { role_permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) {
      throw unauthorized();
    }

    const permissions = new Set<string>();
    for (const userRole of user.user_roles) {
      for (const rolePermission of userRole.role.role_permissions) {
        if (rolePermission.permission.status === 'active') {
          permissions.add(rolePermission.permission.code);
        }
      }
    }

    const currentUser: CurrentUser = {
      id: user.id,
      client_id: user.client_id,
      email: user.email,
      full_name: user.full_name,
      is_active: user.is_active,
      is_superuser: user.is_superuser,
      is_platform_admin: user.is_platform_admin,
      is_hr: user.is_hr,
      permissions: [...permissions],
    };

    req.currentUser = currentUser;
    req.clientId = user.client_id;
    next();
  } catch (error) {
    next(error);
  }
}
