/**
 * Multipart upload orchestration against the real database functions and an in-memory object
 * store that follows the R2 rules the code relies on (uniform part sizes, NoSuchUpload after
 * completion or abort, If-None-Match on completion).
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { LabelerError, rpc, setTransport, type Transport } from "../../src/lib/labeler/server/db";
import { setObjectStore, type ObjectStore, type StoredPart } from "../../src/lib/labeler/server/r2";
import { beginUpload, completeUpload, signParts, abortUpload, cleanupCollection } from "../../src/lib/labeler/server/uploads";
import { PART_SIZE } from "../../src/lib/labeler/server/config";
import { bootstrapAdmin, configure, createReviewer, databaseAvailable, freshDatabase } from "./harness";

const skip = !databaseAvailable() && "set LABELER_TEST_ADMIN_URL to a disposable PostgreSQL server";

class MemoryStore implements ObjectStore {
  objects = new Map<string, { body: Buffer; contentType: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, Buffer> }>();
  completions = 0;
  async createMultipart(key: string) {
    const id = randomUUID();
    this.uploads.set(id, { key, parts: new Map() });
    return id;
  }
  async signPart(key: string, uploadId: string, partNumber: number) {
    return `memory://${key}?uploadId=${uploadId}&partNumber=${partNumber}`;
  }
  put(uploadId: string, partNumber: number, body: Buffer) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error("NoSuchUpload");
    upload.parts.set(partNumber, body);
    return `"${createHash("md5").update(body).digest("hex")}"`;
  }
  async listParts(key: string, uploadId: string): Promise<StoredPart[] | null> {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) return null;
    return [...upload.parts.entries()].map(([partNumber, body]) => ({
      partNumber,
      size: body.length,
      etag: `"${createHash("md5").update(body).digest("hex")}"`,
    }));
  }
  async complete(key: string, uploadId: string, parts: StoredPart[]) {
    const upload = this.uploads.get(uploadId);
    if (!upload) return "missing" as const;
    if (this.objects.has(key)) return "exists" as const;
    const sizes = parts.map((p) => upload.parts.get(p.partNumber)!.length);
    if (sizes.slice(0, -1).some((s) => s !== sizes[0] || s < 5 * 1024 * 1024)) throw new Error("InvalidPart");
    this.objects.set(key, { body: Buffer.concat(parts.map((p) => upload.parts.get(p.partNumber)!)), contentType: "video/mp4" });
    this.uploads.delete(uploadId);
    this.completions += 1;
    return "completed" as const;
  }
  async abort(_key: string, uploadId: string) {
    this.uploads.delete(uploadId);
  }
  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { size: object.body.length, contentType: object.contentType } : null;
  }
  async sha256(key: string) {
    const object = this.objects.get(key)!;
    return { sha256: createHash("sha256").update(object.body).digest("hex"), bytes: object.body.length };
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  async signGet(key: string) {
    return `memory://${key}`;
  }
}

function fileOf(size: number, seed: number): Buffer {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i += 4096) buffer[i] = (i / 4096 + seed) % 251;
  return buffer;
}

describe("multipart uploads", { skip }, () => {
  let db: Awaited<ReturnType<typeof freshDatabase>>;
  let admin: Awaited<ReturnType<typeof bootstrapAdmin>>;
  let store: MemoryStore;
  let collectionId: string;
  const failNext = new Set<string>();

  async function registerClip(body: Buffer, index: number) {
    const footageId = createHash("md5").update(`clip-${index}`).digest("hex");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const matchId = `demo-${"a".repeat(64)}`;
    const result = await rpc<{ clips: Array<{ clipId: string }> }>("labeler_admin_import", {
      tokenHash: admin.tokenHash,
      collectionId,
      demos: {
        [matchId]: {
          metadata: { id: matchId, sha256: "a".repeat(64), filename: "upload.dem", map: "de_ancient", players: [{ id: "76561198000000001", name: "P", team: "CT" }] },
          provenance: { source: "", sourceMatchId: "", split: "unassigned", trainingPermitted: false },
        },
      },
      clips: [
        {
          footageId,
          sha256,
          bytes: body.length,
          matchId,
          playerId: "76561198000000001",
          snapshotId: "snap",
          round: 1,
          findingId: `F${index}`,
          context: { finding: { id: `F${index}`, round: 1, detector: "untraded_death", t: 1, evidence: {} }, footage: { sha256, bytes: body.length } },
        },
      ],
      maxClips: 1000,
      maxClipBytes: 256 * 1024 * 1024,
    });
    return { clipId: result.clips[0].clipId, sha256, bytes: body.length, body };
  }

  async function sendParts(uploadId: string, body: Buffer, partNumbers: number[]) {
    const signed = await signParts(admin.tokenHash, uploadId, partNumbers, []);
    for (const part of signed.urls) {
      const url = new URL(part.url);
      const start = (part.partNumber - 1) * PART_SIZE;
      store.put(url.searchParams.get("uploadId")!, part.partNumber, body.subarray(start, start + part.size));
    }
  }

  before(async () => {
    db = await freshDatabase();
    configure(db.url);
    admin = await bootstrapAdmin();
    store = new MemoryStore();
    setObjectStore(store);
    const real: Transport = async (name, payload) => {
      if (failNext.delete(name)) throw new LabelerError(502, "Simulated lost database response.");
      setTransport(null);
      try {
        return await rpc(name, payload);
      } finally {
        setTransport(real);
      }
    };
    setTransport(real);
    collectionId = (await rpc<{ id: string }>("labeler_admin_collection_create", { tokenHash: admin.tokenHash, name: "Uploads" })).id;
  });

  after(async () => {
    setTransport(null);
    setObjectStore(null);
    await db?.drop();
  });

  test("a clip larger than one 8 MiB part uploads, resumes after a completed part and becomes ready once", async () => {
    const clip = await registerClip(fileOf(PART_SIZE * 2 + 12345, 1), 1);
    const begun = await beginUpload(admin.tokenHash, clip);
    assert.ok(!("ready" in begun && begun.ready));
    const upload = (begun as { upload: { id: string; partCount: number } }).upload;
    assert.equal(upload.partCount, 3);
    assert.ok(!JSON.stringify(begun).includes("clips/"), "the browser never sees the object key");
    await sendParts(upload.id, clip.body, [1]);
    // Interrupted: a new begin resumes the same upload and reports part 1 as done.
    const resumed = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string }; completedParts: Array<{ partNumber: number }> };
    assert.equal(resumed.upload.id, upload.id);
    assert.deepEqual(resumed.completedParts.map((p) => p.partNumber), [1]);
    await assert.rejects(completeUpload(admin.tokenHash, upload.id), (e: unknown) => e instanceof LabelerError && e.status === 409);
    await sendParts(upload.id, clip.body, [2, 3]);
    const done = await completeUpload(admin.tokenHash, upload.id);
    assert.equal(done.status, "ready");
    assert.equal((await completeUpload(admin.tokenHash, upload.id)).replayed, true, "retrying a completed session changes nothing");
    assert.deepEqual(await beginUpload(admin.tokenHash, clip), { ready: true });
    assert.equal(store.completions, 1);
  });

  test("completion that succeeded in R2 but lost the database response is reconciled", async () => {
    const clip = await registerClip(fileOf(PART_SIZE + 99, 2), 2);
    const { upload } = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string } };
    await sendParts(upload.id, clip.body, [1, 2]);
    failNext.add("labeler_admin_upload_finalise");
    await assert.rejects(completeUpload(admin.tokenHash, upload.id));
    assert.equal(store.completions, 2, "R2 holds the completed object");
    const { rows } = await db.superuser.query("select media_state from labeler.clips where id=$1", [clip.clipId]);
    assert.equal(rows[0].media_state, "pending", "not published before the database records success");
    // A resume sees no multipart upload but finds the object, then completion finalises it.
    const again = (await beginUpload(admin.tokenHash, clip)) as { needsCompletion: boolean };
    assert.equal(again.needsCompletion, true);
    assert.equal((await completeUpload(admin.tokenHash, upload.id)).status, "ready");
  });

  test("bytes that differ from the manifest hash are discarded and the clip stays a draft", async () => {
    const clip = await registerClip(fileOf(PART_SIZE + 10, 3), 3);
    const { upload } = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string } };
    const tampered = Buffer.from(clip.body);
    tampered[100] ^= 0xff;
    await sendParts(upload.id, tampered, [1, 2]);
    await assert.rejects(completeUpload(admin.tokenHash, upload.id), /SHA-256/);
    const { rows } = await db.superuser.query("select media_state from labeler.clips where id=$1", [clip.clipId]);
    assert.equal(rows[0].media_state, "pending");
    assert.equal([...store.objects.keys()].some((k) => k.includes(clip.clipId)), false);
  });

  test("forged parts, upload IDs and reviewer callers cannot sign or complete", async () => {
    const clip = await registerClip(fileOf(PART_SIZE + 1, 4), 4);
    const { upload } = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string } };
    await assert.rejects(signParts(admin.tokenHash, upload.id, [3], []), (e: unknown) => e instanceof LabelerError && e.status === 422);
    await assert.rejects(signParts(admin.tokenHash, randomUUID(), [1], []), (e: unknown) => e instanceof LabelerError && e.status === 404);
    const reviewer = await createReviewer(admin.tokenHash, `rev_${Date.now()}`);
    await assert.rejects(signParts(reviewer.tokenHash, upload.id, [1], []), (e: unknown) => e instanceof LabelerError && e.status === 403);
    await assert.rejects(completeUpload(reviewer.tokenHash, upload.id), (e: unknown) => e instanceof LabelerError && e.status === 403);
    await assert.rejects(beginUpload(admin.tokenHash, { ...clip, sha256: "0".repeat(64) }), (e: unknown) => e instanceof LabelerError && e.status === 409);
    await abortUpload(admin.tokenHash, upload.id);
    await assert.rejects(signParts(admin.tokenHash, upload.id, [1], []), (e: unknown) => e instanceof LabelerError && e.status === 409);
  });

  test("an expired upload restarts cleanly and collection cleanup aborts only unfinished uploads", async () => {
    const clip = await registerClip(fileOf(PART_SIZE + 5, 5), 5);
    const first = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string } };
    await db.superuser.query("update labeler.uploads set created_at = now() - interval '7 days' where id=$1", [first.upload.id]);
    const second = (await beginUpload(admin.tokenHash, clip)) as { upload: { id: string } };
    assert.notEqual(second.upload.id, first.upload.id);
    const { rows } = await db.superuser.query("select status from labeler.uploads where id=$1", [first.upload.id]);
    assert.equal(rows[0].status, "expired");
    const result = await cleanupCollection(admin.tokenHash, collectionId);
    assert.ok(result.aborted >= 1);
    const ready = await db.superuser.query("select count(*)::int as n from labeler.clips where media_state='ready'");
    assert.equal(ready.rows[0].n, 2, "ready media is untouched");
  });

  test("storage and open-upload limits are enforced on reservations", async () => {
    const clip = await registerClip(fileOf(PART_SIZE + 7, 6), 6);
    await assert.rejects(
      rpc("labeler_admin_upload_begin", {
        tokenHash: admin.tokenHash,
        clipId: clip.clipId,
        sha256: clip.sha256,
        bytes: clip.bytes,
        partSize: PART_SIZE,
        bucket: "cs2-demo-clips-test",
        maxTotalBytes: 1000,
        maxOpenUploads: 10,
        expirySeconds: 6 * 24 * 3600,
      }),
      (e: unknown) => e instanceof LabelerError && e.status === 413,
    );
  });
});
