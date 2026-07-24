import { Request, Response, NextFunction } from 'express';

import { unauthorized } from '../utils/errors';

// Guarantees a tenant context exists (auth middleware must run first). Every
// tenant-scoped controller reads the client id through getClientId().
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.currentUser || !req.clientId) {
    next(unauthorized());
    return;
  }
  next();
}

export function getClientId(req: Request): string {
  if (!req.clientId) {
    throw unauthorized();
  }
  return req.clientId;
}
