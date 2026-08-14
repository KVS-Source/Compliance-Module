declare global {
  namespace Express {
    interface Request {
      id?: string;
      auth?: {
        userId: string;
        tenantId: string;
        permissions: string[];
        /** Present when the access token was issued with a known refresh family. */
        sessionFamilyId?: string;
      };
    }
  }
}

export {};
