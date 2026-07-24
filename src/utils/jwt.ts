import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { JwtPayload } from '../types';

export function signAccessToken(userId: string, clientId: string): string {
  const payload: JwtPayload = { sub: userId, client_id: clientId, type: 'access' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}
