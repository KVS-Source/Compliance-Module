import { ZipArchive, ZipFormatError } from "./zip.js";

/**
 * Reads the subset of SpreadsheetML this project's client workbooks use:
 * shared strings, inline strings, numbers, booleans and cached formula
 * results. Styles are deliberately not interpreted — see `readCell`.
 */

export type CellValue = string | number | boolean | null;

export interface WorkbookSheet {
  readonly name: string;
  /** 1-based sheet position in the workbook's tab order. */
  readonly position: number;
  /** Dense row-major grid. Trailing empty rows and columns are trimmed. */
  readonly rows: readonly (readonly CellValue[])[];
}

export interface ParsedWorkbook {
  readonly sheets: readonly WorkbookSheet[];
  sheet(name: string): WorkbookSheet | undefined;
}

export class WorkbookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookFormatError";
  }
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export const decodeXmlText = (value: string) =>
  value.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return XML_ENTITIES[entity] ?? match;
  });

const attribute = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXmlText(match[1]!) : undefined;
};

interface XmlElement {
  /** Raw attribute text, without the trailing slash of a self-closing tag. */
  readonly attributes: string;
  /** Inner XML, empty for a self-closing element. */
  readonly body: string;
}

/**
 * Walks every `<name …>…</name>` and `<name … />` element at or below the
 * current position.
 *
 * A single alternating regex cannot do this safely: `<c …>` and `<c … />`
 * share a prefix, so an open-tag branch happily matches a self-closing tag and
 * then consumes the following siblings up to the next closing tag. Detecting
 * the self-closing form explicitly keeps each element's body its own.
 */
const forEachElement = (
  xml: string,
  name: string,
  visit: (element: XmlElement) => void,
) => {
  const openPattern = new RegExp(`<${name}\\b([^>]*)>`, "g");
  let match: RegExpExecArray | null;
  while ((match = openPattern.exec(xml)) !== null) {
    const raw = match[1] ?? "";
    if (raw.endsWith("/")) {
      visit({ attributes: raw.slice(0, -1), body: "" });
      continue;
    }
    const closing = `</${name}>`;
    const end = xml.indexOf(closing, openPattern.lastIndex);
    if (end === -1) {
      visit({ attributes: raw, body: xml.slice(openPattern.lastIndex) });
      break;
    }
    visit({ attributes: raw, body: xml.slice(openPattern.lastIndex, end) });
    openPattern.lastIndex = end + closing.length;
  }
};

/** Concatenates the text of every `<t>` descendant, including rich-text runs. */
const collectText = (xml: string) => {
  let text = "";
  forEachElement(xml, "t", (element) => {
    text += decodeXmlText(element.body);
  });
  return text;
};

/**
 * Converts an A1-style column reference to a 0-based index. Cells are keyed by
 * reference rather than position because writers omit empty cells entirely.
 */
export const columnIndexFromReference = (reference: string) => {
  let index = 0;
  for (const character of reference) {
    const code = character.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
};

/**
 * Reads the shared-string table. Each `<si>` may hold a single `<t>` or a
 * sequence of rich-text runs (`<r><t>`); both flatten to the same plain text.
 * `xml:space="preserve"` content is kept verbatim.
 */
const readSharedStrings = (xml: string) => {
  const strings: string[] = [];
  forEachElement(xml, "si", (element) => {
    strings.push(collectText(element.body));
  });
  return strings;
};

const readWorkbookSheets = (xml: string) => {
  const sheets: { name: string; relationshipId: string; position: number }[] =
    [];
  forEachElement(xml, "sheet", (element) => {
    const name = attribute(element.attributes, "name");
    const relationshipId =
      attribute(element.attributes, "r:id") ??
      attribute(element.attributes, "relationshipId");
    if (name && relationshipId) {
      sheets.push({ name, relationshipId, position: sheets.length + 1 });
    }
  });
  return sheets;
};

const readRelationships = (xml: string) => {
  const relationships = new Map<string, string>();
  forEachElement(xml, "Relationship", (element) => {
    const id = attribute(element.attributes, "Id");
    const target = attribute(element.attributes, "Target");
    if (id && target) relationships.set(id, target);
  });
  return relationships;
};

const resolveSheetPath = (target: string) => {
  const normalised = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
  // Reject traversal: a relationship target must stay inside the xl/ part.
  if (normalised.includes("..")) {
    throw new WorkbookFormatError("Worksheet relationship target is unsafe");
  }
  return `xl/${normalised}`;
};

/**
 * Reads one `<c>` element. The cell's number format is intentionally ignored:
 * every sheet in the supported workbooks stores dates as text, and guessing a
 * date from a style id risks silently reinterpreting a plain number. Date-like
 * strings are normalised later, by the field parsers, where a failure to parse
 * becomes a visible row error instead of a wrong value.
 */
const readCell = (tag: string, body: string, sharedStrings: string[]) => {
  const type = attribute(tag, "t") ?? "n";
  if (type === "inlineStr") {
    const text = collectText(body);
    return text === "" ? null : text;
  }
  const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
  if (!valueMatch) return null;
  const raw = decodeXmlText(valueMatch[1] ?? "");
  if (raw === "") return null;
  if (type === "s") {
    const index = Number.parseInt(raw, 10);
    return sharedStrings[index] ?? null;
  }
  // `str` is a cached formula string; `e` is a cached formula error, which is
  // surfaced as text so a broken spreadsheet cell becomes a row error rather
  // than a silent null.
  if (type === "str" || type === "e") return raw;
  if (type === "b") return raw === "1";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
};

const readSheetRows = (xml: string, sharedStrings: string[]) => {
  const rows: CellValue[][] = [];
  let implicitRowNumber = 0;
  forEachElement(xml, "row", (row) => {
    const declared = attribute(row.attributes, "r");
    const rowNumber = declared
      ? Number.parseInt(declared, 10)
      : implicitRowNumber + 1;
    implicitRowNumber = rowNumber;
    const cells: CellValue[] = [];
    let implicitColumn = 0;
    forEachElement(row.body, "c", (cell) => {
      const reference = attribute(cell.attributes, "r");
      const column = reference
        ? columnIndexFromReference(reference)
        : implicitColumn;
      implicitColumn = column + 1;
      if (column < 0) return;
      while (cells.length < column) cells.push(null);
      cells[column] = readCell(cell.attributes, cell.body, sharedStrings);
    });
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  });
  // Trim trailing empty rows so a sheet's padded print area does not inflate
  // the reported row count.
  while (
    rows.length > 0 &&
    rows[rows.length - 1]!.every((cell) => cell === null || cell === "")
  ) {
    rows.pop();
  }
  return rows;
};

export const parseWorkbook = (buffer: Buffer): ParsedWorkbook => {
  let archive: ZipArchive;
  try {
    archive = ZipArchive.open(buffer);
  } catch (error) {
    if (error instanceof ZipFormatError) {
      throw new WorkbookFormatError(
        "File is not a readable .xlsx workbook (unreadable ZIP container)",
      );
    }
    throw error;
  }
  if (!archive.has("xl/workbook.xml")) {
    throw new WorkbookFormatError(
      "File is not a readable .xlsx workbook (missing xl/workbook.xml)",
    );
  }
  const sharedStrings = archive.has("xl/sharedStrings.xml")
    ? readSharedStrings(archive.readText("xl/sharedStrings.xml"))
    : [];
  const relationships = archive.has("xl/_rels/workbook.xml.rels")
    ? readRelationships(archive.readText("xl/_rels/workbook.xml.rels"))
    : new Map<string, string>();
  const declarations = readWorkbookSheets(archive.readText("xl/workbook.xml"));
  if (declarations.length === 0) {
    throw new WorkbookFormatError("Workbook declares no worksheets");
  }
  const sheets = declarations.map((declaration) => {
    const target = relationships.get(declaration.relationshipId);
    if (!target) {
      throw new WorkbookFormatError(
        `Worksheet "${declaration.name}" has no resolvable part`,
      );
    }
    const path = resolveSheetPath(target);
    if (!archive.has(path)) {
      throw new WorkbookFormatError(
        `Worksheet "${declaration.name}" part is missing from the archive`,
      );
    }
    return {
      name: declaration.name,
      position: declaration.position,
      rows: readSheetRows(archive.readText(path), sharedStrings),
    } satisfies WorkbookSheet;
  });
  const byName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  return { sheets, sheet: (name: string) => byName.get(name) };
};
