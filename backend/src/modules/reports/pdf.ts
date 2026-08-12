/**
 * Minimal PDF writer for report board packs.
 *
 * Avoids a heavy PDF library dependency: report tables are rendered as plain
 * text pages. This is not a full layout engine — it is enough for a printable
 * board pack of the same rows the CSV export carries.
 *
 * Text is written with an embedded, subsetted Noto Sans as a `CIDFontType2`
 * descendant under `/Encoding /Identity-H`, so accented Latin, dashes and
 * currency signs (`Ação`, `Política`, `Grüne`, `—`, `₹`) survive into the file
 * instead of being flattened to ASCII. A `ToUnicode` CMap accompanies the font
 * so the original text is what a reader extracts, copies or searches.
 */

import { deflateSync } from "node:zlib";
import { notoSansRegular } from "./fonts/noto-sans-regular.js";
import { parseTrueType, subsetTrueType } from "./truetype.js";

export type PdfTableColumn = { key: string; header: string };
export type PdfTableRow = Record<string, string | number | null | undefined>;

/** Parse the vendored font once per process — it never changes at runtime. */
let parsedFont: ReturnType<typeof parseTrueType> | undefined;
const reportFont = () => (parsedFont ??= parseTrueType(notoSansRegular()));

const utf16BeHex = (codePoint: number) => {
  if (codePoint <= 0xffff) {
    return codePoint.toString(16).padStart(4, "0").toUpperCase();
  }
  const value = codePoint - 0x10000;
  const high = 0xd800 + (value >> 10);
  const low = 0xdc00 + (value & 0x3ff);
  return (
    high.toString(16).padStart(4, "0").toUpperCase() +
    low.toString(16).padStart(4, "0").toUpperCase()
  );
};

/**
 * Build a single multi-page PDF Buffer for a report title + tabular rows.
 */
export const buildReportPdf = (input: {
  title: string;
  subtitle?: string;
  generatedAt: string;
  columns: PdfTableColumn[];
  rows: PdfTableRow[];
  asOf?: string;
}): Buffer => {
  const pageHeight = 842; // A4 points
  const pageWidth = 595;
  const lineHeight = 12;
  const fontSize = 9;
  const top = pageHeight - 50;
  const bottom = 50;
  const maxLinesPerPage = Math.floor((top - bottom) / lineHeight) - 6;

  const headerParts = [
    input.title,
    input.subtitle ?? "",
    `Generated ${input.generatedAt}`,
    input.asOf ? `As of ${input.asOf}` : "",
    input.columns.map((column) => column.header).join(" | "),
    "-".repeat(80),
  ].filter(Boolean);

  const dataLines = input.rows.map((row) =>
    input.columns
      .map((column) => {
        const raw = row[column.key];
        if (raw == null) return "";
        return String(raw).replace(/\s+/g, " ").slice(0, 40);
      })
      .join(" | "),
  );

  const allLines = [...headerParts, ...dataLines];
  if (allLines.length === 0) allLines.push("(no rows)");

  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += maxLinesPerPage) {
    pages.push(allLines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push(["(empty)"]);

  // Resolve every code point the document uses to a glyph, then embed only
  // those glyphs. Code points the font does not cover fall back to .notdef
  // rather than being rewritten to a placeholder character.
  const font = reportFont();
  const usedGlyphs = new Set<number>([0]);
  const glyphText = new Map<number, string>();
  for (const pageLines of pages) {
    for (const text of pageLines) {
      for (const character of text) {
        const codePoint = character.codePointAt(0)!;
        const glyph = font.cmap.get(codePoint) ?? 0;
        usedGlyphs.add(glyph);
        if (glyph !== 0 && !glyphText.has(glyph)) {
          glyphText.set(glyph, character);
        }
      }
    }
  }

  const subset = subsetTrueType(font, usedGlyphs);
  const scale = 1000 / font.unitsPerEm;

  const encodeLine = (text: string) => {
    let hex = "";
    for (const character of text) {
      const glyph = font.cmap.get(character.codePointAt(0)!) ?? 0;
      const subsetGlyph = subset.glyphMap.get(glyph) ?? 0;
      hex += subsetGlyph.toString(16).padStart(4, "0").toUpperCase();
    }
    return hex;
  };

  const line = (y: number, text: string) =>
    `BT /F1 ${fontSize} Tf 40 ${y} Td <${encodeLine(text)}> Tj ET`;

  const objects: Buffer[] = [];
  const addObject = (body: Buffer | string) => {
    objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
    return objects.length;
  };

  // --- Embedded font programme -------------------------------------------
  const compressed = deflateSync(subset.font);
  const fontFileId = addObject(
    Buffer.concat([
      Buffer.from(
        `<< /Length ${compressed.length} /Length1 ${subset.font.length} /Filter /FlateDecode >>\nstream\n`,
        "latin1",
      ),
      compressed,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );

  const descriptorId = addObject(
    `<< /Type /FontDescriptor /FontName /NotoSans /Flags 4 ` +
      `/FontBBox [ ${font.bbox.map((value) => Math.round(value * scale)).join(" ")} ] ` +
      `/ItalicAngle ${Math.round(font.italicAngle)} ` +
      `/Ascent ${Math.round(font.ascender * scale)} ` +
      `/Descent ${Math.round(font.descender * scale)} ` +
      `/CapHeight ${Math.round(font.capHeight * scale)} ` +
      `/StemV 80 /FontFile2 ${fontFileId} 0 R >>`,
  );

  // Widths are indexed by subset glyph id, which is dense from zero.
  const widths = subset.advanceWidths
    .map((width) => Math.round(width * scale))
    .join(" ");
  const descendantId = addObject(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSans ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [ 0 [ ${widths} ] ] ` +
      `/CIDToGIDMap /Identity >>`,
  );

  // ToUnicode keeps extraction, copy/paste and search on the original text.
  const bfChars = [...glyphText.entries()]
    .map(([glyph, character]) => {
      const subsetGlyph = subset.glyphMap.get(glyph);
      if (subsetGlyph === undefined) return undefined;
      const source = subsetGlyph.toString(16).padStart(4, "0").toUpperCase();
      const target = [...character]
        .map((part) => utf16BeHex(part.codePointAt(0)!))
        .join("");
      return `<${source}> <${target}>`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .sort();

  const bfBlocks: string[] = [];
  for (let i = 0; i < bfChars.length; i += 100) {
    const block = bfChars.slice(i, i + 100);
    bfBlocks.push(
      `${block.length} beginbfchar\n${block.join("\n")}\nendbfchar`,
    );
  }
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${bfBlocks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
  const toUnicodeId = addObject(
    `<< /Length ${Buffer.byteLength(toUnicode, "utf8")} >>\nstream\n${toUnicode}\nendstream`,
  );

  const fontId = addObject(
    `<< /Type /Font /Subtype /Type0 /BaseFont /NotoSans /Encoding /Identity-H ` +
      `/DescendantFonts [ ${descendantId} 0 R ] /ToUnicode ${toUnicodeId} 0 R >>`,
  );

  // --- Pages --------------------------------------------------------------
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    let y = top;
    const contentOps = pageLines
      .map((text) => {
        const op = line(y, text);
        y -= lineHeight;
        return op;
      })
      .join("\n");
    const stream = `${contentOps}\n`;
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = addObject(
    `<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`,
  );

  // Patch page parent references now that pages object id is known.
  for (const pageId of pageIds) {
    const index = pageId - 1;
    objects[index] = Buffer.from(
      objects[index]!.toString("latin1").replace(
        "/Parent 0 0 R",
        `/Parent ${pagesId} 0 R`,
      ),
      "latin1",
    );
  }

  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // --- Serialise ----------------------------------------------------------
  // A binary comment on line two marks the file as binary for transfer tools.
  const parts: Buffer[] = [
    Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"),
  ];
  let length = parts[0]!.length;
  const byteOffsets: number[] = [0];

  for (let i = 0; i < objects.length; i += 1) {
    byteOffsets[i + 1] = length;
    const head = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
    const tail = Buffer.from("\nendobj\n", "latin1");
    parts.push(head, objects[i]!, tail);
    length += head.length + objects[i]!.length + tail.length;
  }

  const xrefStart = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(byteOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  xref += `startxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(parts);
};
