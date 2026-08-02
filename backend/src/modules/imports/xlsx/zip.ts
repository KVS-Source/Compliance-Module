import { inflateRawSync } from "node:zlib";

/**
 * Minimal read-only ZIP reader for the OOXML container.
 *
 * The repository has no spreadsheet dependency and `.xlsx` is a ZIP of XML,
 * so reading the archive directly keeps the import path free of a new
 * third-party parser. Only the two storage methods OOXML writers emit are
 * supported: stored (0) and deflate (8).
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR = 0x07064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

/** Guards a decompression bomb: no single OOXML part should exceed this. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

interface CentralDirectoryEntry {
  readonly fileName: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

const findEndOfCentralDirectory = (buffer: Buffer) => {
  // The comment field is variable length, so the record is located by scanning
  // backwards from the end for its signature.
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new ZipFormatError("End of central directory record not found");
};

/**
 * Resolves the central directory position, transparently following the ZIP64
 * locator that large workbooks use once any counter overflows 32 bits.
 */
const locateCentralDirectory = (buffer: Buffer, endOffset: number) => {
  let entryCount = buffer.readUInt16LE(endOffset + 10);
  let directoryOffset = buffer.readUInt32LE(endOffset + 16);
  const locatorOffset = endOffset - 20;
  if (
    locatorOffset >= 0 &&
    buffer.readUInt32LE(locatorOffset) ===
      ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR
  ) {
    const zip64Offset = Number(buffer.readBigUInt64LE(locatorOffset + 8));
    if (
      zip64Offset >= 0 &&
      zip64Offset + 56 <= buffer.length &&
      buffer.readUInt32LE(zip64Offset) === ZIP64_END_OF_CENTRAL_DIRECTORY
    ) {
      entryCount = Number(buffer.readBigUInt64LE(zip64Offset + 32));
      directoryOffset = Number(buffer.readBigUInt64LE(zip64Offset + 48));
    }
  }
  return { entryCount, directoryOffset };
};

/**
 * Reads the ZIP64 extended information extra field, which carries the real
 * sizes whenever the 32-bit fields are saturated with 0xffffffff.
 */
const readZip64Extra = (
  extra: Buffer,
  needsUncompressed: boolean,
  needsCompressed: boolean,
  needsOffset: boolean,
) => {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + size);
    if (headerId === 0x0001) {
      let bodyCursor = 0;
      const next = () => {
        const value = Number(body.readBigUInt64LE(bodyCursor));
        bodyCursor += 8;
        return value;
      };
      return {
        uncompressedSize:
          needsUncompressed && bodyCursor + 8 <= body.length
            ? next()
            : undefined,
        compressedSize:
          needsCompressed && bodyCursor + 8 <= body.length ? next() : undefined,
        localHeaderOffset:
          needsOffset && bodyCursor + 8 <= body.length ? next() : undefined,
      };
    }
    cursor += 4 + size;
  }
  return {};
};

const readCentralDirectory = (buffer: Buffer) => {
  const endOffset = findEndOfCentralDirectory(buffer);
  const { entryCount, directoryOffset } = locateCentralDirectory(
    buffer,
    endOffset,
  );
  const entries = new Map<string, CentralDirectoryEntry>();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) {
      throw new ZipFormatError("Central directory entry is truncated");
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new ZipFormatError("Central directory entry signature mismatch");
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    let compressedSize = buffer.readUInt32LE(cursor + 20);
    let uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    let localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");
    const extra = buffer.subarray(
      cursor + 46 + fileNameLength,
      cursor + 46 + fileNameLength + extraLength,
    );
    const zip64 = readZip64Extra(
      extra,
      uncompressedSize === 0xffffffff,
      compressedSize === 0xffffffff,
      localHeaderOffset === 0xffffffff,
    );
    uncompressedSize = zip64.uncompressedSize ?? uncompressedSize;
    compressedSize = zip64.compressedSize ?? compressedSize;
    localHeaderOffset = zip64.localHeaderOffset ?? localHeaderOffset;
    entries.set(fileName, {
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
};

/**
 * Random-access reader over an in-memory `.xlsx` archive. Entries are read on
 * demand so a workbook with many unused sheets costs only its directory scan.
 */
export class ZipArchive {
  private constructor(
    private readonly buffer: Buffer,
    private readonly entries: Map<string, CentralDirectoryEntry>,
  ) {}

  static open(buffer: Buffer) {
    if (buffer.length < 22) {
      throw new ZipFormatError("File is too small to be a ZIP archive");
    }
    return new ZipArchive(buffer, readCentralDirectory(buffer));
  }

  has(fileName: string) {
    return this.entries.has(fileName);
  }

  names() {
    return [...this.entries.keys()];
  }

  read(fileName: string): Buffer {
    const entry = this.entries.get(fileName);
    if (!entry) throw new ZipFormatError(`Archive entry not found`);
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
      throw new ZipFormatError("Archive entry exceeds the supported size");
    }
    const headerOffset = entry.localHeaderOffset;
    if (
      headerOffset + 30 > this.buffer.length ||
      this.buffer.readUInt32LE(headerOffset) !== LOCAL_FILE_HEADER
    ) {
      throw new ZipFormatError("Local file header signature mismatch");
    }
    // The local header repeats the name and extra lengths, and those are the
    // authority for where the payload starts; the central copies may differ.
    const fileNameLength = this.buffer.readUInt16LE(headerOffset + 26);
    const extraLength = this.buffer.readUInt16LE(headerOffset + 28);
    const dataOffset = headerOffset + 30 + fileNameLength + extraLength;
    const payload = this.buffer.subarray(
      dataOffset,
      dataOffset + entry.compressedSize,
    );
    if (entry.compressionMethod === STORED) return Buffer.from(payload);
    if (entry.compressionMethod === DEFLATED) {
      const inflated = inflateRawSync(payload, {
        maxOutputLength: MAX_ENTRY_BYTES,
      });
      return inflated;
    }
    throw new ZipFormatError(
      `Unsupported compression method ${entry.compressionMethod}`,
    );
  }

  readText(fileName: string) {
    return this.read(fileName).toString("utf8");
  }
}
