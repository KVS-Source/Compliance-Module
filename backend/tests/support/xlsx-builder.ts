import { deflateRawSync } from "node:zlib";

/**
 * Builds a real `.xlsx` archive in memory so the workbook reader is tested
 * against bytes rather than a mocked parser. Fixtures stay anonymised: no
 * client workbook is committed to the repository.
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

export const buildZip = (entries: readonly Entry[]) => {
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
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, stored);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
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

export interface SheetSpec {
  readonly name: string;
  /** Raw `<row>` XML, so tests can exercise sparse and self-closing cells. */
  readonly rowsXml: string;
}

export const buildWorkbook = (
  sheets: readonly SheetSpec[],
  sharedStrings: readonly string[] = [],
  options: { readonly deflate?: boolean } = {},
) => {
  const deflate = options.deflate ?? true;
  const entries: Entry[] = [
    {
      name: "xl/workbook.xml",
      deflate,
      data: Buffer.from(
        `<?xml version="1.0"?><workbook xmlns:r="x"><sheets>${sheets
          .map(
            (sheet, index) =>
              `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
          )
          .join("")}</sheets></workbook>`,
        "utf8",
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      deflate,
      data: Buffer.from(
        `<?xml version="1.0"?><Relationships>${sheets
          .map(
            (_sheet, index) =>
              `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join("")}</Relationships>`,
        "utf8",
      ),
    },
  ];
  if (sharedStrings.length > 0) {
    entries.push({
      name: "xl/sharedStrings.xml",
      deflate,
      data: Buffer.from(
        `<?xml version="1.0"?><sst count="${sharedStrings.length}">${sharedStrings
          .map((value) => `<si><t>${value}</t></si>`)
          .join("")}</sst>`,
        "utf8",
      ),
    });
  }
  sheets.forEach((sheet, index) => {
    entries.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      deflate,
      data: Buffer.from(
        `<?xml version="1.0"?><worksheet><sheetData>${sheet.rowsXml}</sheetData></worksheet>`,
        "utf8",
      ),
    });
  });
  return buildZip(entries);
};
