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
import { Readable } from "node:stream";
import {
  MalwareDetectedError,
  noopMalwareScanHook,
  type MalwareScanHook,
} from "./malware-scan.js";
import type { S3ClientPort } from "./s3-client-port.js";

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
  /**
   * Optional signed download URL (S3). Local storage returns null so callers
   * fall back to the authenticated streaming endpoint.
   */
  getSignedDownloadUrl?(input: {
    key: string;
    expiresInSeconds: number;
    contentType?: string;
    contentDisposition?: string;
  }): Promise<string | null>;
}

export type FileStorageConfiguration = {
  driver: string;
  localRoot: string;
  s3?: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    /** Injected client for unit tests; production omits this. */
    client?: S3ClientPort;
  };
  malwareScan?: MalwareScanHook;
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

/**
 * S3-compatible object storage behind the same FileStorageProvider contract.
 *
 * Requires an injected {@link S3ClientPort}. Unit tests use InMemoryS3Client.
 * This environment has no AWS credentials, so the live S3 path is untested
 * against real buckets — only the fake client is exercised.
 */
export class S3FileStorageProvider implements FileStorageProvider {
  private readonly bucket: string;
  private readonly client: S3ClientPort;
  private readonly scan: MalwareScanHook;

  constructor(config: {
    bucket: string;
    client: S3ClientPort;
    malwareScan?: MalwareScanHook;
  }) {
    this.bucket = config.bucket;
    this.client = config.client;
    this.scan = config.malwareScan ?? noopMalwareScanHook;
  }

  getRoot() {
    return `s3://${this.bucket}`;
  }

  resolveContainedPath(key: string) {
    // S3 keys still use the same logical containment rules as local keys.
    resolveContainedStoragePath("/s3-virtual-root", key);
    return key;
  }

  async checkReady() {
    await this.client.headBucket(this.bucket);
  }

  private async scanBeforePromote(
    key: string,
    contentType: string,
    body: Buffer,
  ) {
    const verdict = await this.scan({
      key,
      contentType,
      size: body.length,
      sample: body.subarray(0, Math.min(body.length, 65_536)),
    });
    if (!verdict.clean) {
      throw new MalwareDetectedError(verdict);
    }
  }

  async put(key: string, content: Buffer, contentType: string) {
    this.resolveContainedPath(key);
    await this.scanBeforePromote(key, contentType, content);
    await this.client.putObject({
      bucket: this.bucket,
      key,
      body: content,
      contentType,
    });
    return { key, size: content.length, contentType };
  }

  async putStream(key: string, source: Readable, contentType: string) {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    return this.put(key, body, contentType);
  }

  async promoteTempFile(
    tempAbsolutePath: string,
    key: string,
    contentType: string,
  ) {
    // S3 has no local temp promotion path; read the temp file then put.
    const body = await readFile(tempAbsolutePath);
    return this.put(key, body, contentType);
  }

  async get(key: string) {
    this.resolveContainedPath(key);
    const object = await this.client.getObject({
      bucket: this.bucket,
      key,
    });
    return object.body;
  }

  async getStream(key: string) {
    const body = await this.get(key);
    return Readable.from(body);
  }

  async delete(key: string) {
    this.resolveContainedPath(key);
    await this.client.deleteObject({ bucket: this.bucket, key });
  }

  async getSignedDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
    contentType?: string;
    contentDisposition?: string;
  }) {
    this.resolveContainedPath(input.key);
    return this.client.getSignedDownloadUrl({
      bucket: this.bucket,
      key: input.key,
      expiresInSeconds: input.expiresInSeconds,
      ...(input.contentType
        ? { responseContentType: input.contentType }
        : {}),
      ...(input.contentDisposition
        ? { responseContentDisposition: input.contentDisposition }
        : {}),
    });
  }
}

export const createFileStorageProvider = ({
  driver,
  localRoot,
  s3,
  malwareScan,
}: FileStorageConfiguration): FileStorageProvider => {
  if (driver === "local") return new LocalFileStorageProvider(localRoot);
  if (driver === "s3") {
    if (!s3?.bucket?.trim()) {
      throw new Error(
        "FILE_STORAGE_DRIVER=s3 requires S3_BUCKET (and an injected or configured client)",
      );
    }
    if (!s3.client) {
      throw new Error(
        "FILE_STORAGE_DRIVER=s3 requires an S3 client. This environment has no AWS credentials; inject a client for tests or configure production separately. Use FILE_STORAGE_DRIVER=local as the default.",
      );
    }
    return new S3FileStorageProvider({
      bucket: s3.bucket,
      client: s3.client,
      ...(malwareScan ? { malwareScan } : {}),
    });
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
