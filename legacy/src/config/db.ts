import { PrismaClient } from '@prisma/client';

// A single shared Prisma client for the whole app. Creating the client does not
// open a database connection until the first query runs, so importing this module
// is safe even when no database is available (for example in unit tests).
export const prisma = new PrismaClient();

export type Db = PrismaClient;
