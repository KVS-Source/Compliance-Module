/**
 * Port for S3-compatible object operations.
 *
 * The storage driver depends only on this interface so unit tests inject a
 * fake without AWS credentials or the AWS SDK. A production build wires a
 * real client; this environment has no credentials, so the real path is
 * untested against live S3.
 */

export type S3ObjectMetadata = {
  contentType: string;
  contentLength: number;
};

export type S3ClientPort = {
  headBucket(bucket: string): Promise<void>;
  putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  getObject(input: {
    bucket: string;
    key: string;
  }): Promise<{ body: Buffer; contentType: string }>;
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
  /**
   * Returns a time-limited HTTPS URL for GET. Implementations must never
   * embed long-lived credentials in the URL query beyond the signature.
   */
  getSignedDownloadUrl(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
    responseContentType?: string;
    responseContentDisposition?: string;
  }): Promise<string>;
};

/** In-memory fake for unit tests. Not suitable for multi-process use. */
export class InMemoryS3Client implements S3ClientPort {
  readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  private objectKey(bucket: string, key: string) {
    return `${bucket}::${key}`;
  }

  async headBucket(bucket: string): Promise<void> {
    if (!bucket.trim()) throw new Error("S3 bucket is required");
  }

  async putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    this.objects.set(this.objectKey(input.bucket, input.key), {
      body: Buffer.from(input.body),
      contentType: input.contentType,
    });
  }

  async getObject(input: {
    bucket: string;
    key: string;
  }): Promise<{ body: Buffer; contentType: string }> {
    const found = this.objects.get(this.objectKey(input.bucket, input.key));
    if (!found) throw new Error("Storage read failed");
    return {
      body: Buffer.from(found.body),
      contentType: found.contentType,
    };
  }

  async deleteObject(input: {
    bucket: string;
    key: string;
  }): Promise<void> {
    this.objects.delete(this.objectKey(input.bucket, input.key));
  }

  async getSignedDownloadUrl(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
    responseContentType?: string;
    responseContentDisposition?: string;
  }): Promise<string> {
    const found = this.objects.get(this.objectKey(input.bucket, input.key));
    if (!found) throw new Error("Storage read failed");
    const expires = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
    // Fake signed URL — tests assert shape and expiry window, not crypto.
    const params = new URLSearchParams({
      bucket: input.bucket,
      key: input.key,
      expires: String(expires),
      ...(input.responseContentType
        ? { "response-content-type": input.responseContentType }
        : {}),
      ...(input.responseContentDisposition
        ? {
            "response-content-disposition": input.responseContentDisposition,
          }
        : {}),
      signature: "test-signature",
    });
    return `https://s3.test.local/${input.bucket}/${encodeURIComponent(input.key)}?${params.toString()}`;
  }
}
