import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import { AppError } from "../../common/errors/app-error.js";

export const EVIDENCE_UPLOAD_FIELD = "file";
export const EVIDENCE_FILENAME_MAX = 200;

export const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
]);

const MIME_BY_EXT: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".csv": ["text/csv", "text/plain"],
  ".txt": ["text/plain"],
};

const DETECTED_MIME_BY_EXT: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

export type ValidatedEvidenceFile = {
  extension: string;
  declaredMime: string;
  detectedMimeType: string;
  originalFileName: string;
};

const normalizeExtension = (filename: string): string | null => {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return base.slice(dot).toLowerCase();
};

const normalizeMime = (value: string | undefined): string =>
  (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

/**
 * Sanitize client filename for storage/display only (never for paths).
 */
export const sanitizeEvidenceFilename = (
  rawName: string | undefined,
  extension: string,
): string => {
  const fallbackBase = `evidence-file${extension}`;
  const raw = (rawName ?? "").normalize("NFC");
  let base = raw.split(/[/\\]/).pop() ?? "";
  base = stripControlChars(base);
  base = base.replace(/["\\\r\n;]/g, "_").trim();
  if (!base) return fallbackBase;
  const lower = base.toLowerCase();
  if (!lower.endsWith(extension)) {
    const without = base.includes(".")
      ? base.slice(0, base.lastIndexOf("."))
      : base;
    base = `${without}${extension}`;
  }
  if (base.length > EVIDENCE_FILENAME_MAX) {
    const keepExt = extension.length;
    const stem = base.slice(0, Math.max(1, EVIDENCE_FILENAME_MAX - keepExt));
    base = `${stem}${extension}`;
  }
  return base.length > 0 ? base : fallbackBase;
};

const stripControlChars = (value: string) =>
  [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");

export const buildContentDisposition = (filename: string): string => {
  const safe = stripControlChars(filename).replace(/["\\\r\n]/g, "_");
  const ascii = safe
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180);
  const encoded = encodeURIComponent(safe)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  const fallback = ascii.length > 0 ? ascii : "evidence-file.bin";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

const assertTextPolicy = async (absolutePath: string) => {
  const handle = await open(absolutePath, "r");
  try {
    const sample = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const buf = sample.subarray(0, bytesRead);
    if (buf.includes(0)) {
      throw new AppError(
        400,
        "EVIDENCE_FILE_SIGNATURE_INVALID",
        "Text evidence must not contain binary null bytes",
      );
    }
    // High ratio of non-printable (excluding common whitespace) => binary
    let nonPrintable = 0;
    for (const byte of buf) {
      if (
        byte !== 0x09 &&
        byte !== 0x0a &&
        byte !== 0x0d &&
        (byte < 0x20 || byte > 0x7e)
      ) {
        nonPrintable += 1;
      }
    }
    if (buf.length > 0 && nonPrintable / buf.length > 0.3) {
      throw new AppError(
        400,
        "EVIDENCE_FILE_SIGNATURE_INVALID",
        "Text evidence appears to be binary content",
      );
    }
  } finally {
    await handle.close();
  }
};

export const validateEvidenceUploadFile = async (input: {
  absolutePath: string;
  clientFilename: string | undefined;
  declaredMime: string | undefined;
  byteSize: number;
}): Promise<ValidatedEvidenceFile> => {
  if (input.byteSize <= 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Evidence file must not be empty",
    );
  }

  const extension = normalizeExtension(input.clientFilename ?? "");
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new AppError(
      400,
      "EVIDENCE_FILE_TYPE_NOT_ALLOWED",
      "Evidence file type is not allowed",
    );
  }

  const declared = normalizeMime(input.declaredMime);
  const allowedMimes = MIME_BY_EXT[extension] ?? [];
  if (!declared || !allowedMimes.includes(declared)) {
    throw new AppError(
      400,
      "EVIDENCE_FILE_TYPE_NOT_ALLOWED",
      "Evidence file content type is not allowed",
    );
  }

  const isText = extension === ".csv" || extension === ".txt";
  if (isText) {
    await assertTextPolicy(input.absolutePath);
    return {
      extension,
      declaredMime: declared,
      detectedMimeType: "text/plain",
      originalFileName: sanitizeEvidenceFilename(
        input.clientFilename,
        extension,
      ),
    };
  }

  const detected = await fileTypeFromFile(input.absolutePath);
  if (!detected?.mime) {
    throw new AppError(
      400,
      "EVIDENCE_FILE_SIGNATURE_INVALID",
      "Evidence file signature could not be verified",
    );
  }
  const expected = DETECTED_MIME_BY_EXT[extension] ?? [];
  if (!expected.includes(detected.mime)) {
    // file-type may report application/zip for some OOXML; refine
    if (
      (extension === ".docx" || extension === ".xlsx") &&
      detected.mime === "application/zip"
    ) {
      const ok = await assertOoxmlKind(input.absolutePath, extension);
      if (!ok) {
        throw new AppError(
          400,
          "EVIDENCE_FILE_SIGNATURE_INVALID",
          "Evidence file signature does not match the declared type",
        );
      }
    } else {
      throw new AppError(
        400,
        "EVIDENCE_FILE_SIGNATURE_INVALID",
        "Evidence file signature does not match the declared type",
      );
    }
  }

  const detectedMimeType =
    extension === ".docx"
      ? MIME_BY_EXT[".docx"]![0]!
      : extension === ".xlsx"
        ? MIME_BY_EXT[".xlsx"]![0]!
        : detected.mime;

  return {
    extension,
    declaredMime: declared,
    detectedMimeType,
    originalFileName: sanitizeEvidenceFilename(
      input.clientFilename,
      extension,
    ),
  };
};

/** Distinguish docx/xlsx from generic zip by scanning central directory names. */
const assertOoxmlKind = async (
  absolutePath: string,
  extension: ".docx" | ".xlsx" | string,
): Promise<boolean> => {
  const stream = createReadStream(absolutePath, { highWaterMark: 256 * 1024 });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    total += buf.length;
    if (total > 512 * 1024) break;
  }
  const data = Buffer.concat(chunks);
  const asString = data.toString("binary");
  if (!asString.includes("[Content_Types].xml")) return false;
  if (extension === ".docx") {
    return (
      asString.includes("word/") || asString.includes("word\\")
    );
  }
  if (extension === ".xlsx") {
    return asString.includes("xl/") || asString.includes("xl\\");
  }
  return false;
};
