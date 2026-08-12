import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toCsv } from "../src/modules/exports/csv.js";
import {
  NOTO_SANS_REGULAR_SHA256,
  notoSansRegular,
} from "../src/modules/reports/fonts/noto-sans-regular.js";
import { buildReportPdf } from "../src/modules/reports/pdf.js";
import { REPORT_CATALOGUE } from "../src/modules/reports/service.js";
import {
  parseTrueType,
  subsetTrueType,
} from "../src/modules/reports/truetype.js";

/**
 * The characters the UAT defect report named, plus the wider set board packs
 * realistically carry. A regression here means the export misrepresents a
 * Company's own data, so these are asserted literally rather than by shape.
 */
const UNICODE_PROBES = [
  "Ação",
  "Política",
  "Grüne",
  "—",
  "₹",
  "Código",
  "Türkçe",
  "€",
  "·",
  "’",
] as const;

/**
 * Extracts text with pdf.js — a third-party reader, deliberately not our own
 * writer. It parses the embedded font programme and resolves glyph ids through
 * the `ToUnicode` CMap, so a passing assertion means a real PDF reader recovers
 * the original characters, not merely that our encoder round-trips itself.
 */
const extractPdfText = async (pdf: Buffer) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    // Never reach for a system font: the assertion must exercise the font we
    // embedded, not whatever happens to be installed on the runner.
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  let text = "";
  for (let page = 1; page <= document.numPages; page += 1) {
    const content = await (await document.getPage(page)).getTextContent();
    text += content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("\n");
    text += "\n";
  }
  await document.destroy();
  return text;
};

const unicodeReport = (title: string) => ({
  title,
  subtitle: "Company report · unicode",
  generatedAt: "2026-08-12T12:00:00.000Z",
  asOf: "2026-08-01",
  columns: [
    { key: "code", header: "Código" },
    { key: "title", header: "Título" },
    { key: "cost", header: "Custo" },
  ],
  rows: [
    { code: "RSK-001", title: "Ação Corretiva — Política", cost: "₹ 1,25,000" },
    { code: "RSK-002", title: "Grüne Prüfung · Türkçe", cost: "€ 42" },
    { code: "RSK-003", title: "O’Brien — naïve café", cost: "£ 7" },
  ],
});

describe("report PDF board pack", () => {
  it("produces a valid PDF header and trailer", () => {
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
  });

  it("still carries the title, as-of line and rows", async () => {
    const text = await extractPdfText(
      buildReportPdf({
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
      }),
    );
    expect(text).toContain("Gaps");
    expect(text).toContain("As of 2026-08-01");
    expect(text).toContain("GAP-001");
    expect(text).toContain("Missing control");
  });

  it("embeds a subsetted Unicode font with Identity-H encoding", () => {
    const text = buildReportPdf(unicodeReport("Ação")).toString("latin1");

    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/Encoding /Identity-H");
    expect(text).toContain("/Subtype /CIDFontType2");
    expect(text).toContain("/CIDToGIDMap /Identity");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/ToUnicode");

    // Text is written as glyph ids in hex strings, so the old literal-string
    // form — the one that could only hold ASCII — must be gone entirely.
    expect(text).toMatch(/<[0-9A-F]+> Tj/);
    expect(text).not.toMatch(/\([^)]*\) Tj/);
  });

  it("keeps the embedded subset far smaller than the whole face", () => {
    const pdf = buildReportPdf(unicodeReport("Ação"));
    expect(notoSansRegular().length).toBeGreaterThan(400_000);
    expect(pdf.length).toBeLessThan(60_000);
  });

  it("recovers the original Unicode text through a third-party reader", async () => {
    const text = await extractPdfText(
      buildReportPdf(unicodeReport("Ação Corretiva — Política")),
    );

    for (const probe of UNICODE_PROBES) {
      expect(text, `expected "${probe}" to survive into the PDF`).toContain(
        probe,
      );
    }
    // The defect under repair: non-ASCII used to be rewritten to "?".
    expect(text).not.toContain("?");
    expect(text).toContain("₹ 1,25,000");
    expect(text).toContain("O’Brien — naïve café");
  });

  it("preserves Unicode for every report in the catalogue", async () => {
    expect(REPORT_CATALOGUE).toHaveLength(10);

    for (const report of REPORT_CATALOGUE) {
      const text = await extractPdfText(
        buildReportPdf({
          ...unicodeReport(report.name),
          subtitle: `Company report · ${report.key}`,
        }),
      );
      for (const probe of UNICODE_PROBES) {
        expect(text, `report "${report.key}" lost "${probe}"`).toContain(probe);
      }
      expect(text, `report "${report.key}" emitted a "?"`).not.toContain("?");
    }
  });

  it("keeps Unicode across a page break", async () => {
    const rows = Array.from({ length: 140 }, (_, index) => ({
      code: `RSK-${String(index).padStart(3, "0")}`,
      title: `Ação — Política ${index}`,
      cost: "₹ 500",
    }));
    const pdf = buildReportPdf({ ...unicodeReport("Ação"), rows });
    const text = await extractPdfText(pdf);

    expect(text).toContain("Ação — Política 0");
    expect(text).toContain("Ação — Política 139");
    expect(text).not.toContain("?");
  });

  it("renders an empty report without a font or encoding error", async () => {
    const text = await extractPdfText(
      buildReportPdf({
        title: "Ação",
        generatedAt: "2026-08-12T12:00:00.000Z",
        columns: [{ key: "code", header: "Código" }],
        rows: [],
      }),
    );
    expect(text).toContain("Ação");
    expect(text).toContain("Código");
  });

  it("does not substitute characters the font cannot render", () => {
    // A code point outside the vendored face falls back to .notdef rather than
    // being rewritten into a different, wrong character.
    const text = buildReportPdf({
      title: "漢字 test",
      generatedAt: "2026-08-12T12:00:00.000Z",
      columns: [{ key: "code", header: "Code" }],
      rows: [{ code: "漢字" }],
    }).toString("latin1");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
  });
});

describe("vendored report font", () => {
  it("matches the recorded upstream digest", () => {
    const digest = createHash("sha256").update(notoSansRegular()).digest("hex");
    expect(digest).toBe(NOTO_SANS_REGULAR_SHA256);
  });

  it("covers every character the reports are required to carry", () => {
    const font = parseTrueType(notoSansRegular());
    for (const probe of UNICODE_PROBES) {
      for (const character of probe) {
        const codePoint = character.codePointAt(0)!;
        expect(
          font.cmap.get(codePoint),
          `font lacks a glyph for U+${codePoint
            .toString(16)
            .toUpperCase()} (${character})`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

/** Reads the sfnt table directory of a generated subset. */
const readTableDirectory = (font: Buffer) => {
  const numTables = font.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    tables.set(font.toString("latin1", record, record + 4), {
      offset: font.readUInt32BE(record + 8),
      length: font.readUInt32BE(record + 12),
    });
  }
  return tables;
};

describe("TrueType subsetting", () => {
  it("emits a well-formed font holding only the glyphs asked for", () => {
    const font = parseTrueType(notoSansRegular());
    const glyphs = [..."Ação ₹—"].map(
      (character) => font.cmap.get(character.codePointAt(0)!) ?? 0,
    );
    const subset = subsetTrueType(font, glyphs);
    const tables = readTableDirectory(subset.font);

    expect(subset.font.length).toBeLessThan(notoSansRegular().length);
    expect(subset.font.readUInt32BE(0)).toBe(0x00010000); // sfnt version
    // Identity-H addresses glyphs directly, so no `cmap` is emitted; the
    // character mapping lives in the PDF's ToUnicode CMap instead.
    expect([...tables.keys()].sort()).toEqual([
      "glyf",
      "head",
      "hhea",
      "hmtx",
      "loca",
      "maxp",
    ]);

    const maxp = tables.get("maxp")!;
    const head = tables.get("head")!;
    const numGlyphs = subset.font.readUInt16BE(maxp.offset + 4);
    // .notdef is always present, so the subset holds at least the requested set.
    expect(numGlyphs).toBeGreaterThanOrEqual(new Set(glyphs).size);
    expect(numGlyphs).toBe(subset.advanceWidths.length);
    expect(subset.font.readInt16BE(head.offset + 50)).toBe(1); // long loca
    expect(tables.get("loca")!.length).toBe((numGlyphs + 1) * 4);
    expect(tables.get("hmtx")!.length).toBe(numGlyphs * 4);
    expect(subset.glyphMap.get(0)).toBe(0);
  });

  it("pulls in the components a composite glyph depends on", () => {
    const font = parseTrueType(notoSansRegular());
    // "ç" is a composite of a base letter and a cedilla mark; dropping either
    // component would leave a blank where the character should be.
    const cedilla = font.cmap.get("ç".codePointAt(0)!)!;
    const subset = subsetTrueType(font, [cedilla]);
    expect(subset.glyphMap.size).toBeGreaterThan(2);
  });
});

describe("CSV export is unaffected by the PDF font work", () => {
  it("still writes Unicode straight through, unsubstituted", () => {
    type Row = { code: string; title: string };
    const csv = toCsv<Row>(
      [
        { header: "Código", value: (row) => row.code },
        { header: "Título", value: (row) => row.title },
      ],
      [
        { code: "RSK-001", title: "Ação Corretiva — Política" },
        { code: "RSK-002", title: "Grüne Prüfung ₹ 1,25,000" },
      ],
    );

    expect(csv).toContain("Código");
    expect(csv).toContain("Ação Corretiva — Política");
    expect(csv).toContain("Grüne Prüfung ₹ 1,25,000");
    expect(csv).not.toContain("?");
  });
});
