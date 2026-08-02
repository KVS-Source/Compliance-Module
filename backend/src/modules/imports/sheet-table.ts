import type { CellValue, WorkbookSheet } from "./xlsx/workbook-reader.js";
import { normaliseHeader, normaliseText } from "./normalise.js";

/**
 * A workbook sheet viewed as a header-addressed table.
 *
 * The client workbooks put a title banner, a description and often a summary
 * band above the real header row, so the header row is declared per sheet in
 * `sheet-plan.ts` rather than guessed.
 */

export interface SheetRow {
  /** 1-based worksheet row number, used verbatim in error reporting. */
  readonly rowNumber: number;
  /** Reads a cell by normalised header; `undefined` when the column is absent. */
  cell(header: string): CellValue;
  /** All non-empty values keyed by their original header label. */
  readonly labelled: Readonly<Record<string, string>>;
  /** True when every cell in the row is blank. */
  readonly isEmpty: boolean;
}

export class SheetTable {
  private constructor(
    readonly sheetName: string,
    private readonly headerIndex: ReadonlyMap<string, number>,
    private readonly headerLabels: readonly string[],
    readonly rows: readonly SheetRow[],
  ) {}

  static from(sheet: WorkbookSheet, headerRow: number) {
    const header = sheet.rows[headerRow - 1] ?? [];
    const headerIndex = new Map<string, number>();
    const headerLabels: string[] = [];
    header.forEach((value, column) => {
      const label = normaliseText(value);
      const key = normaliseHeader(value);
      headerLabels[column] = label ?? "";
      // First occurrence wins: some sheets repeat a decorative column.
      if (key !== "" && !headerIndex.has(key)) headerIndex.set(key, column);
    });

    const rows: SheetRow[] = [];
    for (let index = headerRow; index < sheet.rows.length; index += 1) {
      const cells = sheet.rows[index] ?? [];
      const isEmpty = cells.every(
        (cell) => cell === null || String(cell).trim() === "",
      );
      // Every register in these workbooks separates its data table from the
      // appendix below it — heat maps, agenda helpers, KPI snapshots — with a
      // blank row. Stopping there keeps a decorative banner from being read as
      // a record, which no per-sheet text heuristic could do reliably.
      if (isEmpty) break;
      const labelled: Record<string, string> = {};
      cells.forEach((cell, column) => {
        const label = headerLabels[column];
        const text = normaliseText(cell);
        if (label && text !== undefined) labelled[label] = text;
      });
      rows.push({
        rowNumber: index + 1,
        cell: (headerKey: string) => {
          const column = headerIndex.get(headerKey);
          return column === undefined ? null : (cells[column] ?? null);
        },
        labelled,
        isEmpty,
      });
    }
    return new SheetTable(sheet.name, headerIndex, headerLabels, rows);
  }

  has(header: string) {
    return this.headerIndex.has(header);
  }

  missingHeaders(required: readonly string[]) {
    return required.filter((header) => header !== "" && !this.has(header));
  }

  /** Original header labels in column order, for register field configuration. */
  labels() {
    return this.headerLabels.filter((label) => label !== "");
  }

  /** Rows with at least one populated cell. */
  dataRows() {
    return this.rows.filter((row) => !row.isEmpty);
  }
}
