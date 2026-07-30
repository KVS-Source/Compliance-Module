import type { CheckpointOutcome, KpiFrequency } from "@prisma/client";
import { GovernanceRuleError } from "../governance/domain-error.js";

const isoDate = "[0-9]{4}-[0-9]{2}-[0-9]{2}";
const periodPatterns: Readonly<Record<KpiFrequency, RegExp>> = Object.freeze({
  DAILY: new RegExp(`^${isoDate}$`),
  WEEKLY: /^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/,
  MONTHLY: /^[0-9]{4}-(0[1-9]|1[0-2])$/,
  QUARTERLY: /^[0-9]{4}-Q[1-4]$/,
  HALF_YEARLY: /^[0-9]{4}-H[1-2]$/,
  ANNUAL: /^[0-9]{4}$/,
  CONTINUOUS: new RegExp(`^${isoDate}#[A-Z0-9][A-Z0-9_-]{0,31}$`),
  PER_EVENT: new RegExp(`^${isoDate}#[A-Z0-9][A-Z0-9_-]{0,31}$`),
  ONE_TIME: /^ONE-TIME$/,
});

const isRealIsoDate = (value: string) => {
  if (!new RegExp(`^${isoDate}$`).test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

const isRealIsoWeek = (value: string) => {
  const match = /^(?<year>[0-9]{4})-W(?<week>[0-9]{2})$/.exec(value);
  if (!match?.groups) return false;
  const year = Number(match.groups.year);
  const week = Number(match.groups.week);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const daysAfterMonday = (januaryFourth.getUTCDay() + 6) % 7;
  const weekStart = new Date(
    januaryFourth.valueOf() -
      daysAfterMonday * 86_400_000 +
      (week - 1) * 7 * 86_400_000,
  );
  const weekThursday = new Date(weekStart.valueOf() + 3 * 86_400_000);
  return weekThursday.getUTCFullYear() === year;
};

export const isReviewPeriodValid = (
  frequency: KpiFrequency,
  reviewPeriod: string,
) => {
  if (!periodPatterns[frequency].test(reviewPeriod)) return false;
  if (frequency === "DAILY") return isRealIsoDate(reviewPeriod);
  if (frequency === "WEEKLY") return isRealIsoWeek(reviewPeriod);
  if (frequency === "CONTINUOUS" || frequency === "PER_EVENT") {
    return isRealIsoDate(reviewPeriod.split("#", 1)[0] ?? "");
  }
  return true;
};

export const assertCheckpointReview = (input: {
  frequency: KpiFrequency;
  reviewPeriod: string;
  outcome: CheckpointOutcome;
  observation?: string | null;
  reviewDate: string;
  nextReviewDate?: string | null;
}) => {
  if (!isReviewPeriodValid(input.frequency, input.reviewPeriod)) {
    throw new GovernanceRuleError(
      "CHECKPOINT_REVIEW_PERIOD_INVALID",
      "reviewPeriod does not match the Checkpoint frequency",
    );
  }
  if (
    (input.outcome === "PARTIAL" || input.outcome === "FAIL") &&
    (input.observation?.trim().length ?? 0) < 2
  ) {
    throw new GovernanceRuleError(
      "CHECKPOINT_OBSERVATION_REQUIRED",
      "PARTIAL and FAIL reviews require an observation",
    );
  }
  if (!isRealIsoDate(input.reviewDate)) {
    throw new GovernanceRuleError(
      "CHECKPOINT_REVIEW_DATE_INVALID",
      "reviewDate must be a real ISO calendar date",
    );
  }
  if (
    input.nextReviewDate &&
    (!isRealIsoDate(input.nextReviewDate) ||
      input.nextReviewDate <= input.reviewDate)
  ) {
    throw new GovernanceRuleError(
      "CHECKPOINT_REVIEW_DATE_INVALID",
      "nextReviewDate must be a real date after reviewDate",
    );
  }
};
