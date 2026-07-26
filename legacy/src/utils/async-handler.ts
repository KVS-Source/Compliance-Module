import { NextFunction, Request, Response } from 'express';

type AsyncController = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Wraps an async controller so any thrown/rejected error is forwarded to the
// central error middleware instead of crashing the process.
export const asyncHandler =
  (controller: AsyncController) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
