import { deflateRawSync } from "node:zlib";

/**
 * Minimal SpreadsheetML writer used to adapt typed CSV imports onto the
 * existing workbook validation pipeline. Not a general-purpose Excel library.
 */

interface Entry {
  readonly name: string;
  readonly data: Buffer;
  readonly deflate: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZip = (entries: readonly Entry[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const stored = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const method = entry.deflate ? 8 : 0;
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, stored);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + stored.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const colName = (index: number): string => {
  let n = index;
  let name = "";
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
};

/**
 * Builds a single-sheet workbook with the header at `headerRow` (1-based) so
 * existing SheetPlan validation can run unchanged.
 */
export const buildSingleSheetWorkbook = (options: {
  sheetName: string;
  headerRow: number;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}): Buffer => {
  const shared: string[] = [];
  const indexOf = (value: string) => {
    const existing = shared.indexOf(value);
    if (existing >= 0) return existing;
    shared.push(value);
    return shared.length - 1;
  };

  const sheetRows: string[] = [];
  for (let r = 1; r < options.headerRow; r += 1) {
    sheetRows.push(`<row r="${r}"/>`);
  }
  const headerCells = options.headers
    .map(
      (header, column) =>
        `<c r="${colName(column)}${options.headerRow}" t="s"><v>${indexOf(header)}</v></c>`,
    )
    .join("");
  sheetRows.push(`<row r="${options.headerRow}">${headerCells}</row>`);
  options.rows.forEach((row, offset) => {
    const rowNumber = options.headerRow + 1 + offset;
    const cells = row
      .map((value, column) => {
        if (value === "") return "";
        return `<c r="${colName(column)}${rowNumber}" t="s"><v>${indexOf(value)}</v></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${rowNumber}">${cells}</row>`);
  });

  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}
</sst>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows.join("")}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(options.sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  return buildZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes), deflate: true },
    { name: "_rels/.rels", data: Buffer.from(relsXml), deflate: true },
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml), deflate: true },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(workbookRelsXml),
      deflate: true,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(sheetXml),
      deflate: true,
    },
    {
      name: "xl/sharedStrings.xml",
      data: Buffer.from(sharedXml),
      deflate: true,
    },
  ]);
};
