import { describe, expect, it } from "vitest";
import {
  CAPA_AGING_BUCKETS,
  achievementRate,
  capaAgingBucket,
  frameworkCompliancePercentage,
} from "../src/modules/dashboard/analytics-repository.js";
import { buildActionQueue } from "../src/modules/dashboard/summary-service.js";

const DAY = 86_400_000;
const now = new Date("2026-06-15T12:00:00.000Z");
const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY);

describe("framework compliance percentage", () => {
  it("measures implemented controls against mapped controls", () => {
    expect(frameworkCompliancePercentage(8, 6)).toBe(75);
    expect(frameworkCompliancePercentage(3, 1)).toBe(33.3);
    expect(frameworkCompliancePercentage(4, 4)).toBe(100);
  });

  it("returns null rather than a percentage when no control is mapped", () => {
    // A framework nobody has implemented a control against has no honest
    // score. Returning 0 would read as "assessed and failing"; the dashboard
    // must say "not mapped" instead.
    expect(frameworkCompliancePercentage(0, 0)).toBeNull();
  });
});

describe("KPI achievement rate", () => {
  it("is the share of measured KPIs that met target", () => {
    expect(achievementRate(29, 9)).toBe(31);
    expect(achievementRate(4, 3)).toBe(75);
  });

  it("is null with nothing measured, never a flattering 100", () => {
    expect(achievementRate(0, 0)).toBeNull();
  });
});

describe("CAPA aging buckets", () => {
  it("covers every open CAPA exactly once", () => {
    const keys = CAPA_AGING_BUCKETS.map((bucket) => bucket.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("places a CAPA by how far past its due date it is", () => {
    expect(capaAgingBucket(daysFromNow(-120), now)).toBe("OVERDUE_90_PLUS");
    expect(capaAgingBucket(daysFromNow(-90), now)).toBe("OVERDUE_90_PLUS");
    expect(capaAgingBucket(daysFromNow(-75), now)).toBe("OVERDUE_61_90");
    expect(capaAgingBucket(daysFromNow(-45), now)).toBe("OVERDUE_31_60");
    expect(capaAgingBucket(daysFromNow(-10), now)).toBe("OVERDUE_1_30");
  });

  it("separates work that is merely upcoming from work that is late", () => {
    expect(capaAgingBucket(daysFromNow(0), now)).toBe("DUE_SOON");
    expect(capaAgingBucket(daysFromNow(20), now)).toBe("DUE_SOON");
    expect(capaAgingBucket(daysFromNow(200), now)).toBe("SCHEDULED");
  });

  it("does not invent a due date for a CAPA that has none", () => {
    expect(capaAgingBucket(null, now)).toBe("NO_DUE_DATE");
  });
});

describe("derived action queue", () => {
  const counts = {
    pendingEvidenceReview: 3,
    pendingKpiApprovals: 7,
    overdueCapas: 2,
    overdueGaps: 0,
    openGaps: 11,
    policiesOverdueForReview: 1,
  };

  it("drops empty buckets and orders the rest by size", () => {
    const queue = buildActionQueue(counts);
    expect(queue.map((item) => item.key)).toEqual([
      "gap-open",
      "kpi-approval",
      "evidence-review",
      "capa-overdue",
      "policy-review",
    ]);
    expect(queue.every((item) => item.count > 0)).toBe(true);
  });

  it("points every entry at a real register route", () => {
    for (const item of buildActionQueue(counts)) {
      expect(item.to.startsWith("/")).toBe(true);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("treats a withheld section as absent rather than as zero work", () => {
    // `null` means the caller may not read that register. Counting it as 0
    // would assert "nothing to do", which is a claim the API never made.
    const queue = buildActionQueue({
      pendingEvidenceReview: null,
      pendingKpiApprovals: null,
      overdueCapas: null,
      overdueGaps: null,
      openGaps: null,
      policiesOverdueForReview: null,
    });
    expect(queue).toEqual([]);
  });
});
