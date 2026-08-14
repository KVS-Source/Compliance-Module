import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/common/errors/app-error.js";
import { UserImportService } from "../src/modules/users/import-service.js";
import type { UsersRepository } from "../src/modules/users/repository.js";
import {
  MAX_USER_IMPORT_ROWS,
  USER_IMPORT_HEADERS,
  parseUserImportCsv,
  resolveRoleCode,
  userImportTemplateBody,
} from "../src/modules/users/import-template.js";

const HEADER = USER_IMPORT_HEADERS.join(",");

/**
 * The import service reads two collections before validating a batch. Nothing
 * else is touched until a row is committed, so a preview and the commit
 * permission gate can both be exercised without a database.
 */
const fakeDb = (
  departments: Array<{ id: string; name: string }> = [],
  existingUsers: Array<{ code: string; email: string }> = [],
) =>
  ({
    orgDepartment: { findMany: async () => departments },
    user: { findMany: async () => existingUsers },
  }) as unknown as PrismaClient;

const service = (
  departments?: Array<{ id: string; name: string }>,
  existingUsers?: Array<{ code: string; email: string }>,
) =>
  new UserImportService(
    fakeDb(departments, existingUsers),
    {} as UsersRepository,
  );

const ADMIN_PERMISSIONS = ["users:read", "users:write", "roles:assign"];
const WRITE_ONLY_PERMISSIONS = ["users:read", "users:write"];

describe("bulk user import template", () => {
  it("publishes a template whose header row is the approved contract", () => {
    const body = userImportTemplateBody();
    expect(body.split("\r\n")[0]).toBe(HEADER);
  });

  it("emits sample values that survive a spreadsheet round trip", () => {
    // A leading "+", "=", "-" or "@" would be neutralised with an apostrophe
    // by the shared CSV writer and come back as a different value.
    const [, ...sampleLines] = userImportTemplateBody().trim().split("\r\n");
    for (const line of sampleLines) {
      expect(line).not.toContain("'");
    }
  });

  it("accepts a role by profile code or by the name shown in the product", () => {
    expect(resolveRoleCode("DEPARTMENT_OWNER")).toBe("DEPARTMENT_OWNER");
    expect(resolveRoleCode("Department Owner")).toBe("DEPARTMENT_OWNER");
    expect(resolveRoleCode("reviewer/approver")).toBe("REVIEWER_APPROVER");
    expect(resolveRoleCode("Superuser")).toBeUndefined();
    expect(resolveRoleCode("*")).toBeUndefined();
  });

  it("refuses a file whose headers are not the approved template", () => {
    expect(() =>
      parseUserImportCsv("Code,Name,Email\nU-1,User 1,user1@example.test\n"),
    ).toThrow(AppError);
  });

  it("refuses a file with a header row and no data", () => {
    expect(() => parseUserImportCsv(`${HEADER}\n`)).toThrow(AppError);
  });

  it("refuses more rows than one governed import may carry", () => {
    const row = "U-1,User 1,user1@example.test,,,,\n";
    const csv = `${HEADER}\n${row.repeat(MAX_USER_IMPORT_ROWS + 1)}`;
    expect(() => parseUserImportCsv(csv)).toThrow(
      `CSV exceeds the ${MAX_USER_IMPORT_ROWS} row limit for one user import`,
    );
  });

  it("numbers rows by data line so an error points at the file", () => {
    const rows = parseUserImportCsv(
      `${HEADER}\nU-1,User 1,user1@example.test,,,,\nU-2,User 2,user2@example.test,,,,\n`,
    );
    expect(rows.map((row) => row.line)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({ code: "U-2", email: "user2@example.test" });
  });
});

describe("bulk user import preview", () => {
  it("validates fields, in-file duplicates and live conflicts per row", async () => {
    const result = await service(
      [{ id: "11111111-1111-1111-1111-111111111111", name: "Compliance" }],
      [{ code: "U-TAKEN", email: "taken@example.test" }],
    ).preview(
      "tenant-1",
      ADMIN_PERMISSIONS,
      [
        HEADER,
        "U-1,User 1,user1@example.test,,Compliance,Department Owner,ACTIVE",
        "U 2,User 2,user2@example.test,,,,",
        "U-3,,not-an-email,,,,",
        "U-4,User 4,user1@example.test,,,,",
        "U-TAKEN,User 5,fresh@example.test,,,,",
        "U-6,User 6,taken@example.test,,,,",
        "U-7,User 7,user7@example.test,,Research,,",
        "U-8,User 8,user8@example.test,,,Superuser,",
        "U-9,User 9,user9@example.test,,,,PENDING",
        "",
      ].join("\n"),
    );

    expect(result.totalRows).toBe(9);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(8);
    expect(result.canAssignRoles).toBe(true);

    const byLine = new Map(result.rows.map((row) => [row.line, row]));
    expect(byLine.get(1)?.candidate).toMatchObject({
      code: "U-1",
      name: "User 1",
      email: "user1@example.test",
      departmentId: "11111111-1111-1111-1111-111111111111",
      departmentName: "Compliance",
      roleCode: "DEPARTMENT_OWNER",
      status: "ACTIVE",
      phone: null,
    });
    expect(byLine.get(2)?.errors.join(" ")).toContain("User Code");
    expect(byLine.get(3)?.errors.join(" ")).toContain("Full Name is required");
    expect(byLine.get(3)?.errors.join(" ")).toContain("not a valid address");
    expect(byLine.get(4)?.errors.join(" ")).toContain("repeated earlier");
    expect(byLine.get(5)?.errors.join(" ")).toContain(
      "User Code is already in use",
    );
    expect(byLine.get(6)?.errors.join(" ")).toContain(
      "Email is already in use",
    );
    expect(byLine.get(7)?.errors.join(" ")).toContain(
      'Department "Research" is not an active department in this Company',
    );
    expect(byLine.get(8)?.errors.join(" ")).toContain(
      'Role "Superuser" is not a sanctioned access profile',
    );
    expect(byLine.get(9)?.errors.join(" ")).toContain("Status must be one of");
  });

  it("never reports which Company already holds a conflicting identity", async () => {
    const result = await service(
      [],
      [{ code: "U-OTHER", email: "other@example.test" }],
    ).preview(
      "tenant-1",
      ADMIN_PERMISSIONS,
      `${HEADER}\nU-OTHER,User Other,other@example.test,,,,\n`,
    );
    const message = result.rows[0]?.errors.join(" ") ?? "";
    expect(message).toContain("already in use");
    expect(message.toLowerCase()).not.toContain("company");
    expect(message.toLowerCase()).not.toContain("tenant");
  });

  it("refuses a role column to an actor without roles:assign", async () => {
    const result = await service().preview(
      "tenant-1",
      WRITE_ONLY_PERMISSIONS,
      [
        HEADER,
        "U-1,User 1,user1@example.test,,,Compliance Manager,",
        "U-2,User 2,user2@example.test,,,,",
      ].join("\n"),
    );

    expect(result.canAssignRoles).toBe(false);
    expect(result.rows[0]?.valid).toBe(false);
    expect(result.rows[0]?.errors.join(" ")).toContain("roles:assign");
    // A file without roles is still importable by a user administrator.
    expect(result.rows[1]?.valid).toBe(true);
  });
});

describe("bulk user import commit", () => {
  it("refuses role assignment without roles:assign before any write", async () => {
    await expect(
      service().commit(
        "tenant-1",
        "actor-1",
        WRITE_ONLY_PERMISSIONS,
        {
          initialPassword: "Initial001!Secure",
          rows: [
            {
              code: "U-1",
              name: "User 1",
              email: "user1@example.test",
              roleCode: "COMPLIANCE_MANAGER",
            },
          ],
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
