import { readdir, rmdir, stat, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export type ImportPreviewCleanupResult = {
  removedPayloads: number;
  removedDirs: number;
  retainedActive: number;
};

/** Root for retained browser-import payloads: `{LOCAL_UPLOAD_DIR}/.import-tmp`. */
export const importTempRoot = (uploadDir = env.LOCAL_UPLOAD_DIR) =>
  resolve(uploadDir, ".import-tmp");

/**
 * Resolves a path only when it stays under the import-temp root (root+sep
 * boundary). Never follows outside; returns null for escapes or the root itself
 * when used as a file path.
 */
export const resolveUnderImportTemp = (
  candidate: string,
  root = importTempRoot(),
): string | null => {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  if (resolved === resolvedRoot) return resolvedRoot;
  if (!resolved.startsWith(resolvedRoot + sep)) return null;
  return resolved;
};

const safeUnlink = async (path: string) => {
  await unlink(path).catch(() => undefined);
};

const tryRemoveEmptyDir = async (path: string, root: string): Promise<boolean> => {
  const resolved = resolveUnderImportTemp(path, root);
  if (!resolved || resolved === resolve(root)) return false;
  try {
    const entries = await readdir(resolved);
    if (entries.length > 0) return false;
    await rmdir(resolved);
    return true;
  } catch {
    return false;
  }
};

/**
 * Deletes a retained preview payload and prunes empty batch/tenant directories
 * under the import-temp root. Tolerates missing files; never follows outside.
 */
export const removeRetainedPreview = async (
  tenantId: string,
  batchId: string,
  options: { uploadDir?: string } = {},
): Promise<boolean> => {
  const root = importTempRoot(options.uploadDir);
  const payload = resolveUnderImportTemp(
    join(root, tenantId, batchId, "payload.bin"),
    root,
  );
  if (!payload) return false;
  let removed = false;
  try {
    await unlink(payload);
    removed = true;
  } catch {
    // Missing payload is fine — treat as already cleaned.
  }
  const batchDir = resolveUnderImportTemp(join(root, tenantId, batchId), root);
  if (batchDir) await tryRemoveEmptyDir(batchDir, root);
  const tenantDir = resolveUnderImportTemp(join(root, tenantId), root);
  if (tenantDir) await tryRemoveEmptyDir(tenantDir, root);
  return removed;
};

/**
 * After a staging-file unlink, remove empty UUID/tenant directories under
 * `.import-tmp` when the path is still inside the import-temp boundary.
 */
export const pruneEmptyImportTempParents = async (
  tempPath: string,
  options: { uploadDir?: string } = {},
): Promise<number> => {
  const root = importTempRoot(options.uploadDir);
  const resolved = resolveUnderImportTemp(tempPath, root);
  if (!resolved) return 0;
  let removed = 0;
  let current = resolve(resolved, "..");
  while (current.startsWith(resolve(root) + sep)) {
    const did = await tryRemoveEmptyDir(current, root);
    if (!did) break;
    removed += 1;
    current = resolve(current, "..");
  }
  return removed;
};

const previewExpiresAtFromReport = (report: unknown): Date | null => {
  if (!report || typeof report !== "object") return null;
  const raw = (report as { previewExpiresAt?: unknown }).previewExpiresAt;
  if (typeof raw !== "string") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Sweeps retained preview payloads whose TTL has elapsed. Active (non-expired)
 * previews are retained. Logs only safe counts/IDs — never workbook bytes.
 */
export const sweepExpiredImportPreviews = async (options: {
  uploadDir?: string;
  ttlHours?: number;
  now?: Date;
  /** Optional lookup: return expiresAt / whether the preview is still active. */
  lookupPreview?: (
    tenantId: string,
    batchId: string,
  ) => Promise<{ expiresAt: Date | null; active: boolean } | null>;
} = {}): Promise<ImportPreviewCleanupResult> => {
  const root = importTempRoot(options.uploadDir);
  const ttlHours = options.ttlHours ?? env.IMPORT_PREVIEW_TTL_HOURS;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const now = options.now ?? new Date();
  const result: ImportPreviewCleanupResult = {
    removedPayloads: 0,
    removedDirs: 0,
    retainedActive: 0,
  };

  let tenantEntries: string[] = [];
  try {
    tenantEntries = await readdir(root);
  } catch {
    return result;
  }

  for (const tenantId of tenantEntries) {
    const tenantDir = resolveUnderImportTemp(join(root, tenantId), root);
    if (!tenantDir) continue;
    let batchEntries: string[] = [];
    try {
      const info = await stat(tenantDir);
      if (!info.isDirectory()) continue;
      batchEntries = await readdir(tenantDir);
    } catch {
      continue;
    }

    for (const batchId of batchEntries) {
      const batchDir = resolveUnderImportTemp(
        join(tenantDir, batchId),
        root,
      );
      if (!batchDir) continue;
      const payload = resolveUnderImportTemp(
        join(batchDir, "payload.bin"),
        root,
      );
      if (!payload) continue;

      let payloadStat;
      try {
        payloadStat = await stat(payload);
        if (!payloadStat.isFile()) continue;
      } catch {
        // Empty or missing — prune dirs only.
        if (await tryRemoveEmptyDir(batchDir, root)) result.removedDirs += 1;
        continue;
      }

      let expired = false;
      let active = true;
      if (options.lookupPreview) {
        const meta = await options.lookupPreview(tenantId, batchId);
        if (meta) {
          active = meta.active;
          if (meta.expiresAt) {
            expired = meta.expiresAt.getTime() <= now.getTime();
          } else {
            expired =
              now.getTime() - payloadStat.mtimeMs >= ttlMs;
          }
        } else {
          // Orphaned on disk with no batch row — expire by mtime.
          expired = now.getTime() - payloadStat.mtimeMs >= ttlMs;
          active = !expired;
        }
      } else {
        expired = now.getTime() - payloadStat.mtimeMs >= ttlMs;
        active = !expired;
      }

      if (!expired && active) {
        result.retainedActive += 1;
        continue;
      }

      await safeUnlink(payload);
      result.removedPayloads += 1;
      if (await tryRemoveEmptyDir(batchDir, root)) result.removedDirs += 1;
    }

    if (await tryRemoveEmptyDir(tenantDir, root)) result.removedDirs += 1;
  }

  // Also prune empty staging UUID dirs under tenants that had no payloads.
  try {
    const tenants = await readdir(root);
    for (const tenantId of tenants) {
      const tenantDir = resolveUnderImportTemp(join(root, tenantId), root);
      if (!tenantDir) continue;
      let children: string[] = [];
      try {
        children = await readdir(tenantDir);
      } catch {
        continue;
      }
      for (const child of children) {
        const childDir = resolveUnderImportTemp(join(tenantDir, child), root);
        if (!childDir) continue;
        try {
          const info = await stat(childDir);
          if (!info.isDirectory()) continue;
          const entries = await readdir(childDir);
          if (entries.length === 0) {
            if (await tryRemoveEmptyDir(childDir, root)) result.removedDirs += 1;
          }
        } catch {
          // ignore
        }
      }
      if (await tryRemoveEmptyDir(tenantDir, root)) result.removedDirs += 1;
    }
  } catch {
    // root may be gone
  }

  if (result.removedPayloads > 0 || result.removedDirs > 0) {
    logger.info(
      {
        removedPayloads: result.removedPayloads,
        removedDirs: result.removedDirs,
        retainedActive: result.retainedActive,
      },
      "import preview temp cleanup completed",
    );
  }
  return result;
};

export { previewExpiresAtFromReport };
