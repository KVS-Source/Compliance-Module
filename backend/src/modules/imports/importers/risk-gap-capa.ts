import type {
  CapaPriority,
  CapaStatus,
  GapSeverity,
  GapStatus,
  RiskStatus,
  RiskTreatmentStrategy,
} from "@prisma/client";
import { generalLevelForScore } from "../../risks/service.js";
import {
  FieldParseError,
  mapEnum,
  mapEnumByPrefix,
  normaliseDate,
  normaliseInteger,
  normalisePercentage,
  normaliseText,
} from "../normalise.js";
import type { SheetTable } from "../sheet-table.js";
import {
  type CommitResult,
  type RowError,
  type SheetImporter,
  type ValidatedRow,
  rowError,
} from "../types.js";
import { flagDuplicateKeys } from "./masters.js";

const safeDate = (
  value: unknown,
  label: string,
  errors: RowError[],
): Date | null => {
  try {
    return normaliseDate(value as never) ?? null;
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

const RISK_STATUSES: Record<string, RiskStatus> = {
  Open: "OPEN",
  "Under Review": "UNDER_REVIEW",
  Treated: "TREATED",
  Closed: "CLOSED",
  Archived: "ARCHIVED",
};

const TREATMENTS: Record<string, RiskTreatmentStrategy> = {
  Avoid: "AVOID",
  Mitigate: "MITIGATE",
  Transfer: "TRANSFER",
  Accept: "ACCEPT",
};

/**
 * `18_Risk_Register` — the client's enterprise risk register.
 *
 * These rows carry a 1-5 likelihood/impact score and populate `generalLevel`.
 * `kpiRiskClass` is deliberately left null: Major/Minor is the KPI risk scale
 * and is only ever set by the KPI miss rule, never merged with the enterprise
 * level. See CONTRIBUTING.md, "Non-negotiable business rules".
 */
export const riskImporter: SheetImporter = {
  key: "risks",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("risk id"));
      if (code === undefined) continue;
      const errors: RowError[] = [];
      const description = normaliseText(row.cell("risk description"));
      if (description === undefined) {
        errors.push(rowError("Risk Description", "Description is required"));
      }
      let likelihood: number | undefined;
      let impact: number | undefined;
      try {
        likelihood = normaliseInteger(row.cell("inh prob 1 5"));
        impact = normaliseInteger(row.cell("inh impact 1 5"));
      } catch (error) {
        errors.push(
          rowError(
            "Inherent score",
            error instanceof FieldParseError ? error.message : "Invalid score",
          ),
        );
      }
      let reviewReason: string | undefined;
      // A 1-5 pair is mandatory for the score. When the workbook omits it the
      // row is still imported at the lowest rating and flagged, so a reviewer
      // sees a truthful "unrated" record instead of an invented severity.
      if (likelihood === undefined || impact === undefined) {
        reviewReason =
          "Inherent likelihood or impact was missing; defaulted to 1 and flagged for review";
        likelihood ??= 1;
        impact ??= 1;
      }
      if (likelihood < 1 || likelihood > 5 || impact < 1 || impact > 5) {
        errors.push(
          rowError("Inherent score", "Likelihood and impact must be 1-5"),
        );
      }
      const residualLikelihood = normaliseInteger(row.cell("res prob"));
      const residualImpact = normaliseInteger(row.cell("res impact"));
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          description: description ?? null,
          category: normaliseText(row.cell("category")) ?? null,
          frameworkReference: normaliseText(row.cell("framework tags")) ?? null,
          likelihood,
          impact,
          residualLikelihood: residualLikelihood ?? null,
          residualImpact: residualImpact ?? null,
          status: mapEnum(row.cell("status"), RISK_STATUSES) ?? "OPEN",
          treatment:
            mapEnumByPrefix(row.cell("treatment plan"), TREATMENTS) ?? null,
          reviewDate:
            safeDate(
              row.cell("review date"),
              "Review Date",
              errors,
            )?.toISOString() ?? null,
          ownerRef: normaliseText(row.cell("risk owner")) ?? null,
        },
        errors,
        ...(reviewReason ? { reviewReason } : {}),
      });
    }
    return flagDuplicateKeys(rows, "Risk ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    let highestImportedNumber = 0;
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        description: string;
        category: string | null;
        likelihood: number;
        impact: number;
        residualLikelihood: number | null;
        residualImpact: number | null;
        status: RiskStatus;
        treatment: RiskTreatmentStrategy | null;
        reviewDate: string | null;
      };
      const inherentScore = payload.likelihood * payload.impact;
      const residualScore =
        payload.residualLikelihood !== null && payload.residualImpact !== null
          ? payload.residualLikelihood * payload.residualImpact
          : null;
      const existing = await context.tx.risk.findUnique({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        select: { id: true },
      });
      const data = {
        title: payload.description.slice(0, 180),
        description: payload.description,
        category: payload.category,
        inherentLikelihood: payload.likelihood,
        inherentImpact: payload.impact,
        inherentScore,
        residualLikelihood: payload.residualLikelihood,
        residualImpact: payload.residualImpact,
        residualScore,
        generalLevel: generalLevelForScore(residualScore ?? inherentScore),
        status: payload.status,
        treatmentStrategy: payload.treatment,
        reviewDate: payload.reviewDate ? new Date(payload.reviewDate) : null,
        updatedById: context.actorUserId,
      };
      const risk = existing
        ? await context.tx.risk.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.risk.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              code: payload.code,
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      const numbered = /^RSK-0*(\d+)$/i.exec(payload.code);
      if (numbered) {
        highestImportedNumber = Math.max(
          highestImportedNumber,
          Number(numbered[1]),
        );
      }
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "risks",
        destinationRecordId: risk.id,
      });
    }

    // The workbook's enterprise risks occupy the same RSK-nnn code space that
    // `formatRiskCode` allocates from. Without reserving those numbers, the
    // KPI miss rule would allocate RSK-001 again and its automatic risk would
    // silently overwrite an imported one. Advancing the counter past the
    // highest imported number keeps both sets of risks intact.
    if (highestImportedNumber > 0) {
      const tenant = await context.tx.tenant.findUnique({
        where: { id: context.tenantId },
        select: { nextRiskNumber: true },
      });
      if (tenant && tenant.nextRiskNumber <= highestImportedNumber) {
        await context.tx.tenant.update({
          where: { id: context.tenantId },
          data: { nextRiskNumber: highestImportedNumber + 1 },
        });
      }
    }
    return results;
  },
};

const GAP_SEVERITIES: Record<string, GapSeverity> = {
  Critical: "CRITICAL",
  Major: "MAJOR",
  Minor: "MINOR",
  Observation: "OBSERVATION",
  OFI: "OFI",
  "NCR Major": "MAJOR",
  "NCR Minor": "MINOR",
};

const GAP_STATUSES: Record<string, GapStatus> = {
  Open: "OPEN",
  "In Progress": "IN_PROGRESS",
  Closed: "CLOSED",
  Cancelled: "CANCELLED",
};

/** `10_Gap_Analysis`. */
export const gapImporter: SheetImporter = {
  key: "gaps",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("gap id"));
      if (code === undefined) continue;
      const errors: RowError[] = [];
      const description = normaliseText(row.cell("gap description"));
      if (description === undefined) {
        errors.push(rowError("Gap Description", "Description is required"));
      }
      const severity = mapEnumByPrefix(row.cell("severity"), GAP_SEVERITIES);
      const status = mapEnum(row.cell("status"), GAP_STATUSES);
      let reviewReason: string | undefined;
      if (severity === undefined) {
        // Documented fallback: an unclassified gap is recorded at the lowest
        // actionable severity and flagged, never silently promoted.
        reviewReason =
          "Severity was missing or unrecognised; defaulted to OBSERVATION and flagged for review";
      }
      if (status === undefined) {
        errors.push(rowError("Status", "Status is not a recognised value"));
      }
      const closureNote = normaliseText(
        row.cell("recommended corrective action"),
      );
      if (status === "CLOSED" && closureNote === undefined) {
        errors.push(rowError("Status", "A closed gap requires a closure note"));
      }
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          description: description ?? null,
          severity: severity ?? "OBSERVATION",
          status: status ?? "OPEN",
          source: normaliseText(row.cell("source")) ?? null,
          frameworkReference: normaliseText(row.cell("framework")) ?? null,
          clauseRef: normaliseText(row.cell("clause control")) ?? null,
          recommendedAction: closureNote ?? null,
          ownerRef: normaliseText(row.cell("owner")) ?? null,
          identifiedOn:
            safeDate(
              row.cell("date logged"),
              "Date Logged",
              errors,
            )?.toISOString() ?? null,
          dueDate:
            safeDate(row.cell("due date"), "Due Date", errors)?.toISOString() ??
            null,
        },
        errors,
        ...(reviewReason ? { reviewReason } : {}),
      });
    }
    return flagDuplicateKeys(rows, "Gap ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        description: string;
        severity: GapSeverity;
        status: GapStatus;
        source: string | null;
        frameworkReference: string | null;
        clauseRef: string | null;
        recommendedAction: string | null;
        ownerRef: string | null;
        identifiedOn: string | null;
        dueDate: string | null;
      };
      const existing = await context.tx.gap.findUnique({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        select: { id: true },
      });
      const closed = payload.status === "CLOSED";
      const data = {
        title: payload.description.slice(0, 180),
        description: payload.description,
        severity: payload.severity,
        status: payload.status,
        source: payload.source,
        frameworkId:
          context.frameworks.resolvePrimary(payload.frameworkReference) ?? null,
        clauseRef: payload.clauseRef,
        recommendedAction: payload.recommendedAction,
        sourceOwnerRef: payload.ownerRef,
        identifiedOn: payload.identifiedOn
          ? new Date(payload.identifiedOn)
          : null,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        closedAt: closed ? new Date() : null,
        closureNote: closed
          ? (payload.recommendedAction ??
            "Closed in the source workbook before import.")
          : null,
        needsReview: row.reviewReason !== undefined,
        reviewReason: row.reviewReason ?? null,
        importBatchId: context.batchId,
        sourceSheet: "10_Gap_Analysis",
        sourceRow: row.rowNumber,
        updatedById: context.actorUserId,
      };
      const gap = existing
        ? await context.tx.gap.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.gap.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              code: payload.code,
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      context.gaps.set(payload.code, gap.id);
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "gaps",
        destinationRecordId: gap.id,
      });
    }
    return results;
  },
};

const CAPA_PRIORITIES: Record<string, CapaPriority> = {
  Critical: "CRITICAL",
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
};

const CAPA_STATUSES: Record<string, CapaStatus> = {
  Open: "OPEN",
  "In Progress": "IN_PROGRESS",
  "Pending Verification": "PENDING_VERIFICATION",
  Closed: "CLOSED",
  Cancelled: "CANCELLED",
};

/**
 * `11_CAPA_Register`. The `Corrective + Preventive Action` column holds both
 * halves in one cell, conventionally prefixed `CA:` and `PA:`.
 */
const splitActions = (value: string | undefined) => {
  if (value === undefined) return { corrective: null, preventive: null };
  const preventiveIndex = value.search(/\bPA\s*:/i);
  if (preventiveIndex === -1) {
    return { corrective: value, preventive: null };
  }
  return {
    corrective: value
      .slice(0, preventiveIndex)
      .replace(/^CA\s*:\s*/i, "")
      .trim(),
    preventive: value
      .slice(preventiveIndex)
      .replace(/^PA\s*:\s*/i, "")
      .trim(),
  };
};

export const capaImporter: SheetImporter = {
  key: "capas",

  validate(table: SheetTable): ValidatedRow[] {
    const rows: ValidatedRow[] = [];
    for (const row of table.dataRows()) {
      const code = normaliseText(row.cell("capa id"));
      if (code === undefined) continue;
      const errors: RowError[] = [];
      const description = normaliseText(row.cell("description non conformity"));
      const priority = mapEnumByPrefix(row.cell("priority"), CAPA_PRIORITIES);
      const status = mapEnum(row.cell("status"), CAPA_STATUSES);
      let reviewReason: string | undefined;
      if (priority === undefined) {
        reviewReason =
          "Priority was missing or unrecognised; defaulted to MEDIUM and flagged for review";
      }
      if (status === undefined) {
        errors.push(rowError("Status", "Status is not a recognised value"));
      }
      const actions = splitActions(
        normaliseText(row.cell("corrective preventive action")),
      );
      const completion = normalisePercentage(row.cell("completion")) ?? null;
      rows.push({
        rowNumber: row.rowNumber,
        businessKey: code,
        payload: {
          code,
          description: description ?? null,
          priority: priority ?? "MEDIUM",
          status: status ?? "OPEN",
          source: normaliseText(row.cell("source")) ?? null,
          sourceRef: normaliseText(row.cell("source ref")) ?? null,
          frameworkReference: normaliseText(row.cell("framework")) ?? null,
          rootCause: normaliseText(row.cell("root cause 5 why")) ?? null,
          correctiveAction: actions.corrective,
          preventiveAction: actions.preventive,
          ownerRef: normaliseText(row.cell("owner")) ?? null,
          completionPercentage: completion,
          raisedOn:
            safeDate(
              row.cell("date raised"),
              "Date Raised",
              errors,
            )?.toISOString() ?? null,
          dueDate:
            safeDate(row.cell("due date"), "Due Date", errors)?.toISOString() ??
            null,
          closedDate:
            safeDate(
              row.cell("closed date"),
              "Closed Date",
              errors,
            )?.toISOString() ?? null,
        },
        errors,
        ...(reviewReason ? { reviewReason } : {}),
      });
    }
    return flagDuplicateKeys(rows, "CAPA ID");
  },

  async commit(rows, context): Promise<CommitResult[]> {
    const results: CommitResult[] = [];
    for (const row of rows) {
      const payload = row.payload as {
        code: string;
        description: string | null;
        priority: CapaPriority;
        status: CapaStatus;
        source: string | null;
        sourceRef: string | null;
        frameworkReference: string | null;
        rootCause: string | null;
        correctiveAction: string | null;
        preventiveAction: string | null;
        ownerRef: string | null;
        completionPercentage: number | null;
        raisedOn: string | null;
        dueDate: string | null;
        closedDate: string | null;
      };
      // `Source Ref` carries the originating GAP code, which is how the
      // workbook links a CAPA to its gap.
      const gapId = payload.sourceRef
        ? (context.gaps.get(payload.sourceRef) ?? null)
        : null;
      const closed = payload.status === "CLOSED";
      const title = (payload.description ?? payload.code).slice(0, 180);
      const existing = await context.tx.capa.findUnique({
        where: {
          tenantId_code: { tenantId: context.tenantId, code: payload.code },
        },
        select: { id: true },
      });
      const data = {
        title,
        description: payload.description,
        gapId,
        source: payload.source,
        sourceRef: payload.sourceRef,
        frameworkId:
          context.frameworks.resolvePrimary(payload.frameworkReference) ?? null,
        rootCause: payload.rootCause,
        correctiveAction: payload.correctiveAction,
        preventiveAction: payload.preventiveAction,
        priority: payload.priority,
        status: payload.status,
        sourceOwnerRef: payload.ownerRef,
        completionPercentage:
          payload.completionPercentage ?? (closed ? 100 : 0),
        raisedOn: payload.raisedOn ? new Date(payload.raisedOn) : null,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        closedAt: closed
          ? payload.closedDate
            ? new Date(payload.closedDate)
            : new Date()
          : null,
        closureNote: closed
          ? (payload.correctiveAction ??
            "Closed in the source workbook before import.")
          : null,
        needsReview: row.reviewReason !== undefined,
        reviewReason: row.reviewReason ?? null,
        importBatchId: context.batchId,
        sourceSheet: "11_CAPA_Register",
        sourceRow: row.rowNumber,
        updatedById: context.actorUserId,
      };
      const capa = existing
        ? await context.tx.capa.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          })
        : await context.tx.capa.create({
            data: {
              ...data,
              tenantId: context.tenantId,
              code: payload.code,
              createdById: context.actorUserId,
            },
            select: { id: true },
          });
      results.push({
        rowNumber: row.rowNumber,
        outcome: existing ? "UPDATED" : "CREATED",
        destinationTable: "capas",
        destinationRecordId: capa.id,
      });
    }
    return results;
  },
};
