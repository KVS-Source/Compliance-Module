import { Request } from 'express';

// Turns ?offset=&limit= query params into Prisma skip/take values, capped so a
// caller cannot request an unbounded page.
export function parsePagination(req: Request): { skip: number; take: number } {
  const offset = Number(req.query.offset);
  const limit = Number(req.query.limit);
  const skip = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
  return { skip, take };
}
