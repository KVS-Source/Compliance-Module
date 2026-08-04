import busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";

export const IMPORT_UPLOAD_FIELD = "file";
export const IMPORT_FILENAME_MAX = 200;

export type ParsedImportUpload = {
  tempPath: string;
  clientFilename: string;
  byteSize: number;
  contentSha256: string;
};

const ensureImportTempDir = async (tenantId: string) => {
  const root = resolve(env.LOCAL_UPLOAD_DIR);
  const dir = join(root, ".import-tmp", tenantId, randomUUID());
  const resolved = resolve(dir);
  if (!resolved.startsWith(root + sep)) {
    throw new AppError(500, "IMPORT_STORAGE_FAILED", "Import path invalid");
  }
  await mkdir(resolved, { recursive: true });
  return resolved;
};

/** Safe basename with a generated prefix; never trusts client path segments. */
export const safeImportFilename = (raw: string, extension: ".xlsx" | ".csv") => {
  const base = basename(raw || "upload")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, IMPORT_FILENAME_MAX);
  const withoutExt = base.replace(/\.(xlsx|csv)$/i, "");
  const stem = withoutExt.length > 0 ? withoutExt : "upload";
  return `${stem}${extension}`;
};

export const cleanupImportTemp = async (tempPath: string | null | undefined) => {
  if (!tempPath) return;
  const root = resolve(env.LOCAL_UPLOAD_DIR);
  const resolved = resolve(tempPath);
  if (!resolved.startsWith(root + sep)) return;
  await unlink(resolved).catch(() => undefined);
};

/**
 * Accepts a single multipart file field named `file`.
 * Writes to a tenant-scoped temporary directory under LOCAL_UPLOAD_DIR.
 */
export const parseImportMultipartUpload = (
  req: Request,
  options: {
    tenantId: string;
    maxBytes: number;
    allowedExtensions: readonly (".xlsx" | ".csv")[];
  },
): Promise<ParsedImportUpload> =>
  new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let tempPath: string | null = null;
    let fileCount = 0;
    let byteSize = 0;
    let clientFilename = "upload";
    let writeFinished = false;
    let tooLarge = false;
    const hash = createHash("sha256");
    const writePromises: Promise<void>[] = [];

    const fail = async (error: AppError) => {
      if (settled) return;
      settled = true;
      if (tempPath) await unlink(tempPath).catch(() => undefined);
      req.resume();
      rejectPromise(error);
    };

    const succeed = (payload: ParsedImportUpload) => {
      if (settled) return;
      settled = true;
      resolvePromise(payload);
    };

    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: options.maxBytes,
          fields: 2,
          parts: 4,
          headerPairs: 50,
        },
      });
    } catch {
      rejectPromise(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Invalid multipart upload request",
        ),
      );
      return;
    }

    parser.on("file", (fieldname, stream, info) => {
      if (fieldname !== IMPORT_UPLOAD_FIELD) {
        stream.resume();
        void fail(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Unexpected file field in upload",
          ),
        );
        return;
      }
      fileCount += 1;
      if (fileCount > 1) {
        stream.resume();
        void fail(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Only one import file may be uploaded",
          ),
        );
        return;
      }

      const rawName = info.filename ?? "";
      if (rawName.length > IMPORT_FILENAME_MAX * 2) {
        stream.resume();
        void fail(
          new AppError(400, "VALIDATION_ERROR", "Import filename is too long"),
        );
        return;
      }

      const ext = extname(rawName).toLowerCase() as ".xlsx" | ".csv" | "";
      if (
        !ext ||
        !options.allowedExtensions.includes(ext as ".xlsx" | ".csv")
      ) {
        stream.resume();
        void fail(
          new AppError(
            400,
            "VALIDATION_ERROR",
            `File must use one of: ${options.allowedExtensions.join(", ")}`,
          ),
        );
        return;
      }

      clientFilename = safeImportFilename(rawName, ext);
      const dirPromise = ensureImportTempDir(options.tenantId);

      writePromises.push(
        dirPromise.then((dir) => {
          tempPath = join(dir, `${randomUUID()}${ext}`);
          const out = createWriteStream(tempPath);
          stream.on("data", (chunk: Buffer) => {
            byteSize += chunk.length;
            hash.update(chunk);
            if (byteSize > options.maxBytes) {
              tooLarge = true;
              stream.unpipe(out);
              out.destroy();
              stream.resume();
            }
          });
          stream.pipe(out);
          return new Promise<void>((resolveWrite, rejectWrite) => {
            out.on("finish", () => {
              writeFinished = true;
              resolveWrite();
            });
            out.on("error", rejectWrite);
            stream.on("error", rejectWrite);
            stream.on("limit", () => {
              tooLarge = true;
            });
          });
        }),
      );
    });

    parser.on("error", () => {
      void fail(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Invalid multipart upload request",
        ),
      );
    });

    parser.on("finish", () => {
      void (async () => {
        try {
          await Promise.all(writePromises);
        } catch {
          await fail(
            new AppError(500, "IMPORT_STORAGE_FAILED", "Failed to store upload"),
          );
          return;
        }
        if (tooLarge || byteSize > options.maxBytes) {
          await fail(
            new AppError(
              400,
              "VALIDATION_ERROR",
              `Import file exceeds the ${Math.floor(options.maxBytes / (1024 * 1024))} MB limit`,
            ),
          );
          return;
        }
        if (fileCount !== 1 || !tempPath || !writeFinished) {
          await fail(
            new AppError(
              400,
              "VALIDATION_ERROR",
              "Exactly one import file is required",
            ),
          );
          return;
        }
        succeed({
          tempPath,
          clientFilename,
          byteSize,
          contentSha256: hash.digest("hex"),
        });
      })();
    });

    req.pipe(parser);
  });
