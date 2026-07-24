import { CurrentUser } from './types';

// Augment Express Request with the authenticated user and tenant id that our
// middleware attaches. Kept in one place so every controller is strongly typed.
declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      clientId?: string;
    }
  }
}

export {};
