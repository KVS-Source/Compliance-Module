import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
}

export interface FileStorageProvider {
  put(key: string, content: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export type FileStorageConfiguration = {
  driver: string;
  localRoot: string;
};

export class LocalFileStorageProvider implements FileStorageProvider {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return join(this.root, safe);
  }

  async put(key: string, content: Buffer, contentType: string) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return { key, size: content.length, contentType };
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  async delete(key: string) {
    await unlink(this.path(key));
  }
}

// Milestone 2 may implement this contract with an S3-compatible SDK.
export class S3CompatibleFileStorageProvider implements FileStorageProvider {
  put(): Promise<StoredFile> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  get(): Promise<Buffer> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
  }
  delete(): Promise<void> {
    return Promise.reject(
      new Error("S3 adapter is not configured in Milestone 1"),
    );
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
