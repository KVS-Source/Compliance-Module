declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string;
        permissions: string[];
      };
    }
  }
}

export {};
