import { createHmac, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export interface AccessClaims {
  sub: string;
  tenantId: string;
  permissions: string[];
  type: "access";
}

export const signAccessToken = (claims: Omit<AccessClaims, "type">) =>
  jwt.sign({ ...claims, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as NonNullable<jwt.SignOptions["expiresIn"]>,
    issuer: env.JWT_ISSUER,
    audience: "genbioca-frontend",
    jwtid: randomUUID(),
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: "genbioca-frontend",
  }) as AccessClaims;

export const newRefreshToken = () => ({
  raw: randomBytes(48).toString("base64url"),
  familyId: randomUUID(),
});

export const hashToken = (token: string) =>
  createHmac("sha256", env.REFRESH_TOKEN_SECRET ?? env.JWT_ACCESS_SECRET)
    .update(token)
    .digest("hex");
