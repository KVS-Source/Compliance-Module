import type { CapaStatus, GapStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

/**
 * Gap and CAPA lifecycle rules.
 *
 * Both lifecycles are deliberately small and deterministic: this MVP needs a
 * truthful record of state, not an approval engine. Closure is the only
 * guarded transition, and it is guarded in the backend.
 */

export const GAP_TRANSITIONS: Readonly<
  Record<GapStatus, readonly GapStatus[]>
> = Object.freeze({
  OPEN: ["IN_PROGRESS", "CLOSED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "CLOSED", "CANCELLED"],
  // Reopening a closed gap is supported so a premature closure can be
  // corrected; it returns to IN_PROGRESS, never straight back to CLOSED.
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
});

export const CAPA_TRANSITIONS: Readonly<
  Record<CapaStatus, readonly CapaStatus[]>
> = Object.freeze({
  OPEN: ["IN_PROGRESS", "PENDING_VERIFICATION", "CLOSED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "PENDING_VERIFICATION", "CLOSED", "CANCELLED"],
  PENDING_VERIFICATION: ["IN_PROGRESS", "CLOSED", "CANCELLED"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
});

const invalidTransition = (from: string, to: string) =>
  new AppError(
    409,
    "INVALID_STATUS_TRANSITION",
    `Status cannot move from ${from} to ${to}`,
  );

/**
 * A no-op status change is accepted, because a PATCH that resends the current
 * status alongside other edits is not an error. Closure is the exception: it
 * writes a closure note and a closed timestamp, so re-closing an already
 * closed record would silently overwrite the original sign-off. Callers pass
 * `allowSelf: false` for that path.
 */
export const assertGapTransition = (
  from: GapStatus,
  to: GapStatus,
  options: { allowSelf?: boolean } = {},
) => {
  if (from === to && (options.allowSelf ?? true)) return true as const;
  if (from === to || !GAP_TRANSITIONS[from].includes(to)) {
    throw invalidTransition(from, to);
  }
  return true as const;
};

export const assertCapaTransition = (
  from: CapaStatus,
  to: CapaStatus,
  options: { allowSelf?: boolean } = {},
) => {
  if (from === to && (options.allowSelf ?? true)) return true as const;
  if (from === to || !CAPA_TRANSITIONS[from].includes(to)) {
    throw invalidTransition(from, to);
  }
  return true as const;
};

export const CLOSURE_NOTE_MIN_LENGTH = 10;

/**
 * A closure note is mandatory and must say something. The database enforces
 * presence; this enforces that it is not a single character standing in for a
 * justification.
 */
export const assertClosureNote = (note: string | null | undefined) => {
  const trimmed = note?.trim() ?? "";
  if (trimmed.length < CLOSURE_NOTE_MIN_LENGTH) {
    throw new AppError(
      422,
      "CLOSURE_NOTE_REQUIRED",
      `A closure note of at least ${CLOSURE_NOTE_MIN_LENGTH} characters is required`,
    );
  }
  return trimmed;
};

/**
 * A gap cannot close while any linked CAPA is still open. Closing the finding
 * while its corrective action is outstanding would misreport the compliance
 * position, which is the whole point of the register.
 */
export const assertNoOpenCapas = (openCapaCodes: readonly string[]) => {
  if (openCapaCodes.length > 0) {
    throw new AppError(
      409,
      "GAP_HAS_OPEN_CAPA",
      "Every linked CAPA must be closed or cancelled before the gap closes",
      { openCapas: openCapaCodes },
    );
  }
  return true as const;
};

/** A CAPA reports 100% complete when it closes. */
export const closureCompletionPercentage = (current: number) =>
  Math.max(current, 100);

export const assertCompletionPercentage = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new AppError(
      422,
      "COMPLETION_PERCENTAGE_INVALID",
      "Completion percentage must be an integer between 0 and 100",
    );
  }
  return value;
};

export const isGapOverdue = (
  dueDate: Date | null,
  status: GapStatus,
  asOf: Date,
) =>
  dueDate !== null &&
  status !== "CLOSED" &&
  status !== "CANCELLED" &&
  dueDate.getTime() < asOf.getTime();

export const isCapaOverdue = (
  dueDate: Date | null,
  status: CapaStatus,
  asOf: Date,
) =>
  dueDate !== null &&
  status !== "CLOSED" &&
  status !== "CANCELLED" &&
  dueDate.getTime() < asOf.getTime();
