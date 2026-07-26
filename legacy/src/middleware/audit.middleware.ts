import { Request } from 'express';

import { CurrentUser } from '../types';

export interface ActorContext {
  user: CurrentUser;
  ip?: string | null;
  userAgent?: string | null;
}

// Builds the "who is doing this" context that services pass to writeAudit, so
// every audit row captures the acting user, their client, IP and user agent.
export function getActor(req: Request): ActorContext {
  return {
    user: req.currentUser!,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
