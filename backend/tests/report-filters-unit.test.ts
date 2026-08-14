import { describe, expect, it } from "vitest";
import { buildReportQuerySchema } from "../src/modules/reports/validators.js";

const gapSeverities = [
  "CRITICAL",
  "MAJOR",
  "MINOR",
  "OBSERVATION",
  "OFI",
] as const;
const gapStatuses = ["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"] as const;
const riskStatuses = [
  "OPEN",
  "UNDER_REVIEW",
  "TREATED",
  "CLOSED",
  "ARCHIVED",
] as const;

describe("report filter validators", () => {
  it.each(gapSeverities)("accepts Gap severity %s", (severity) => {
    const parsed = buildReportQuerySchema("gaps").safeParse({ severity });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported Gap severity MODERATE", () => {
    const parsed = buildReportQuerySchema("gaps").safeParse({
      severity: "MODERATE",
    });
    expect(parsed.success).toBe(false);
  });

  it.each(gapStatuses)("accepts Gap status %s", (status) => {
    const parsed = buildReportQuerySchema("gaps").safeParse({ status });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported Gap status RESOLVED", () => {
    const parsed = buildReportQuerySchema("gaps").safeParse({
      status: "RESOLVED",
    });
    expect(parsed.success).toBe(false);
  });

  it.each(riskStatuses)("accepts Risk status %s", (status) => {
    const parsed = buildReportQuerySchema("risks").safeParse({ status });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported Risk status ASSESSED", () => {
    const parsed = buildReportQuerySchema("risks").safeParse({
      status: "ASSESSED",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects Gap severity on the Risks report", () => {
    const parsed = buildReportQuerySchema("risks").safeParse({
      severity: "MAJOR",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid CAPA priority", () => {
    const parsed = buildReportQuerySchema("capa-aging").safeParse({
      priority: "URGENT",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts CAPA priorities and statuses from the Prisma enums", () => {
    for (const priority of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      expect(
        buildReportQuerySchema("capa-aging").safeParse({ priority }).success,
      ).toBe(true);
    }
    for (const status of [
      "OPEN",
      "IN_PROGRESS",
      "PENDING_VERIFICATION",
      "CLOSED",
      "CANCELLED",
    ] as const) {
      expect(
        buildReportQuerySchema("capa-aging").safeParse({ status }).success,
      ).toBe(true);
    }
  });
});
