import { describe, expect, it } from "vitest";
import {
  FieldParseError,
  mapEnum,
  mapEnumByPrefix,
  normaliseBoolean,
  normaliseDate,
  normaliseHeader,
  normaliseNumber,
  normalisePercentage,
  normaliseText,
  splitList,
} from "../src/modules/imports/normalise.js";
import { FrameworkResolver } from "../src/modules/imports/framework-resolver.js";
import { periodWindow } from "../src/modules/imports/importers/kpis.js";
import { codeFromLabel } from "../src/modules/imports/importers/masters.js";
import {
  IMPORT_ORDER,
  SHEET_PLANS,
  planForSheet,
} from "../src/modules/imports/sheet-plan.js";
import { SheetTable } from "../src/modules/imports/sheet-table.js";

describe("value normalisation", () => {
  it("collapses whitespace and treats placeholders as absent", () => {
    expect(normaliseText("  ISO   27001  ")).toBe("ISO 27001");
    expect(normaliseText("—")).toBeUndefined();
    expect(normaliseText("N/A")).toBeUndefined();
    expect(normaliseText("")).toBeUndefined();
    expect(normaliseText(null)).toBeUndefined();
  });

  it("normalises headers so punctuation and case do not matter", () => {
    expect(normaliseHeader("Chk ID")).toBe("chk id");
    expect(normaliseHeader("KPI Name (auto)")).toBe("kpi name");
    expect(normaliseHeader("Inh. Prob (1-5)")).toBe("inh prob 1 5");
    expect(normaliseHeader("Acknowl. %")).toBe("acknowl");
  });

  it("parses numbers written with units, separators and symbols", () => {
    expect(normaliseNumber(85)).toBe(85);
    expect(normaliseNumber("85%")).toBe(85);
    expect(normaliseNumber("1,250")).toBe(1250);
    expect(normaliseNumber(" 4.5 ")).toBe(4.5);
    expect(normaliseNumber(null)).toBeUndefined();
  });

  it("raises a field error rather than silently nulling a bad number", () => {
    expect(() => normaliseNumber("not a number")).toThrow(FieldParseError);
  });

  it("parses the workbook's date shapes at UTC midnight", () => {
    expect(normaliseDate("23-Apr-2026")?.toISOString()).toBe(
      "2026-04-23T00:00:00.000Z",
    );
    expect(normaliseDate("2026-04-23")?.toISOString()).toBe(
      "2026-04-23T00:00:00.000Z",
    );
    // Authored in an Indian locale, so DD-MM-YYYY, deterministically.
    expect(normaliseDate("05-06-2026")?.toISOString()).toBe(
      "2026-06-05T00:00:00.000Z",
    );
    // Defensive: a real Excel serial still resolves.
    expect(normaliseDate(46135)?.toISOString()).toBe(
      "2026-04-23T00:00:00.000Z",
    );
    expect(normaliseDate("TBD")).toBeUndefined();
    expect(() => normaliseDate("sometime next year")).toThrow(FieldParseError);
  });

  it("reads yes/no columns", () => {
    expect(normaliseBoolean("Yes")).toBe(true);
    expect(normaliseBoolean("no")).toBe(false);
    expect(normaliseBoolean("maybe")).toBeUndefined();
  });

  it("accepts a percentage as a fraction or a whole number", () => {
    expect(normalisePercentage(0.98)).toBe(98);
    expect(normalisePercentage(98)).toBe(98);
    expect(normalisePercentage(1)).toBe(100);
    expect(normalisePercentage(140)).toBe(100);
  });

  it("splits multi-value reference cells", () => {
    expect(splitList("ISO 27001:2022 A.5.1; HIPAA §164.308")).toEqual([
      "ISO 27001:2022 A.5.1",
      "HIPAA §164.308",
    ]);
    expect(splitList(null)).toEqual([]);
  });

  it("maps vocabularies ignoring case and punctuation", () => {
    const table = { "Higher is Better": "HIGHER_IS_BETTER" } as const;
    expect(mapEnum("Higher is Better", table)).toBe("HIGHER_IS_BETTER");
    expect(mapEnum("higher-is-better", table)).toBe("HIGHER_IS_BETTER");
    expect(mapEnum("Sideways", table)).toBeUndefined();
  });

  it("maps a vocabulary the workbook has decorated with free text", () => {
    const table = { Medium: "MEDIUM", Critical: "CRITICAL" } as const;
    expect(mapEnumByPrefix("P3 - Medium", table)).toBeUndefined();
    expect(mapEnumByPrefix("Critical", table)).toBe("CRITICAL");
    expect(mapEnumByPrefix("Medium priority", table)).toBe("MEDIUM");
  });
});

describe("framework resolution", () => {
  const resolver = () => {
    const instance = new FrameworkResolver();
    instance.register("ISO 9001", "iso9001");
    instance.register("ISO 27001", "iso27001");
    instance.register("ISO 45001", "iso45001");
    instance.register("SA 8000", "sa8000");
    instance.register("HIPAA", "hipaa");
    instance.register("CMMI-SVC", "cmmi");
    instance.register("DPDPA", "dpdpa");
    instance.register("GDPR", "gdpr");
    instance.register("SOC 1 & SOC 2", "soc");
    instance.register("ADA / WCAG", "ada");
    return instance;
  };

  it("resolves the combined tokens other sheets use", () => {
    const instance = resolver();
    expect(instance.resolve("ISO 9001:2015")).toBe("iso9001");
    expect(instance.resolve("ISO 45001:2018")).toBe("iso45001");
    expect(instance.resolve("SA 8000:2014")).toBe("sa8000");
    expect(instance.resolve("CMMI-SVC L3")).toBe("cmmi");
    expect(instance.resolve("DPDPA 2023")).toBe("dpdpa");
    expect(instance.resolve("ADA / WCAG 2.1 AA")).toBe("ada");
    expect(instance.resolve("SOC 1 & SOC 2")).toBe("soc");
    expect(instance.resolve("GDPR")).toBe("gdpr");
  });

  it("does not let a shorter code capture a longer one", () => {
    // `ISO 9001` must never absorb a reference meant for `ISO 45001`.
    expect(resolver().resolve("ISO 45001:2018")).toBe("iso45001");
  });

  it("takes the leading entry from a multi-framework cell", () => {
    expect(resolver().resolvePrimary("ISO 27001:2022; HIPAA; SOC 2")).toBe(
      "iso27001",
    );
  });

  it("returns undefined for an unknown framework instead of guessing", () => {
    expect(resolver().resolve("PCI DSS 4.0")).toBeUndefined();
    expect(resolver().resolve(null)).toBeUndefined();
  });
});

describe("financial-year period windows", () => {
  it("treats the year as April to March", () => {
    expect(periodWindow("FY26-27")).toEqual({
      start: new Date(Date.UTC(2026, 3, 1)),
      end: new Date(Date.UTC(2027, 2, 31)),
    });
  });

  it("derives quarters from the April start", () => {
    expect(periodWindow("FY26-27 Q1")).toEqual({
      start: new Date(Date.UTC(2026, 3, 1)),
      end: new Date(Date.UTC(2026, 5, 30)),
    });
    expect(periodWindow("FY26-27 Q4")).toEqual({
      start: new Date(Date.UTC(2027, 0, 1)),
      end: new Date(Date.UTC(2027, 2, 31)),
    });
  });

  it("derives month windows", () => {
    expect(periodWindow("Apr-26")).toEqual({
      start: new Date(Date.UTC(2026, 3, 1)),
      end: new Date(Date.UTC(2026, 3, 30)),
    });
  });

  it("has no window for a non-calendar label", () => {
    expect(periodWindow("Per-Event")).toBeUndefined();
  });
});

describe("sheet plan", () => {
  it("resolves sheets through the alias table", () => {
    expect(planForSheet("14_KPI_Master")?.key).toBe("kpi_master");
    expect(planForSheet("KPI_Master")?.key).toBe("kpi_master");
    expect(planForSheet("kpi master")?.key).toBe("kpi_master");
    expect(planForSheet("Unheard Of")).toBeUndefined();
  });

  it("declares each sheet key exactly once", () => {
    const keys = SHEET_PLANS.map((plan) => plan.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("orders every importable sheet and no derived one", () => {
    const importable = SHEET_PLANS.filter(
      (plan) => plan.target !== "derived",
    ).map((plan) => plan.key);
    expect([...IMPORT_ORDER].sort()).toEqual([...importable].sort());
  });

  it("loads the enterprise risk register before KPI actuals", () => {
    // KPI misses allocate RSK-nnn codes, so the workbook's own risks must be
    // present first or the two sets collide.
    expect(IMPORT_ORDER.indexOf("risks")).toBeLessThan(
      IMPORT_ORDER.indexOf("kpi_actuals"),
    );
  });

  it("loads gaps before CAPAs so the CAPA link resolves", () => {
    expect(IMPORT_ORDER.indexOf("gaps")).toBeLessThan(
      IMPORT_ORDER.indexOf("capas"),
    );
  });

  it("never imports a dashboard, lookup or summary sheet as records", () => {
    for (const key of [
      "compliance_dashboard",
      "kpi_dashboard",
      "lookups",
      "export_summary",
    ]) {
      expect(SHEET_PLANS.find((plan) => plan.key === key)?.target).toBe(
        "derived",
      );
    }
  });
});

describe("sheet table", () => {
  const sheet = {
    name: "Sample",
    position: 1,
    rows: [
      ["BANNER"],
      [],
      ["Gap ID", "Severity", "Status"],
      ["GAP-001", "Major", "Open"],
      ["GAP-002", "Minor", "Closed"],
      [],
      ["▣ APPENDIX"],
      ["not", "a", "record"],
    ],
  };

  it("addresses cells by normalised header from the declared header row", () => {
    const table = SheetTable.from(sheet, 3);
    expect(table.dataRows()).toHaveLength(2);
    expect(table.dataRows()[0]!.cell("gap id")).toBe("GAP-001");
    expect(table.dataRows()[0]!.cell("severity")).toBe("Major");
    expect(table.dataRows()[0]!.rowNumber).toBe(4);
  });

  it("stops at the blank row so an appendix is never read as data", () => {
    const table = SheetTable.from(sheet, 3);
    const codes = table.dataRows().map((row) => row.cell("gap id"));
    expect(codes).toEqual(["GAP-001", "GAP-002"]);
  });

  it("reports the required columns a sheet does not provide", () => {
    const table = SheetTable.from(sheet, 3);
    expect(table.missingHeaders(["gap id", "owner"])).toEqual(["owner"]);
  });

  it("returns null for a column the sheet does not have", () => {
    const table = SheetTable.from(sheet, 3);
    expect(table.dataRows()[0]!.cell("nonexistent")).toBeNull();
  });
});

describe("derived codes", () => {
  it("produces a stable code from a label", () => {
    expect(codeFromLabel("Quality / QMS")).toBe("QUALITY-QMS");
    expect(codeFromLabel("Finance & Accounting")).toBe(
      "FINANCE-AND-ACCOUNTING",
    );
    expect(codeFromLabel("IT / Information Security")).toBe(
      "IT-INFORMATION-SECURITY",
    );
  });

  it("is a pure function so reruns match the same record", () => {
    expect(codeFromLabel("Human Resources")).toBe(
      codeFromLabel("  human   resources  ".toUpperCase()),
    );
  });
});
