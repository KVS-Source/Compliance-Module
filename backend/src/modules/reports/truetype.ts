/**
 * Minimal TrueType reader and subsetter for the report PDF writer.
 *
 * Only the parts a PDF `CIDFontType2` descendant font needs are implemented:
 * a Unicode → glyph id lookup, advance widths, the metrics the font descriptor
 * carries, and a subsetter that emits a valid stand-alone TrueType file holding
 * just the glyphs a document actually uses.
 *
 * The subset keeps `glyf`, `loca`, `head`, `hhea`, `hmtx` and `maxp`. Hinting
 * tables (`cvt `, `fpgm`, `prep`) are dropped — PDF viewers render the outlines
 * unhinted, which is what a printed board pack needs. No `cmap` is emitted:
 * the PDF addresses glyphs directly through `/Encoding /Identity-H` with
 * `/CIDToGIDMap /Identity`, so the character mapping lives in the PDF's
 * `ToUnicode` CMap rather than in the font programme.
 */

/** A parsed TrueType font, limited to what the PDF writer consumes. */
export interface TrueTypeFont {
  readonly data: Buffer;
  readonly tables: ReadonlyMap<string, { offset: number; length: number }>;
  readonly unitsPerEm: number;
  readonly numGlyphs: number;
  readonly indexToLocFormat: number;
  readonly loca: readonly number[];
  readonly cmap: ReadonlyMap<number, number>;
  readonly advanceWidths: readonly number[];
  readonly bbox: readonly [number, number, number, number];
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly italicAngle: number;
}

const tag = (data: Buffer, offset: number) =>
  data.toString("latin1", offset, offset + 4);

/** Reads the 16-byte table directory at the head of the file. */
const readTableDirectory = (data: Buffer) => {
  const tables = new Map<string, { offset: number; length: number }>();
  const numTables = data.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    tables.set(tag(data, record), {
      offset: data.readUInt32BE(record + 8),
      length: data.readUInt32BE(record + 12),
    });
  }
  return tables;
};

/**
 * Builds the Unicode → glyph id map. Formats 4 (BMP) and 12 (full range) are
 * supported; a format 12 subtable wins when the font offers both, so
 * astral-plane code points resolve when the font actually covers them.
 */
const readCmap = (data: Buffer, offset: number) => {
  const map = new Map<number, number>();
  const numSubtables = data.readUInt16BE(offset + 2);

  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < numSubtables; i += 1) {
    const record = offset + 4 + i * 8;
    const platform = data.readUInt16BE(record);
    const encoding = data.readUInt16BE(record + 2);
    const subtable = offset + data.readUInt32BE(record + 4);
    if (subtable + 2 > data.length) continue;
    const format = data.readUInt16BE(subtable);
    // Prefer a full-range (format 12) Unicode subtable over a BMP-only one.
    let score = -1;
    if (platform === 3 && encoding === 10 && format === 12) score = 5;
    else if (platform === 0 && format === 12) score = 4;
    else if (platform === 3 && encoding === 1 && format === 4) score = 3;
    else if (platform === 0 && format === 4) score = 2;
    if (score > bestScore) {
      bestScore = score;
      best = subtable;
    }
  }
  if (best < 0) return map;

  const format = data.readUInt16BE(best);
  if (format === 4) {
    const segCountX2 = data.readUInt16BE(best + 6);
    const segCount = segCountX2 / 2;
    const endsAt = best + 14;
    const startsAt = endsAt + segCountX2 + 2;
    const deltasAt = startsAt + segCountX2;
    const rangesAt = deltasAt + segCountX2;
    for (let seg = 0; seg < segCount; seg += 1) {
      const end = data.readUInt16BE(endsAt + seg * 2);
      const start = data.readUInt16BE(startsAt + seg * 2);
      const delta = data.readInt16BE(deltasAt + seg * 2);
      const rangeOffset = data.readUInt16BE(rangesAt + seg * 2);
      if (start > end) continue;
      for (let cp = start; cp <= end; cp += 1) {
        if (cp === 0xffff) continue;
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (cp + delta) & 0xffff;
        } else {
          const at = rangesAt + seg * 2 + rangeOffset + (cp - start) * 2;
          if (at + 1 >= data.length) continue;
          glyph = data.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) map.set(cp, glyph);
      }
    }
    return map;
  }

  if (format === 12) {
    const numGroups = data.readUInt32BE(best + 12);
    for (let group = 0; group < numGroups; group += 1) {
      const at = best + 16 + group * 12;
      const start = data.readUInt32BE(at);
      const end = data.readUInt32BE(at + 4);
      const startGlyph = data.readUInt32BE(at + 8);
      // Guard against pathological ranges in a malformed font.
      if (end < start || end - start > 0x10ffff) continue;
      for (let cp = start; cp <= end; cp += 1) {
        map.set(cp, startGlyph + (cp - start));
      }
    }
  }
  return map;
};

/** Parses the subset of the font tables the PDF writer relies on. */
export const parseTrueType = (data: Buffer): TrueTypeFont => {
  const tables = readTableDirectory(data);
  const required = ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap"];
  for (const name of required) {
    if (!tables.has(name)) {
      throw new Error(`Report font is missing the required "${name}" table`);
    }
  }

  const head = tables.get("head")!;
  const unitsPerEm = data.readUInt16BE(head.offset + 18);
  const indexToLocFormat = data.readInt16BE(head.offset + 50);
  const bbox: [number, number, number, number] = [
    data.readInt16BE(head.offset + 36),
    data.readInt16BE(head.offset + 38),
    data.readInt16BE(head.offset + 40),
    data.readInt16BE(head.offset + 42),
  ];

  const maxp = tables.get("maxp")!;
  const numGlyphs = data.readUInt16BE(maxp.offset + 4);

  const hhea = tables.get("hhea")!;
  const ascender = data.readInt16BE(hhea.offset + 4);
  const descender = data.readInt16BE(hhea.offset + 6);
  const numberOfHMetrics = data.readUInt16BE(hhea.offset + 34);

  const hmtx = tables.get("hmtx")!;
  const advanceWidths: number[] = [];
  let lastAdvance = 0;
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    if (glyph < numberOfHMetrics) {
      lastAdvance = data.readUInt16BE(hmtx.offset + glyph * 4);
    }
    // Glyphs past `numberOfHMetrics` reuse the final advance by definition.
    advanceWidths.push(lastAdvance);
  }

  const locaTable = tables.get("loca")!;
  const loca: number[] = [];
  for (let i = 0; i <= numGlyphs; i += 1) {
    loca.push(
      indexToLocFormat === 0
        ? data.readUInt16BE(locaTable.offset + i * 2) * 2
        : data.readUInt32BE(locaTable.offset + i * 4),
    );
  }

  const os2 = tables.get("OS/2");
  let capHeight = Math.round(ascender * 0.7);
  if (os2 && data.readUInt16BE(os2.offset) >= 2 && os2.length >= 90) {
    const value = data.readInt16BE(os2.offset + 88);
    if (value > 0) capHeight = value;
  }

  const post = tables.get("post");
  const italicAngle = post ? data.readInt32BE(post.offset + 4) / 65536 : 0;

  return {
    data,
    tables,
    unitsPerEm,
    numGlyphs,
    indexToLocFormat,
    loca,
    cmap: readCmap(data, tables.get("cmap")!.offset),
    advanceWidths,
    bbox,
    ascender,
    descender,
    capHeight,
    italicAngle,
  };
};

/** Byte offsets of every component glyph id inside a composite glyph. */
const componentGlyphOffsets = (data: Buffer, start: number, end: number) => {
  const offsets: number[] = [];
  if (end - start < 10) return offsets;
  if (data.readInt16BE(start) >= 0) return offsets; // simple glyph

  let at = start + 10;
  for (;;) {
    if (at + 4 > end) break;
    const flags = data.readUInt16BE(at);
    offsets.push(at + 2);
    at += 4;
    at += flags & 0x0001 ? 4 : 2; // ARG_1_AND_2_ARE_WORDS
    if (flags & 0x0008)
      at += 2; // WE_HAVE_A_SCALE
    else if (flags & 0x0040)
      at += 4; // WE_HAVE_AN_X_AND_Y_SCALE
    else if (flags & 0x0080) at += 8; // WE_HAVE_A_TWO_BY_TWO
    if (!(flags & 0x0020)) break; // MORE_COMPONENTS
  }
  return offsets;
};

/**
 * Expands a glyph set so every component of a composite glyph is present.
 * Accented glyphs such as `ã` are composites referencing a base letter and a
 * mark; dropping either would emit a blank where the character should be.
 */
const withComposites = (font: TrueTypeFont, wanted: Iterable<number>) => {
  const glyf = font.tables.get("glyf")!;
  const resolved = new Set<number>([0]);
  const queue = [...wanted];
  while (queue.length > 0) {
    const glyph = queue.pop()!;
    if (glyph >= font.numGlyphs || resolved.has(glyph)) continue;
    resolved.add(glyph);
    const start = glyf.offset + (font.loca[glyph] ?? 0);
    const end = glyf.offset + (font.loca[glyph + 1] ?? 0);
    if (end <= start) continue;
    for (const at of componentGlyphOffsets(font.data, start, end)) {
      queue.push(font.data.readUInt16BE(at));
    }
  }
  return [...resolved].sort((a, b) => a - b);
};

const padTo4 = (length: number) => (4 - (length % 4)) % 4;

/** Sums a table's bytes as big-endian uint32 words, per the sfnt spec. */
const tableChecksum = (buffer: Buffer) => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    sum = (sum + buffer.readUInt32BE(i)) >>> 0;
  }
  return sum >>> 0;
};

export interface TrueTypeSubset {
  /** A stand-alone TrueType file holding only the requested glyphs. */
  readonly font: Buffer;
  /** Original glyph id → glyph id inside the subset. */
  readonly glyphMap: ReadonlyMap<number, number>;
  /** Advance widths, indexed by subset glyph id, in font units. */
  readonly advanceWidths: readonly number[];
}

/**
 * Emits a TrueType file containing `glyphIds` (plus `.notdef` and any composite
 * components they need), renumbered densely from zero.
 */
export const subsetTrueType = (
  font: TrueTypeFont,
  glyphIds: Iterable<number>,
): TrueTypeSubset => {
  const kept = withComposites(font, glyphIds);
  const glyphMap = new Map<number, number>();
  kept.forEach((oldGlyph, index) => glyphMap.set(oldGlyph, index));

  const sourceGlyf = font.tables.get("glyf")!;
  const glyphBuffers: Buffer[] = [];
  const locaOffsets: number[] = [];
  let running = 0;

  for (const oldGlyph of kept) {
    locaOffsets.push(running);
    const start = sourceGlyf.offset + (font.loca[oldGlyph] ?? 0);
    const end = sourceGlyf.offset + (font.loca[oldGlyph + 1] ?? 0);
    if (end <= start) continue;

    const glyph = Buffer.from(font.data.subarray(start, end));
    // Repoint composite components at their subset glyph ids.
    for (const at of componentGlyphOffsets(font.data, start, end)) {
      const component = font.data.readUInt16BE(at);
      glyph.writeUInt16BE(glyphMap.get(component) ?? 0, at - start);
    }
    const padded = Buffer.concat([glyph, Buffer.alloc(padTo4(glyph.length))]);
    glyphBuffers.push(padded);
    running += padded.length;
  }
  locaOffsets.push(running);

  const glyf = Buffer.concat(glyphBuffers);

  const loca = Buffer.alloc((kept.length + 1) * 4);
  locaOffsets.forEach((offset, index) => loca.writeUInt32BE(offset, index * 4));

  const advanceWidths = kept.map(
    (oldGlyph) => font.advanceWidths[oldGlyph] ?? 0,
  );
  const hmtx = Buffer.alloc(kept.length * 4);
  advanceWidths.forEach((width, index) => {
    hmtx.writeUInt16BE(width, index * 4);
    hmtx.writeInt16BE(0, index * 4 + 2); // left side bearing
  });

  const sourceHead = font.tables.get("head")!;
  const head = Buffer.from(
    font.data.subarray(
      sourceHead.offset,
      sourceHead.offset + sourceHead.length,
    ),
  );
  head.writeUInt32BE(0, 8); // checkSumAdjustment, recomputed below
  head.writeInt16BE(1, 50); // indexToLocFormat: long offsets

  const sourceHhea = font.tables.get("hhea")!;
  const hhea = Buffer.from(
    font.data.subarray(
      sourceHhea.offset,
      sourceHhea.offset + sourceHhea.length,
    ),
  );
  hhea.writeUInt16BE(kept.length, 34); // numberOfHMetrics

  const sourceMaxp = font.tables.get("maxp")!;
  const maxp = Buffer.from(
    font.data.subarray(
      sourceMaxp.offset,
      sourceMaxp.offset + sourceMaxp.length,
    ),
  );
  maxp.writeUInt16BE(kept.length, 4); // numGlyphs

  // Table records must be sorted by tag.
  const entries: { name: string; data: Buffer }[] = [
    { name: "glyf", data: glyf },
    { name: "head", data: head },
    { name: "hhea", data: hhea },
    { name: "hmtx", data: hmtx },
    { name: "loca", data: loca },
    { name: "maxp", data: maxp },
  ].sort((a, b) => (a.name < b.name ? -1 : 1));

  const numTables = entries.length;
  const directorySize = 12 + numTables * 16;
  let offset = directorySize;
  const placed = entries.map((entry) => {
    const at = offset;
    offset += entry.data.length + padTo4(entry.data.length);
    return { ...entry, offset: at };
  });

  const directory = Buffer.alloc(directorySize);
  directory.writeUInt32BE(0x00010000, 0); // sfnt version
  directory.writeUInt16BE(numTables, 4);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  directory.writeUInt16BE(searchRange, 6);
  directory.writeUInt16BE(entrySelector, 8);
  directory.writeUInt16BE(numTables * 16 - searchRange, 10);

  placed.forEach((entry, index) => {
    const record = 12 + index * 16;
    directory.write(entry.name, record, 4, "latin1");
    directory.writeUInt32BE(
      tableChecksum(
        Buffer.concat([entry.data, Buffer.alloc(padTo4(entry.data.length))]),
      ),
      record + 4,
    );
    directory.writeUInt32BE(entry.offset, record + 8);
    directory.writeUInt32BE(entry.data.length, record + 12);
  });

  const parts: Buffer[] = [directory];
  for (const entry of placed) {
    parts.push(entry.data, Buffer.alloc(padTo4(entry.data.length)));
  }
  const output = Buffer.concat(parts);

  // head.checkSumAdjustment closes the whole-file checksum, per the spec.
  const headEntry = placed.find((entry) => entry.name === "head")!;
  const adjustment = (0xb1b0afba - tableChecksum(output)) >>> 0;
  output.writeUInt32BE(adjustment, headEntry.offset + 8);

  return { font: output, glyphMap, advanceWidths };
};
