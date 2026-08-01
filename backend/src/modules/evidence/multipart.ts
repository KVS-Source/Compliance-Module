import busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { EVIDENCE_FILENAME_MAX, EVIDENCE_UPLOAD_FIELD } from "./file-types.js";

export type ParsedEvidenceUpload = {
  tempPath: string;
  clientFilename: string | undefined;
  declaredMime: string | undefined;
  byteSize: number;
  contentSha256: string;
};

const ensureTempDir = async (storageRoot: string, tenantId: string) => {
  const root = resolve(storageRoot);
  const dir = join(root, ".tmp", tenantId, randomUUID());
  const resolved = resolve(dir);
  if (!resolved.startsWith(root + sep)) {
    throw new AppError(500, "EVIDENCE_STORAGE_FAILED", "Storage path invalid");
  }
  await mkdir(resolved, { recursive: true });
  return resolved;
};

export const parseEvidenceMultipartUpload = (
  req: Request,
  options: {
    storageRoot: string;
    tenantId: string;
    maxBytes: number;
  },
): Promise<ParsedEvidenceUpload> =>
  new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let tempPath: string | null = null;
    let fileCount = 0;
    let byteSize = 0;
    let clientFilename: string | undefined;
    let declaredMime: string | undefined;
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

    const succeed = (payload: ParsedEvidenceUpload) => {
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
          fields: 0,
          parts: 2,
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
      if (fieldname !== EVIDENCE_UPLOAD_FIELD) {
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
            "Only one evidence file may be uploaded",
          ),
        );
        return;
      }

      const rawName = info.filename ?? "";
      if (rawName.length > EVIDENCE_FILENAME_MAX * 2) {
        stream.resume();
        void fail(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Evidence filename is too long",
          ),
        );
        return;
      }
      clientFilename = rawName || undefined;
      declaredMime = info.mimeType;

      const work = (async () => {
        const dir = await ensureTempDir(options.storageRoot, options.tenantId);
        tempPath = join(dir, `${randomUUID()}.part`);
        const writeStream = createWriteStream(tempPath);

        await new Promise<void>((resolveWrite, rejectWrite) => {
          stream.on("data", (chunk: Buffer) => {
            byteSize += chunk.length;
            hash.update(chunk);
          });
          stream.on("limit", () => {
            tooLarge = true;
          });
          writeStream.on("error", (error) => rejectWrite(error));
          stream.on("error", (error) => rejectWrite(error));
          writeStream.on("finish", () => {
            writeFinished = true;
            resolveWrite();
          });
          stream.pipe(writeStream);
        });
      })().catch(() => {
        void fail(
          new AppError(
            500,
            "EVIDENCE_STORAGE_FAILED",
            "Evidence file could not be stored",
          ),
        );
      });
      writePromises.push(work);
    });

    parser.on("field", () => {
      void fail(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Unexpected form field in evidence upload",
        ),
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
        await Promise.all(writePromises).catch(() => undefined);
        if (settled) return;
        if (tooLarge || byteSize > options.maxBytes) {
          await fail(
            new AppError(
              413,
              "EVIDENCE_FILE_TOO_LARGE",
              "Evidence file exceeds the maximum allowed size",
            ),
          );
          return;
        }
        if (fileCount === 0 || !tempPath || !writeFinished) {
          await fail(
            new AppError(
              400,
              "EVIDENCE_FILE_REQUIRED",
              "Evidence file is required",
            ),
          );
          return;
        }
        succeed({
          tempPath,
          clientFilename,
          declaredMime,
          byteSize,
          contentSha256: hash.digest("hex"),
        });
      })();
    });

    req.on("aborted", () => {
      void fail(new AppError(400, "VALIDATION_ERROR", "Upload was aborted"));
    });

    req.pipe(parser);
  });

export const evidenceMaxUploadBytes = () => env.EVIDENCE_MAX_UPLOAD_BYTES;
