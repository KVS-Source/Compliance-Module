import argon2 from "argon2";
import { z } from "zod";

/**
 * The single password strength rule for the platform. Extracted verbatim from
 * the users module so an admin setting a password via `PATCH /users/:id` and a
 * user changing their own password cannot drift apart.
 */
export const passwordSchema = z.string().min(8).max(256);

/** The single Argon2id configuration used everywhere a password is stored. */
export const hashPassword = (plaintext: string) =>
  argon2.hash(plaintext, { type: argon2.argon2id });

/** Verifies a plaintext against a stored Argon2 hash. Never logs either value. */
export const verifyPassword = (hash: string, plaintext: string) =>
  argon2.verify(hash, plaintext);
