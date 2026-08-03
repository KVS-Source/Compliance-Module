import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
}

export interface FileStorageProvider {
  checkReady(): Promise<void>;
  put(key: string, content: Buffer, contentType: string): Promise<StoredFile>;
  putStream(
    key: string,
    source: Readable,
    contentType: string,
  ): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  /** Move a file already under the storage root into a final key. */
  promoteTempFile(
    tempAbsolutePath: string,
    key: string,
    contentType: string,
  ): Promise<StoredFile>;
  resolveContainedPath(key: string): string;
  getRoot(): string;
}

export type FileStorageConfiguration = {
  driver: string;
  localRoot: string;
};

export class StoragePathError extends Error {
  constructor(message = "Invalid storage key") {
    super(message);
    this.name = "StoragePathError";
  }
}

/**
 * Resolve a logical storage key under root. Rejects traversal, absolute paths,
 * backslashes, null bytes, and `.` / `..` segments.
 */
export const resolveContainedStoragePath = (
  root: string,
  key: string,
): string => {
  if (typeof key !== "string" || key.length === 0) {
    throw new StoragePathError();
  }
  if (key.includes("\0") || key.includes("\\")) {
    throw new StoragePathError();
  }
  if (isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
    throw new StoragePathError();
  }
  const segments = key.split("/").filter((part) => part.length > 0);
  if (segments.length === 0) throw new StoragePathError();
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new StoragePathError();
    }
  }
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, ...segments);
  const rel = relative(normalizedRoot, candidate);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new StoragePathError();
  }
  if (!candidate.startsWith(normalizedRoot + sep)) {
    throw new StoragePathError();
  }
  return candidate;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const buildEvidenceStorageKey = (input: {
  tenantId: string;
  evidenceId: string;
  objectId: string;
}) => {
  if (
    !UUID_RE.test(input.tenantId) ||
    !UUID_RE.test(input.evidenceId) ||
    !UUID_RE.test(input.objectId)
  ) {
    throw new StoragePathError();
  }
  return `${input.tenantId.toLowerCase()}/evidence/${input.evidenceId.toLowerCase()}/${input.objectId.toLowerCase()}`;
};

export class LocalFileStorageProvider implements FileStorageProvider {
  private readonly root: string;

  constructor(localRoot: string) {
    this.root = resolve(localRoot);
  }

  getRoot() {
    return this.root;
  }

  resolveContainedPath(key: string) {
    return resolveContainedStoragePath(this.root, key);
  }

  async checkReady() {
    const probeDirectory = join(this.root, ".tmp", "readiness");
    const probePath = join(probeDirectory, `${randomUUID()}.probe`);
    await mkdir(probeDirectory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(probePath, "ready", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      if ((await readFile(probePath, "utf8")) !== "ready") {
        throw new Error("Storage readiness probe failed");
      }
    } finally {
      await unlink(probePath).catch(() => undefined);
    }
  }

  private assertUnderRoot(absolutePath: string) {
    const normalized = resolve(absolutePath);
    if (normalized !== this.root && !normalized.startsWith(this.root + sep)) {
      throw new StoragePathError();
    }
    return normalized;
  }

  private async ensureParent(filePath: string) {
    await mkdir(dirname(filePath), { recursive: true });
  }

  async put(key: string, content: Buffer, contentType: string) {
    const finalPath = this.resolveContainedPath(key);
    const tempPath = join(
      this.root,
      ".tmp",
      "provider",
      `${randomUUID()}.part`,
    );
    await this.ensureParent(tempPath);
    try {
      await writeFile(tempPath, content);
      await this.ensureParent(finalPath);
      await rename(tempPath, finalPath);
      return { key, size: content.length, contentType };
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      if (error instanceof StoragePathError) throw error;
      throw new Error("Storage write failed");
    }
  }

  async putStream(key: string, source: Readable, contentType: string) {
    const finalPath = this.resolveContainedPath(key);
    const tempPath = join(
      this.root,
      ".tmp",
      "provider",
      `${randomUUID()}.part`,
    );
    await this.ensureParent(tempPath);
    try {
      await pipeline(source, createWriteStream(tempPath));
      const info = await stat(tempPath);
      await this.ensureParent(finalPath);
      await rename(tempPath, finalPath);
      return { key, size: info.size, contentType };
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      if (error instanceof StoragePathError) throw error;
      throw new Error("Storage write failed");
    }
  }

  async promoteTempFile(
    tempAbsolutePath: string,
    key: string,
    contentType: string,
  ) {
    const finalPath = this.resolveContainedPath(key);
    const normalizedTemp = this.assertUnderRoot(tempAbsolutePath);
    const info = await stat(normalizedTemp);
    await this.ensureParent(finalPath);
    await rename(normalizedTemp, finalPath);
    return { key, size: info.size, contentType };
  }

  async get(key: string) {
    const path = this.resolveContainedPath(key);
    try {
      return await readFile(path);
    } catch {
      throw new Error("Storage read failed");
    }
  }

  async getStream(key: string) {
    const path = this.resolveContainedPath(key);
    try {
      const handle = await open(path, "r");
      await handle.close();
      return createReadStream(path);
    } catch {
      throw new Error("Storage read failed");
    }
  }

  async delete(key: string) {
    const path = this.resolveContainedPath(key);
    try {
      await unlink(path);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "ENOENT") return;
      throw new Error("Storage delete failed");
    }
  }
}

export class S3CompatibleFileStorageProvider implements FileStorageProvider {
  checkReady(): Promise<void> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  put(): Promise<StoredFile> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  putStream(): Promise<StoredFile> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  get(): Promise<Buffer> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  getStream(): Promise<Readable> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  delete(): Promise<void> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  promoteTempFile(): Promise<StoredFile> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  resolveContainedPath(): string {
    throw new Error("S3 adapter is not configured in Milestone 1");
  }
  getRoot(): string {
    throw new Error("S3 adapter is not configured in Milestone 1");
  }
}

export const createFileStorageProvider = ({
  driver,
  localRoot,
}: FileStorageConfiguration): FileStorageProvider => {
  if (driver === "local") return new LocalFileStorageProvider(localRoot);
  if (driver === "s3") {
    throw new Error(
      "FILE_STORAGE_DRIVER=s3 is recognised but not implemented; use local",
    );
  }
  throw new Error(`Unknown FILE_STORAGE_DRIVER: ${driver}`);
};

export const safeRemovePath = async (target: string) => {
  try {
    await rm(target, { force: true, recursive: true });
  } catch {
    // ignore cleanup failures
  }
};
