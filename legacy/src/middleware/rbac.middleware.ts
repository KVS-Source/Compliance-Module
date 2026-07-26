import { Request, Response, NextFunction } from 'express';

import { CurrentUser } from '../types';
import { forbidden, unauthorized } from '../utils/errors';

function requireUser(req: Request): CurrentUser {
  if (!req.currentUser) {
    throw unauthorized();
  }
  return req.currentUser;
}

// Tenant superusers and platform admins implicitly hold every permission.
export function userHasPermission(user: CurrentUser, code: string): boolean {
  return user.is_superuser || user.is_platform_admin || user.permissions.includes(code);
}

// requirePermission("kpi.view"), requirePermission("evidence.approve"), ...
export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = requireUser(req);
      if (!userHasPermission(user, code)) {
        throw forbidden(`Permission '${code}' is required to do this`);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSuperuser(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = requireUser(req);
    if (!user.is_superuser && !user.is_platform_admin) {
      throw forbidden('Tenant superuser access is required');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = requireUser(req);
    if (!user.is_platform_admin) {
      throw forbidden('Platform administrator access is required');
    }
    next();
  } catch (error) {
    next(error);
  }
}

// HR access is needed for sensitive employee fields (exit_reason, exit_date).
// TODO: extend with a dedicated HR permission code once fine-grained RBAC lands.
export function hasHrAccess(user: CurrentUser): boolean {
  return user.is_superuser || user.is_platform_admin || user.is_hr;
}

export function requireHrAccess(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = requireUser(req);
    if (!hasHrAccess(user)) {
      throw forbidden('HR access (HR role, tenant superuser or platform admin) is required');
    }
    next();
  } catch (error) {
    next(error);
  }
}
