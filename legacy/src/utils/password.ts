import bcrypt from 'bcryptjs';

import { env } from '../config/env';

// bcryptjs is a pure-JS implementation of the bcrypt algorithm. It is used so the
// project installs and runs anywhere without native build tools. It is API- and
// hash-compatible with the native `bcrypt` package if you switch later.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
