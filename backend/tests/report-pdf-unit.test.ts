import { describe, expect, it } from "vitest";
import { buildReportPdf } from "../src/modules/reports/pdf.js";

describe("report PDF board pack", () => {
  it("produces a valid PDF header and includes the title", () => {
    const pdf = buildReportPdf({
      title: "Gaps",
      subtitle: "Company report",
      generatedAt: "2026-08-11T12:00:00.000Z",
      asOf: "2026-08-01",
      columns: [
        { key: "code", header: "Code" },
        { key: "title", header: "Title" },
      ],
      rows: [
        { code: "GAP-001", title: "Missing control" },
        { code: "GAP-002", title: "Open finding" },
      ],
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("Gaps");
    expect(text).toContain("As of 2026-08-01");
    expect(text).toContain("GAP-001");
  });
});
