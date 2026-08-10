import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { permissionAllowed } from "../../common/middleware/http.js";
import { hashPassword } from "../../common/security/password.js";
import {
  bindUserToProductionRole,
  provisionProductionRole,
} from "../access/role-provisioning.js";
import type { ProductionRoleCode } from "../../production/access-profile.js";
import type { UsersRepository } from "./repository.js";
import {
  codeSchema,
  emailSchema,
  nameSchema,
  parseUserImportCsv,
  phoneSchema,
  resolveRoleCode,
  USER_IMPORT_STATUSES,
  type ParsedImportRow,
  type UserImportStatus,
} from "./import-template.js";

/** A row that passed validation and is safe to offer for commit. */
export type ImportUserCandidate = {
  line: number;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roleCode: ProductionRoleCode | null;
  status: UserImportStatus;
};

type CandidateInput = {
  line: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  /** Set by the CSV path; resolved against this Company's departments. */
  departmentName: string | null;
  /** Set by the commit path, where the client already holds the id. */
  departmentId: string | null;
  role: string;
  status: string;
};

type ValidationContext = {
  departmentsByName: Map<string, { id: string; name: string }>;
  departmentsById: Map<string, { id: string; name: string }>;
  takenCodes: Set<string>;
  takenEmails: Set<string>;
  canAssignRoles: boolean;
};

export type ValidatedRow = {
  line: number;
  valid: boolean;
  errors: string[];
  candidate: ImportUserCandidate | null;
};

/**
 * Argon2id is deliberately memory-hard, so hashing a whole batch at once would
 * reserve its memory cost per row simultaneously. A small fixed concurrency
 * keeps a 200-row import quick without letting one request size its own memory
 * demand from user input.
 */
const HASH_CONCURRENCY = 4;

const hashInParallel = async (
  count: number,
  plaintext: string,
  shouldHash: (index: number) => boolean,
) => {
  const hashes: (string | null)[] = new Array(count).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= count) return;
      if (!shouldHash(index)) continue;
      hashes[index] = await hashPassword(plaintext);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(HASH_CONCURRENCY, count) }, worker),
  );
  return hashes;
};

/**
 * Bulk user import.
 *
 * Two governed steps, both server-authoritative:
 *
 * - **Preview** parses and validates the whole file against this Company's
 *   live data and writes nothing, so an administrator sees every problem
 *   before a single account exists.
 * - **Commit** re-validates and then creates **one record per governed
 *   request** — each user through the same repository call, audit event and
 *   role binding as `POST /users` plus `PUT /access/users/:id/roles`. A row
 *   the database refuses is reported; it never discards its valid neighbours.
 *
 * The file carries no credentials. The administrator supplies one initial
 * password with the commit request; it is hashed per user and never returned.
 */
export class UserImportService {
  constructor(
    private readonly db: PrismaClient,
    private readonly repository: UsersRepository,
  ) {}

  private async loadContext(
    tenantId: string,
    codes: readonly string[],
    emails: readonly string[],
    canAssignRoles: boolean,
  ): Promise<ValidationContext> {
    const [departments, existing] = await Promise.all([
      this.db.orgDepartment.findMany({
        where: { tenantId, status: "ACTIVE" },
        select: { id: true, name: true },
      }),
      codes.length === 0 && emails.length === 0
        ? Promise.resolve([])
        : this.db.user.findMany({
            where: {
              OR: [
                ...(codes.length > 0 ? [{ code: { in: [...codes] } }] : []),
                ...(emails.length > 0 ? [{ email: { in: [...emails] } }] : []),
              ],
            },
            select: { code: true, email: true },
          }),
    ]);

    return {
      departmentsByName: new Map(
        departments.map((department) => [
          department.name.trim().toLowerCase(),
          department,
        ]),
      ),
      departmentsById: new Map(
        departments.map((department) => [department.id, department]),
      ),
      takenCodes: new Set(existing.map((user) => user.code.toLowerCase())),
      takenEmails: new Set(existing.map((user) => user.email.toLowerCase())),
      canAssignRoles,
    };
  }

  /**
   * Field, catalogue, in-file duplicate and live-conflict validation for one
   * row. `seenCodes` / `seenEmails` accumulate across the batch so the second
   * occurrence of a duplicate is the one refused.
   */
  private validateRow(
    input: CandidateInput,
    context: ValidationContext,
    seenCodes: Set<string>,
    seenEmails: Set<string>,
  ): ValidatedRow {
    const errors: string[] = [];

    const code = codeSchema.safeParse(input.code);
    if (!code.success) {
      errors.push(
        input.code
          ? "User Code must be 1-64 letters, digits, hyphens or underscores"
          : "User Code is required",
      );
    }
    const name = nameSchema.safeParse(input.name);
    if (!name.success)
      errors.push("Full Name is required (max 200 characters)");

    const email = emailSchema.safeParse(input.email);
    if (!email.success) {
      errors.push(
        input.email ? "Email is not a valid address" : "Email is required",
      );
    }

    const phone = input.phone ? phoneSchema.safeParse(input.phone) : null;
    if (phone && !phone.success)
      errors.push("Phone must be 64 characters or fewer");

    if (code.success) {
      const key = code.data.toLowerCase();
      if (seenCodes.has(key)) {
        errors.push("User Code is repeated earlier in this file");
      } else if (context.takenCodes.has(key)) {
        // Codes and emails are unique across the platform, so a conflict may
        // belong to another Company. Never say which one.
        errors.push("User Code is already in use");
      }
      seenCodes.add(key);
    }
    if (email.success) {
      const key = email.data.toLowerCase();
      if (seenEmails.has(key)) {
        errors.push("Email is repeated earlier in this file");
      } else if (context.takenEmails.has(key)) {
        errors.push("Email is already in use");
      }
      seenEmails.add(key);
    }

    let departmentId: string | null = null;
    let departmentName: string | null = null;
    if (input.departmentId) {
      const department = context.departmentsById.get(input.departmentId);
      if (!department) {
        errors.push("Department does not belong to this Company");
      } else {
        departmentId = department.id;
        departmentName = department.name;
      }
    } else if (input.departmentName) {
      const department = context.departmentsByName.get(
        input.departmentName.trim().toLowerCase(),
      );
      if (!department) {
        errors.push(
          `Department "${input.departmentName}" is not an active department in this Company`,
        );
      } else {
        departmentId = department.id;
        departmentName = department.name;
      }
    }

    let roleCode: ProductionRoleCode | null = null;
    if (input.role) {
      const resolved = resolveRoleCode(input.role);
      if (!resolved) {
        errors.push(`Role "${input.role}" is not a sanctioned access profile`);
      } else if (!context.canAssignRoles) {
        errors.push(
          "Assigning a role requires the roles:assign permission; clear the Role column to import people without a role",
        );
      } else {
        roleCode = resolved;
      }
    }

    let status: UserImportStatus = "ACTIVE";
    if (input.status) {
      const upper = input.status.toUpperCase();
      if (!(USER_IMPORT_STATUSES as readonly string[]).includes(upper)) {
        errors.push(`Status must be one of ${USER_IMPORT_STATUSES.join(", ")}`);
      } else {
        status = upper as UserImportStatus;
      }
    }

    if (errors.length > 0 || !code.success || !name.success || !email.success) {
      return { line: input.line, valid: false, errors, candidate: null };
    }

    return {
      line: input.line,
      valid: true,
      errors: [],
      candidate: {
        line: input.line,
        code: code.data,
        name: name.data,
        email: email.data,
        phone: input.phone ? input.phone : null,
        departmentId,
        departmentName,
        roleCode,
        status,
      },
    };
  }

  private async validateAll(
    tenantId: string,
    inputs: readonly CandidateInput[],
    canAssignRoles: boolean,
  ) {
    const context = await this.loadContext(
      tenantId,
      inputs
        .map((input) => input.code.trim())
        .filter((value) => value.length > 0),
      inputs
        .map((input) => input.email.trim().toLowerCase())
        .filter((value) => value.length > 0),
      canAssignRoles,
    );
    const seenCodes = new Set<string>();
    const seenEmails = new Set<string>();
    return inputs.map((input) =>
      this.validateRow(input, context, seenCodes, seenEmails),
    );
  }

  /** Dry run. Parses, validates against live data and writes nothing. */
  async preview(
    tenantId: string,
    actorPermissions: readonly string[],
    csv: string,
  ) {
    const parsed = parseUserImportCsv(csv);
    const canAssignRoles = permissionAllowed(actorPermissions, "roles:assign");
    const rows = await this.validateAll(
      tenantId,
      parsed.map(toCandidateInput),
      canAssignRoles,
    );

    return {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      canAssignRoles,
      rows: rows.map((row, index) => ({
        line: row.line,
        valid: row.valid,
        errors: row.errors,
        source: parsed[index] ?? null,
        candidate: row.candidate,
      })),
    };
  }

  /**
   * Creates the supplied rows one at a time. Each user is its own transaction
   * and its own `USER_CREATE` audit event; each role binding is its own
   * `USER_ROLE_ASSIGN` event, so the audit trail is indistinguishable from the
   * same work done one screen at a time.
   */
  async commit(
    tenantId: string,
    actorUserId: string,
    actorPermissions: readonly string[],
    body: {
      initialPassword: string;
      rows: readonly {
        line?: number | undefined;
        code: string;
        name: string;
        email: string;
        phone?: string | null | undefined;
        departmentId?: string | null | undefined;
        roleCode?: string | null | undefined;
        status?: UserImportStatus | undefined;
      }[];
    },
    context: { ip?: string; userAgent?: string },
  ) {
    const canAssignRoles = permissionAllowed(actorPermissions, "roles:assign");
    const requestsRole = body.rows.some((row) => Boolean(row.roleCode));
    if (requestsRole && !canAssignRoles) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Assigning roles during import requires the roles:assign permission",
      );
    }

    const inputs: CandidateInput[] = body.rows.map((row, index) => ({
      line: row.line ?? index + 1,
      code: row.code,
      name: row.name,
      email: row.email,
      phone: row.phone ?? "",
      departmentName: null,
      departmentId: row.departmentId ?? null,
      role: row.roleCode ?? "",
      status: row.status ?? "",
    }));
    const validated = await this.validateAll(tenantId, inputs, canAssignRoles);

    const passwordHashes = await hashInParallel(
      validated.length,
      body.initialPassword,
      (index) => validated[index]?.valid === true,
    );

    // One provisioning pass per distinct role: the permission catalogue sync
    // is identical for every user holding the same profile.
    const roleIds = new Map<ProductionRoleCode, string>();
    for (const row of validated) {
      const roleCode = row.candidate?.roleCode;
      if (!roleCode || roleIds.has(roleCode)) continue;
      const role = await this.db.$transaction((transaction) =>
        provisionProductionRole(transaction, tenantId, roleCode),
      );
      roleIds.set(roleCode, role.id);
    }

    const results: Array<{
      line: number;
      code: string;
      email: string;
      outcome: "CREATED" | "FAILED";
      userId?: string;
      roleCode?: ProductionRoleCode;
      roleAssigned?: boolean;
      errors?: string[];
    }> = [];

    for (const [index, row] of validated.entries()) {
      const source = inputs[index]!;
      if (!row.valid || !row.candidate) {
        results.push({
          line: row.line,
          code: source.code,
          email: source.email,
          outcome: "FAILED",
          errors: row.errors,
        });
        continue;
      }

      const candidate = row.candidate;
      const passwordHash = passwordHashes[index];
      if (!passwordHash) {
        results.push({
          line: row.line,
          code: candidate.code,
          email: candidate.email,
          outcome: "FAILED",
          errors: ["Initial password could not be prepared"],
        });
        continue;
      }

      let userId: string;
      try {
        const created = await this.repository.createInTenant(
          tenantId,
          actorUserId,
          {
            code: candidate.code,
            fullName: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            passwordHash,
            status: candidate.status,
            departmentId: candidate.departmentId,
            defaultTenantId: tenantId,
          },
          context,
        );
        userId = created.id;
      } catch (error) {
        results.push({
          line: row.line,
          code: candidate.code,
          email: candidate.email,
          outcome: "FAILED",
          errors: [createFailureMessage(error)],
        });
        continue;
      }

      let roleAssigned = false;
      if (candidate.roleCode) {
        const roleId = roleIds.get(candidate.roleCode);
        try {
          if (!roleId) throw new Error("Role was not provisioned");
          await this.db.$transaction(async (transaction) => {
            const { assignment, disabledAssignmentCount } =
              await bindUserToProductionRole(transaction, {
                userId,
                tenantId,
                roleId,
                assignedBy: actorUserId,
              });
            await transaction.auditEvent.create({
              data: {
                tenantId,
                userId: actorUserId,
                action: "USER_ROLE_ASSIGN",
                entityType: "USER",
                entityId: userId,
                metadata: {
                  assignmentId: assignment.id,
                  roleCode: candidate.roleCode,
                  roleId,
                  disabledAssignmentCount,
                  source: "USER_IMPORT",
                } as Prisma.InputJsonValue,
                ...(context.ip ? { ipAddress: context.ip } : {}),
                ...(context.userAgent ? { userAgent: context.userAgent } : {}),
              },
            });
          });
          roleAssigned = true;
        } catch {
          // The account exists and is reported as created; the administrator
          // is told the role still has to be set from the Users screen.
          results.push({
            line: row.line,
            code: candidate.code,
            email: candidate.email,
            outcome: "CREATED",
            userId,
            roleCode: candidate.roleCode,
            roleAssigned: false,
            errors: [
              "The account was created but the role assignment failed; assign the role from Users",
            ],
          });
          continue;
        }
      }

      results.push({
        line: row.line,
        code: candidate.code,
        email: candidate.email,
        outcome: "CREATED",
        userId,
        ...(candidate.roleCode ? { roleCode: candidate.roleCode } : {}),
        roleAssigned,
      });
    }

    const created = results.filter((result) => result.outcome === "CREATED");
    const summary = {
      totalRows: results.length,
      created: created.length,
      failed: results.length - created.length,
      rolesAssigned: created.filter((result) => result.roleAssigned).length,
    };

    await this.db.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: "USER_IMPORT",
        entityType: "USER",
        metadata: {
          ...summary,
          createdUserCodes: created.map((result) => result.code),
        } as Prisma.InputJsonValue,
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });

    return { ...summary, results };
  }
}

const toCandidateInput = (row: ParsedImportRow): CandidateInput => ({
  line: row.line,
  code: row.code,
  name: row.name,
  email: row.email,
  phone: row.phone,
  departmentName: row.department ? row.department : null,
  departmentId: null,
  role: row.role,
  status: row.status,
});

/**
 * Import row failures are reported per row rather than as a request error, so
 * the message must be safe and specific without exposing schema internals.
 */
const createFailureMessage = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    return "User Code or Email was taken while the import was running";
  }
  if (error instanceof AppError) return error.message;
  return "The account could not be created";
};
