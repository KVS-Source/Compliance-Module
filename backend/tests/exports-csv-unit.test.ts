import { describe, expect, it } from "vitest";
import {
  csvCell,
  exportFilename,
  neutraliseFormula,
  quoteField,
  toCsv,
} from "../src/modules/exports/csv.js";

describe("CSV formula-injection defence", () => {
  it("neutralises every prefix a spreadsheet would evaluate", () => {
    for (const payload of [
      "=1+1",
      "=cmd|'/c calc'!A0",
      "+1+1",
      "-1+1",
      "@SUM(A1:A9)",
      "\t=1+1",
      "\r=1+1",
    ]) {
      const cell = csvCell(payload);
      // The apostrophe forces a literal cell and is stripped on display, so
      // the reader still sees the original text.
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary values untouched", () => {
    expect(neutraliseFormula("ISO 27001:2022")).toBe("ISO 27001:2022");
    expect(neutraliseFormula("")).toBe("");
    expect(neutraliseFormula("A.5.15 Access Control")).toBe(
      "A.5.15 Access Control",
    );
  });

  it("does not treat a negative number as a formula once typed", () => {
    // A real number is written by the number branch, which never prefixes.
    expect(csvCell(-35)).toBe("-35");
    // A string that merely looks like one is still defended.
    expect(csvCell("-35")).toBe("'-35");
  });
});

describe("CSV quoting", () => {
  it("quotes fields containing a comma, quote or newline", () => {
    expect(quoteField("plain")).toBe("plain");
    expect(quoteField("a,b")).toBe('"a,b"');
    expect(quoteField('say "hi"')).toBe('"say ""hi"""');
    expect(quoteField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("keeps a quoted formula both quoted and neutralised", () => {
    // Order matters: neutralise first, then quote, or the apostrophe would
    // land outside the quotes and stop protecting the value.
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
  });

  it("renders empty, boolean, numeric and date cells predictably", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(new Date(Date.UTC(2026, 3, 23)))).toBe(
      "2026-04-23T00:00:00.000Z",
    );
  });
});

describe("CSV document", () => {
  it("writes a header row and CRLF-terminated records", () => {
    const csv = toCsv(
      [
        { header: "Code", value: (row: { code: string }) => row.code },
        { header: "Title", value: () => "=DANGER()" },
      ],
      [{ code: "GAP-001" }],
    );
    expect(csv).toBe("Code,Title\r\nGAP-001,'=DANGER()\r\n");
  });

  it("emits only a header when there are no rows", () => {
    expect(toCsv([{ header: "Code", value: () => "" }], [])).toBe("Code\r\n");
  });

  it("builds a deterministic filename carrying module and date", () => {
    expect(exportFilename("gaps", new Date(Date.UTC(2026, 7, 2)))).toBe(
      "genbioca-gaps-2026-08-02.csv",
    );
  });
});
