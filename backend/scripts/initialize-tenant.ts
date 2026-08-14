import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { initializeTenantUser } from "../src/production/tenant-initializer.js";
import { isProductionRoleCode } from "../src/production/access-profile.js";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const main = async () => {
  if (env.NODE_ENV !== "production") {
    throw new Error("Tenant initialization requires NODE_ENV=production");
  }
  const roleCode = required("INITIAL_USER_ROLE");
  if (!isProductionRoleCode(roleCode)) {
    throw new Error("INITIAL_USER_ROLE is not an approved production role");
  }
  const passwordPath = resolve(required("INITIAL_USER_PASSWORD_FILE"));
  const passwordFile = await stat(passwordPath);
  if (!passwordFile.isFile() || (passwordFile.mode & 0o077) !== 0) {
    throw new Error(
      "INITIAL_USER_PASSWORD_FILE must be a regular file with mode 0600",
    );
  }
  const password = (await readFile(passwordPath, "utf8")).replace(
    /[\r\n]+$/,
    "",
  );
  const result = await initializeTenantUser(prisma, {
    companyCode: required("INITIAL_COMPANY_CODE"),
    companyName: required("INITIAL_COMPANY_NAME"),
    userCode: required("INITIAL_USER_CODE"),
    fullName: required("INITIAL_USER_NAME"),
    email: required("INITIAL_USER_EMAIL"),
    ...(process.env.INITIAL_USER_PHONE?.trim()
      ? { phone: process.env.INITIAL_USER_PHONE.trim() }
      : {}),
    password,
    roleCode,
  });
  process.stdout.write(`${JSON.stringify({ success: true, data: result })}\n`);
};

void main()
  .catch(() => {
    process.stderr.write(
      "Tenant initialization failed; review operator inputs and server logs.\n",
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
