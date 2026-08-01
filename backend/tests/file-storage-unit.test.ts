import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalFileStorageProvider,
  StoragePathError,
  buildEvidenceStorageKey,
  resolveContainedStoragePath,
} from "../src/providers/file-storage/file-storage.js";

describe("file storage path containment", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  const tempRoot = async () => {
    const root = await mkdtemp(join(tmpdir(), "genbioca-storage-"));
    roots.push(root);
    return root;
  };

  it("accepts nested tenant keys", async () => {
    const root = await tempRoot();
    const path = resolveContainedStoragePath(
      root,
      "11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333",
    );
    expect(path.startsWith(resolve(root))).toBe(true);
  });

  it("rejects traversal and absolute paths", async () => {
    const root = await tempRoot();
    expect(() => resolveContainedStoragePath(root, "../etc/passwd")).toThrow(
      StoragePathError,
    );
    expect(() =>
      resolveContainedStoragePath(root, "a/../../etc/passwd"),
    ).toThrow(StoragePathError);
    expect(() => resolveContainedStoragePath(root, "/etc/passwd")).toThrow(
      StoragePathError,
    );
    expect(() =>
      resolveContainedStoragePath(root, "C:\\Windows\\system32"),
    ).toThrow(StoragePathError);
    expect(() => resolveContainedStoragePath(root, "a\\b")).toThrow(
      StoragePathError,
    );
    expect(() => resolveContainedStoragePath(root, "a\0b")).toThrow(
      StoragePathError,
    );
    expect(() => resolveContainedStoragePath(root, ".")).toThrow(
      StoragePathError,
    );
  });

  it("builds evidence keys only from UUIDs", () => {
    expect(
      buildEvidenceStorageKey({
        tenantId: "11111111-1111-4111-8111-111111111111",
        evidenceId: "22222222-2222-4222-8222-222222222222",
        objectId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333",
    );
    expect(() =>
      buildEvidenceStorageKey({
        tenantId: "not-a-uuid",
        evidenceId: "22222222-2222-4222-8222-222222222222",
        objectId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toThrow(StoragePathError);
  });

  it("atomically writes and deletes missing keys safely", async () => {
    const root = await tempRoot();
    const provider = new LocalFileStorageProvider(root);
    const key =
      "11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";
    await provider.put(key, Buffer.from("payload"), "text/plain");
    await expect(provider.get(key)).resolves.toEqual(Buffer.from("payload"));
    await expect(provider.delete(key)).resolves.toBeUndefined();
    await expect(provider.delete(key)).resolves.toBeUndefined();
  });

  it("streams put and get", async () => {
    const root = await tempRoot();
    const provider = new LocalFileStorageProvider(root);
    const key =
      "11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444";
    await provider.putStream(
      key,
      Readable.from([Buffer.from("streamed")]),
      "text/plain",
    );
    const stream = await provider.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString("utf8")).toBe("streamed");
  });

  it("promotes a temp file under root", async () => {
    const root = await tempRoot();
    const provider = new LocalFileStorageProvider(root);
    const temp = join(root, ".tmp", "part.bin");
    await mkdir(join(root, ".tmp"), { recursive: true });
    await writeFile(temp, "promoted");
    const key =
      "11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555555";
    await provider.promoteTempFile(temp, key, "text/plain");
    await expect(readFile(provider.resolveContainedPath(key), "utf8")).resolves.toBe(
      "promoted",
    );
  });
});
