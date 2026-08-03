import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { initializeClientUser } from "../src/production/client-initializer.js";
import { isProductionRoleCode } from "../src/production/access-profile.js";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const main = async () => {
  if (env.NODE_ENV !== "production") {
    throw new Error("Client initialization requires NODE_ENV=production");
  }
  const roleCode = required("CLIENT_USER_ROLE");
  if (!isProductionRoleCode(roleCode)) {
    throw new Error("CLIENT_USER_ROLE is not an approved production role");
  }
  const passwordPath = resolve(required("CLIENT_USER_PASSWORD_FILE"));
  const passwordFile = await stat(passwordPath);
  if (!passwordFile.isFile() || (passwordFile.mode & 0o077) !== 0) {
    throw new Error(
      "CLIENT_USER_PASSWORD_FILE must be a regular file with mode 0600",
    );
  }
  const password = (await readFile(passwordPath, "utf8")).replace(
    /[\r\n]+$/,
    "",
  );
  const result = await initializeClientUser(prisma, {
    companyCode: required("CLIENT_COMPANY_CODE"),
    companyName: required("CLIENT_COMPANY_NAME"),
    userCode: required("CLIENT_USER_CODE"),
    fullName: required("CLIENT_USER_NAME"),
    email: required("CLIENT_USER_EMAIL"),
    ...(process.env.CLIENT_USER_PHONE?.trim()
      ? { phone: process.env.CLIENT_USER_PHONE.trim() }
      : {}),
    password,
    roleCode,
  });
  process.stdout.write(`${JSON.stringify({ success: true, data: result })}\n`);
};

void main()
  .catch(() => {
    process.stderr.write(
      "Client initialization failed; review operator inputs and server logs.\n",
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
