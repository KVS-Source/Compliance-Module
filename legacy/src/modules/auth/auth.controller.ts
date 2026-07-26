import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler';
import * as authService from './auth.service';
import { loginSchema } from './auth.validation';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
  res.json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json(req.currentUser);
});
