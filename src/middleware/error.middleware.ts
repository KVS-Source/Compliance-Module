import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { env } from '../config/env';
import { AppError } from '../utils/errors';

// Central error handler. Turns known error types into clean, beginner-friendly
// JSON responses and hides internal details for unexpected 500s.
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed. Please check the highlighted fields.',
      details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with these values already exists.' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'The requested record was not found.' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'A referenced record does not exist.' });
      return;
    }
  }

  // Unknown / unexpected error.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Something went wrong on our side. Please try again.',
    ...(env.isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}

export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
