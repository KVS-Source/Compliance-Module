/**
 * Minimal PDF writer for report board packs.
 *
 * Avoids a heavy PDF library dependency: report tables are rendered as plain
 * Helvetica text pages. This is not a full layout engine — it is enough for a
 * printable board pack of the same rows the CSV export carries.
 */

export type PdfTableColumn = { key: string; header: string };
export type PdfTableRow = Record<string, string | number | null | undefined>;

const escapePdf = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");

const line = (y: number, text: string, size = 10) =>
  `BT /F1 ${size} Tf 40 ${y} Td (${escapePdf(text)}) Tj ET`;

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

  const objects: string[] = [];
  const offsets: number[] = [0];

  const addObject = (body: string) => {
    offsets.push(0); // filled later
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageIds: number[] = [];
  const contentIds: number[] = [];

  for (const pageLines of pages) {
    let y = top;
    const contentOps = pageLines
      .map((text) => {
        const op = line(y, text, 9);
        y -= lineHeight;
        return op;
      })
      .join("\n");
    const stream = `${contentOps}\n`;
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    );
    contentIds.push(contentId);
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
  for (let i = 0; i < pageIds.length; i += 1) {
    const idx = pageIds[i]! - 1;
    objects[idx] = objects[idx]!.replace(
      "/Parent 0 0 R",
      `/Parent ${pagesId} 0 R`,
    );
  }

  const catalogId = addObject(
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
  );

  let pdf = "%PDF-1.4\n";
  const byteOffsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    byteOffsets[i + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(byteOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
};
