import {
  FieldParseError,
  normaliseDate,
  normalisePercentage,
  normaliseText,
} from "../normalise.js";
import type { SheetTable } from "../sheet-table.js";
import {
  type CommitResult,
  type SheetImporter,
  type ValidatedRow,
  rowError,
} from "../types.js";
import { flagDuplicateKeys } from "./masters.js";

const safeDate = (
  value: ReturnType<SheetTable["rows"][number]["cell"]>,
  label: string,
  errors: { field: string; message: string }[],
) => {
  try {
    return normaliseDate(value) ?? null;
  } catch (error) {
    errors.push(
      rowError(
        label,
        error instanceof FieldParseError ? error.message : "Invalid date",
      ),
    );
    return null;
  }
};

/**
 * `20_Policy_Register` — one policy plus its current version.
 *
 * The workbook's `Storage Path / Link` is a path inside the client's own
 * document store. It is recorded as the version's reference text, never as an
 * approved policy document held by this platform, so the policy approval gate
 * still requires real evidence before the version can be approved here.
 */
export const policyImporter: SheetImporter = {
  key: "policies",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("policy id"));
      if (code === undefined) continue;
      const title = normaliseText(row.cell("title"));
      const errors: { field: string; message: string }[] = [];
      if (title === undefined)
        errors.push(rowError("Title", "Title is required"));
      const effectiveDate = safeDate(
        row.cell("effective date"),
        "Effective Date",
        errors,
      );
      const reviewDate = safeDate(
        row.cell("next review"),
        "Next Review",
        errors,
      );
      const version = normaliseText(row.cell("version")) ?? "1.0";
      const [major, minor] = version.split(".");
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          title: title ?? null,
          versionMajor: Number.parseInt(major ?? "1", 10) || 1,
          versionMinor: Number.parseInt(minor ?? "0", 10) || 0,
          effectiveDate: effectiveDate?.toISOString() ?? null,
          reviewDate: reviewDate?.toISOString() ?? null,
          frameworkReference: normaliseText(row.cell("framework")) ?? null,
          storagePath: normaliseText(row.cell("storage path link")) ?? null,
          acknowledgementPct: normalisePercentage(row.cell("acknowl")) ?? null,
          workbookStatus: normaliseText(row.cell("status")) ?? null,
          ownerRef: normaliseText(row.cell("owner")) ?? null,
          approverRef: normaliseText(row.cell("approver")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Policy ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    let highestImportedNumber = 0;
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        title: string;
        versionMajor: number;
        versionMinor: number;
        effectiveDate: string | null;
        reviewDate: string | null;
        frameworkReference: string | null;
        storagePath: string | null;
        workbookStatus: string | null;
      };
      const existing = await context.tx.policy.findUnique({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        select: { id: true },
      });
      const policy = await context.tx.policy.upsert({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        update: { title: payload.title, updatedById: context.actorUserId },
        create: {
          tenantId: context.tenantId,
          code: payload.code,
          title: payload.title,
          createdById: context.actorUserId,
          updatedById: context.actorUserId,
        },
        select: { id: true, nextVersionSequence: true },
      });

      const existingVersion = await context.tx.policyVersion.findFirst({
        where: {
          tenantId: context.tenantId,
          policyId: policy.id,
          versionMajor: payload.versionMajor,
          versionMinor: payload.versionMinor,
        },
        select: { id: true },
      });
      const content =
        payload.storagePath === null
          ? `Imported policy record for ${payload.code}. No document content was supplied by the workbook.`
          : `Imported policy record for ${payload.code}. The client document store reference is "${payload.storagePath}". ` +
            "This platform holds no copy of that document; upload and approve evidence before relying on it.";
      const versionData = {
        content,
        effectiveDate: payload.effectiveDate
          ? new Date(payload.effectiveDate)
          : null,
        reviewDate: payload.reviewDate ? new Date(payload.reviewDate) : null,
        changeSummary: payload.workbookStatus
          ? `Workbook status at import: ${payload.workbookStatus}`
          : null,
        updatedById: context.actorUserId,
      };
      const version = existingVersion
        ? await context.tx.policyVersion.update({
            where: { id: existingVersion.id },
            data: versionData,
            select: { id: true },
          })
        : await context.tx.policyVersion.create({
            data: {
              ...versionData,
              tenantId: context.tenantId,
              policyId: policy.id,
              sequence: policy.nextVersionSequence,
              versionMajor: payload.versionMajor,
              versionMinor: payload.versionMinor,
              // Imported policies stay DRAFT. Approval requires linked,
              // approved evidence, and an imported path is not evidence.
              status: "DRAFT",
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      if (!existingVersion) {
        await context.tx.policy.update({
          where: { id: policy.id },
          data: { nextVersionSequence: { increment: 1 } },
        });
      }

      const frameworkId = context.frameworks.resolvePrimary(
        payload.frameworkReference,
      );
      if (frameworkId) {
        await context.tx.policyFramework.upsert({
          where: {
            tenantId_policyVersionId_frameworkId: {
              tenantId: context.tenantId,
              policyVersionId: version.id,
              frameworkId,
            },
          },
          update: { isActive: true, updatedById: context.actorUserId },
          create: {
            tenantId: context.tenantId,
            policyId: policy.id,
            policyVersionId: version.id,
            frameworkId,
            createdById: context.actorUserId,
            updatedById: context.actorUserId,
          },
        });
      }

      const numbered = /^POL-0*(\d+)$/i.exec(payload.code);
      if (numbered) {
        highestImportedNumber = Math.max(
          highestImportedNumber,
          Number(numbered[1]),
        );
      }
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "policies",
        destinationRecordId: policy.id,
      });
    }

    // Imported POL-nnn codes share the space `formatPolicyCode` allocates
    // from, so the counter is advanced past them before the API can mint a
    // code that already belongs to an imported policy.
    if (highestImportedNumber > 0) {
      const tenant = await context.tx.tenant.findUnique({
        where: { id: context.tenantId },
        select: { nextPolicyNumber: true },
      });
      if (tenant && tenant.nextPolicyNumber <= highestImportedNumber) {
        await context.tx.tenant.update({
          where: { id: context.tenantId },
          data: { nextPolicyNumber: highestImportedNumber + 1 },
        });
      }
    }
    return results;
  },
};

/**
 * `08_Evidence_Register` — evidence metadata only.
 *
 * The workbook's `File Link / Path` column names a file on the client's own
 * storage. Importing it must never imply this platform holds those bytes, so
 * the path lands in `sourceFileReference` while `storageKey`, `contentSha256`
 * and `byteSize` stay null. Imported evidence is therefore DRAFT and cannot
 * satisfy an approval gate until a real file is uploaded and approved.
 */
export const evidenceImporter: SheetImporter = {
  key: "evidence",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("evidence id"));
      if (code === undefined) continue;
      const title = normaliseText(row.cell("title"));
      const errors: { field: string; message: string }[] = [];
      if (title === undefined)
        errors.push(rowError("Title", "Title is required"));
      const issueDate = safeDate(
        row.cell("upload date"),
        "Upload Date",
        errors,
      );
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          title: title ?? null,
          type: normaliseText(row.cell("type")) ?? null,
          department: normaliseText(row.cell("department")) ?? null,
          frameworkReference:
            normaliseText(row.cell("primary framework")) ?? null,
          mappedClauses:
            normaliseText(row.cell("mapped clauses cross framework")) ?? null,
          issueDate: issueDate?.toISOString() ?? null,
          version: normaliseText(row.cell("version")) ?? null,
          workbookStatus: normaliseText(row.cell("status")) ?? null,
          sourceFileReference:
            normaliseText(row.cell("file link path")) ?? null,
        },
        errors,
      });
    }
    return flagDuplicateKeys(rows, "Evidence ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        title: string;
        type: string | null;
        department: string | null;
        mappedClauses: string | null;
        issueDate: string | null;
        version: string | null;
        workbookStatus: string | null;
        sourceFileReference: string | null;
      };
      const departmentId = payload.department
        ? (context.departments.get(payload.department.toLowerCase()) ?? null)
        : null;
      const descriptionParts = [
        payload.type ? `Type: ${payload.type}.` : null,
        payload.version ? `Workbook version: ${payload.version}.` : null,
        payload.workbookStatus
          ? `Workbook status: ${payload.workbookStatus}.`
          : null,
        payload.mappedClauses
          ? `Mapped clauses: ${payload.mappedClauses}.`
          : null,
        payload.sourceFileReference
          ? "No file is held by this platform for this record; the workbook path is a client-side reference only."
          : null,
      ].filter((part): part is string => part !== null);

      const existing = await context.tx.evidence.findUnique({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        select: { id: true },
      });
      const data = {
        title: payload.title,
        description: descriptionParts.join(" ") || null,
        departmentId,
        issueDate: payload.issueDate ? new Date(payload.issueDate) : null,
        sourceFileReference: payload.sourceFileReference,
        updatedById: context.actorUserId,
      };
      const evidence = existing
        ? await context.tx.evidence.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.evidence.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              code: payload.code,
              // Metadata without bytes is DRAFT: it must not be presentable as
              // approved evidence anywhere a gate is enforced.
              lifecycleStatus: "DRAFT",
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      context.evidence.set(payload.code, evidence.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "evidence",
        destinationRecordId: evidence.id,
      });
    }
    return results;
  },
};
