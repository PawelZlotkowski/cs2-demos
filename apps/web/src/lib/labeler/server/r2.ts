/**
 * Private Cloudflare R2 storage through the S3-compatible API (AWS SDK v3, region auto).
 * The server creates, lists, completes and aborts multipart uploads; browsers only receive
 * short-lived presigned UploadPart and GetObject URLs for keys the database has authorised.
 *
 * Checksums: requestChecksumCalculation/responseChecksumValidation = WHEN_REQUIRED keeps the
 * SDK from adding x-amz-checksum-* parameters to presigned part URLs, which a browser PUT would
 * not reproduce. ETags are opaque completion tokens; the file SHA-256 is checked separately by
 * streaming the completed object.
 */
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { labelerConfig } from "./config";

export interface StoredPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface ObjectStore {
  createMultipart(key: string): Promise<string>;
  signPart(key: string, uploadId: string, partNumber: number, seconds: number): Promise<string>;
  /** null when the multipart upload no longer exists (completed, aborted or expired). */
  listParts(key: string, uploadId: string): Promise<StoredPart[] | null>;
  /** "completed", or "exists" when an object already occupies the key (If-None-Match). */
  complete(key: string, uploadId: string, parts: StoredPart[]): Promise<"completed" | "exists" | "missing">;
  abort(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  sha256(key: string): Promise<{ sha256: string; bytes: number }>;
  remove(key: string): Promise<void>;
  signGet(key: string, seconds: number): Promise<string>;
}

let client: S3Client | null = null;
let override: ObjectStore | null = null;

export function setObjectStore(store: ObjectStore | null): void {
  override = store;
}

function s3(): S3Client {
  if (client) return client;
  const { r2 } = labelerConfig();
  client = new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

function status(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function named(error: unknown, ...names: string[]): boolean {
  const name = (error as { name?: string; Code?: string })?.name ?? (error as { Code?: string })?.Code;
  return typeof name === "string" && names.includes(name);
}

const r2Store: ObjectStore = {
  async createMultipart(key) {
    const { r2 } = labelerConfig();
    const result = await s3().send(
      new CreateMultipartUploadCommand({ Bucket: r2.bucket, Key: key, ContentType: "video/mp4", CacheControl: "private, max-age=300" }),
    );
    if (!result.UploadId) throw new Error("R2 returned no upload ID.");
    return result.UploadId;
  },

  async signPart(key, uploadId, partNumber, seconds) {
    const { r2 } = labelerConfig();
    return getSignedUrl(s3(), new UploadPartCommand({ Bucket: r2.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
      expiresIn: seconds,
    });
  },

  async listParts(key, uploadId) {
    const { r2 } = labelerConfig();
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    try {
      for (let page = 0; page < 20; page += 1) {
        const result = await s3().send(
          new ListPartsCommand({ Bucket: r2.bucket, Key: key, UploadId: uploadId, MaxParts: 1000, PartNumberMarker: marker }),
        );
        for (const part of result.Parts ?? []) {
          if (part.PartNumber && part.ETag && part.Size !== undefined) {
            parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size });
          }
        }
        if (!result.IsTruncated) break;
        marker = result.NextPartNumberMarker;
      }
    } catch (error) {
      if (named(error, "NoSuchUpload") || status(error) === 404) return null;
      throw error;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  },

  async complete(key, uploadId, parts) {
    const { r2 } = labelerConfig();
    try {
      await s3().send(
        new CompleteMultipartUploadCommand({
          Bucket: r2.bucket,
          Key: key,
          UploadId: uploadId,
          IfNoneMatch: "*",
          MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }),
      );
      return "completed";
    } catch (error) {
      if (named(error, "PreconditionFailed") || status(error) === 412) return "exists";
      if (named(error, "NoSuchUpload") || status(error) === 404) return "missing";
      throw error;
    }
  },

  async abort(key, uploadId) {
    const { r2 } = labelerConfig();
    try {
      await s3().send(new AbortMultipartUploadCommand({ Bucket: r2.bucket, Key: key, UploadId: uploadId }));
    } catch (error) {
      if (named(error, "NoSuchUpload") || status(error) === 404) return;
      throw error;
    }
  },

  async head(key) {
    const { r2 } = labelerConfig();
    try {
      const result = await s3().send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
      return { size: Number(result.ContentLength ?? -1), contentType: result.ContentType ?? "" };
    } catch (error) {
      if (named(error, "NotFound", "NoSuchKey") || status(error) === 404) return null;
      throw error;
    }
  },

  async sha256(key) {
    const { r2 } = labelerConfig();
    const result = await s3().send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of result.Body as Readable) {
      const buffer = chunk as Buffer;
      hash.update(buffer);
      bytes += buffer.byteLength;
    }
    return { sha256: hash.digest("hex"), bytes };
  },

  async remove(key) {
    const { r2 } = labelerConfig();
    await s3().send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
  },

  async signGet(key, seconds) {
    const { r2 } = labelerConfig();
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: r2.bucket, Key: key }), { expiresIn: seconds });
  },
};

export function objectStore(): ObjectStore {
  return override ?? r2Store;
}
