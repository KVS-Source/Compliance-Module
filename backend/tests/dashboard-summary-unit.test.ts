import { describe, expect, it } from "vitest";
import { isFrameworkActiveInScope } from "../src/modules/dashboard/framework-scope.js";
import { compliancePercentage } from "../src/modules/dashboard/summary-service.js";

describe("dashboard summary business definitions", () => {
  it("calculates compliance from measured actuals rather than enabled configuration count", () => {
    expect(compliancePercentage(29, 9)).toBe(31);
    expect(compliancePercentage(0, 0)).toBe(0);
  });

  it("uses framework scope status for the active dashboard set", () => {
    expect(isFrameworkActiveInScope("Active – In Scope")).toBe(true);
    expect(isFrameworkActiveInScope(" active - in scope ")).toBe(true);
    expect(isFrameworkActiveInScope("Certified")).toBe(true);
    expect(isFrameworkActiveInScope("Planning")).toBe(false);
    expect(isFrameworkActiveInScope(null)).toBe(false);
  });
});
