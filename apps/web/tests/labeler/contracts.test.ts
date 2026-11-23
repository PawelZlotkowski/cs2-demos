/**
 * Cross-language contracts. The manifest fixture was written by the Python exporter
 * (apps/api/app/annotation/clip_export.py); the notes fixtures written here are imported by
 * eval/tests/test_cloud_notes.py through the real round-reviewer-notes-v1 importer.
 *
 * Regenerate the notes fixtures after an intentional change: UPDATE_LABELLER_FIXTURES=1.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { clipManifestSchema, importBatchSchema } from "../../src/lib/labeler/manifest";
import { clientBucket, codeDigest, generateCode, isSessionToken, loginDigest, newSessionToken, normaliseCode } from "../../src/lib/labeler/server/codes";
import { buildNotesExport, type ExportRaw, type ExportReview } from "../../src/lib/labeler/server/export";
import { manifestFixture } from "./harness";

const FIXTURES = path.resolve(__dirname, "../../../../eval/tests/fixtures/labeller");

test("access codes carry 120 random bits and normalise predictably", () => {
  const codes = new Set(Array.from({ length: 2000 }, generateCode));
  assert.equal(codes.size, 2000);
  for (const code of [...codes].slice(0, 50)) {
    assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    const raw = code.replace(/-/g, "");
    assert.equal(normaliseCode(code), raw);
    assert.equal(normaliseCode(` ${code.toLowerCase().replace(/-/g, " ")} `), raw);
    assert.equal(normaliseCode(code.replace(/-/g, "_")), raw);
  }
  assert.equal(normaliseCode("O0IL-1111-1111-1111-1111-1111"), "001111111111111111111111");
  assert.equal(normaliseCode("UUUU-UUUU-UUUU-UUUU-UUUU-UUUU"), null, "U is not in the alphabet");
  assert.equal(normaliseCode("ABCD"), null);
  // 24 base32 characters = 120 bits; every alphabet symbol appears.
  const symbols = new Set([...codes].join("").replace(/-/g, ""));
  assert.equal(symbols.size, 32);
});

test("code digests are keyed, stable and never equal the code", () => {
  const code = generateCode();
  const a = codeDigest(normaliseCode(code)!, "pepper-one-0123456789abcdef0123456789");
  assert.equal(a, codeDigest(normaliseCode(code.toLowerCase())!, "pepper-one-0123456789abcdef0123456789"));
  assert.notEqual(a, codeDigest(normaliseCode(code)!, "pepper-two-0123456789abcdef0123456789"));
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.match(loginDigest("garbage", "p".repeat(40)), /^[a-f0-9]{64}$/, "malformed input still yields a uniform digest");
  assert.notEqual(clientBucket("1.2.3.4", "p".repeat(40)), clientBucket("1.2.3.5", "p".repeat(40)));
  const session = newSessionToken();
  assert.ok(isSessionToken(session.token));
  assert.equal(Buffer.from(session.token, "base64url").length, 32, "256-bit session token");
  assert.ok(!isSessionToken(`${session.token}=`));
});

test("the Python exporter's manifest satisfies the TypeScript contract", () => {
  const manifest = manifestFixture();
  const parsed = clipManifestSchema.parse(manifest);
  assert.equal(parsed.clips.length, 2);
  assert.deepEqual(new Set(Object.values(parsed.demos).map((d) => d.metadata.map)), new Set(["de_ancient", "de_anubis"]));
  const broken = structuredClone(manifest);
  broken.clips[0].sha256 = "f".repeat(64);
  assert.equal(clipManifestSchema.safeParse(broken).success, false, "file and footage hashes must agree");
  const escape = structuredClone(manifest);
  escape.clips[0].path = "../../etc/passwd";
  assert.equal(clipManifestSchema.safeParse(escape).success, false);
  const extra = structuredClone(manifest);
  extra.clips[0].uploadUrl = "https://example.com";
  assert.equal(clipManifestSchema.safeParse(extra).success, false, "unknown keys are rejected");
  const outsider = structuredClone(manifest);
  outsider.clips[0].playerId = "76561198999999999";
  assert.equal(clipManifestSchema.safeParse(outsider).success, false);
  assert.equal(importBatchSchema.safeParse({ demos: manifest.demos, clips: Array(26).fill(manifest.clips[0]) }).success, false);
});

function rawFor(reviews: Array<Pick<ExportReview, "revision" | "status" | "notes" | "assessment" | "language" | "issue" | "savedAt"> & { clip: number }>): ExportRaw {
  const manifest = manifestFixture();
  return {
    originId: "cafecafecafecafecafecafecafecafe",
    account: { id: "00000000-0000-4000-8000-000000000001", handle: "alex_web", displayName: "Alex" },
    demos: manifest.demos,
    reviews: reviews.map(({ clip, ...review }) => {
      const entry = manifest.clips[clip];
      return {
        ...review,
        confirmFootage: review.status === "complete",
        clip: {
          id: `00000000-0000-4000-8000-00000000010${clip}`,
          footageId: entry.footageId,
          sha256: entry.sha256,
          matchId: entry.matchId,
          playerId: entry.playerId,
          snapshotId: entry.snapshotId,
          findingId: entry.finding.id,
          round: entry.round,
          context: { finding: entry.finding, footage: entry.footage, batchId: entry.batchId },
        },
      };
    }),
  };
}

const ancient = 0;
const anubis = 1;
const SCENARIOS: Record<string, Parameters<typeof rawFor>[0]> = {
  "cloud-notes-1-initial": [
    { clip: ancient, revision: 101, status: "complete", notes: "Peeked alone; wait for the trade.", assessment: "mistake", language: "en", issue: null, savedAt: "2026-11-17T12:01:00+00:00" },
    { clip: anubis, revision: 102, status: "complete", notes: "Dobre ustawienie celownika.", assessment: "good", language: "pl", issue: null, savedAt: "2026-11-17T12:02:00+00:00" },
  ],
  "cloud-notes-2-later-revision": [
    { clip: ancient, revision: 205, status: "complete", notes: "Peeked alone again; hold for the flash.", assessment: "mistake", language: "en", issue: null, savedAt: "2026-11-17T13:05:00+00:00" },
    { clip: anubis, revision: 102, status: "complete", notes: "Dobre ustawienie celownika.", assessment: "good", language: "pl", issue: null, savedAt: "2026-11-17T12:02:00+00:00" },
  ],
  "cloud-notes-3-withdrawn": [
    { clip: ancient, revision: 310, status: "draft", notes: "Reconsidering after the full round.", assessment: null, language: "en", issue: null, savedAt: "2026-11-17T14:10:00+00:00" },
    { clip: anubis, revision: 311, status: "skipped", notes: "", assessment: null, language: "pl", issue: "insufficient_context", savedAt: "2026-11-17T14:11:00+00:00" },
  ],
};

test("cloud notes exports match the committed fixtures used by the Python importer test", () => {
  for (const [name, reviews] of Object.entries(SCENARIOS)) {
    const payload = buildNotesExport(rawFor(reviews), "2026-11-17T15:00:00+00:00");
    const file = path.join(FIXTURES, `${name}.json`);
    const text = `${JSON.stringify(payload, null, 1)}\n`;
    if (process.env.UPDATE_LABELLER_FIXTURES === "1") writeFileSync(file, text, "utf8");
    assert.equal(readFileSync(file, "utf8"), text, `${name} drifted; rerun with UPDATE_LABELLER_FIXTURES=1 and the Python test`);
    for (const entry of payload.labels) {
      assert.equal(entry.kind, "clip");
      assert.ok(Number.isInteger(entry.revision) && entry.revision > 0);
      assert.ok(["draft", "complete"].includes(entry.label.status), "skipped work is exported as a draft");
    }
  }
});

test("presigned R2 URLs sign only the host and carry no SDK checksum parameters", async () => {
  Object.assign(process.env, {
    RR_WEB_MODE: "clip-labeller",
    LABELER_SITE_URL: "https://labels.example",
    LABELER_CODE_PEPPER: "p".repeat(40),
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "AKIDTEST",
    R2_SECRET_ACCESS_KEY: "SECRETTEST",
    R2_BUCKET: "cs2-demo-clips",
  });
  delete process.env.LABELER_DATABASE_URL;
  const { resetLabelerConfig } = await import("../../src/lib/labeler/server/config");
  resetLabelerConfig();
  const { objectStore } = await import("../../src/lib/labeler/server/r2");
  const part = new URL(await objectStore().signPart("clips/a/b.mp4", "upload-1", 3, 600));
  assert.equal(part.host, "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
  assert.equal(part.pathname, "/cs2-demo-clips/clips/a/b.mp4");
  assert.equal(part.searchParams.get("X-Amz-SignedHeaders"), "host");
  assert.equal(part.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(part.searchParams.get("partNumber"), "3");
  assert.equal(part.searchParams.get("uploadId"), "upload-1");
  assert.deepEqual([...part.searchParams.keys()].filter((k) => /checksum/i.test(k)), []);
  assert.ok(!part.toString().includes("SECRETTEST"), "the secret never appears in a signed URL");
  const get = new URL(await objectStore().signGet("clips/a/b.mp4", 300));
  assert.equal(get.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(get.searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("the latest revision wins when several clip versions share one local review key", () => {
  const raw = rawFor([
    { clip: ancient, revision: 7, status: "complete", notes: "older media version", assessment: null, language: "en", issue: null, savedAt: "2026-11-17T12:00:00+00:00" },
    { clip: ancient, revision: 9, status: "draft", notes: "newer media version", assessment: null, language: "en", issue: null, savedAt: "2026-11-17T12:10:00+00:00" },
  ]);
  const payload = buildNotesExport(raw, "2026-11-17T15:00:00+00:00");
  assert.equal(payload.labels.length, 1);
  assert.equal(payload.labels[0].revision, 9);
  assert.deepEqual(Object.keys(payload.demos), [raw.reviews[0].clip.matchId]);
});

test("one play retains several findings through cloud review and portable export", () => {
  const manifest = manifestFixture();
  const clip = manifest.clips[0];
  const members = [clip.finding, { ...clip.finding, id: "F999", detector: "unused_utility", evidence: { grenadeList: "flashbang" } }];
  clip.footage.findings = members;
  clip.footage.reviewKey = members.map((f) => f.id).sort().join("+");
  assert.ok(clipManifestSchema.safeParse(manifest).success);
  for (const change of [{ round: 999 }, { t: 9999 }, { id: clip.finding.id }]) {
    const invalid = structuredClone(manifest);
    Object.assign(invalid.clips[0].footage.findings![1], change);
    assert.equal(clipManifestSchema.safeParse(invalid).success, false);
  }
  const raw = rawFor([
    { clip: ancient, revision: 7, status: "complete", notes: "Original individual note.", assessment: null, language: "en", issue: null, savedAt: "2026-11-18T12:00:00+00:00" },
    { clip: ancient, revision: 9, status: "complete", notes: "Wait for a trade.\nUse the flash before peeking.", assessment: null, language: "en", issue: null, savedAt: "2026-11-18T12:10:00+00:00" },
  ]);
  raw.reviews[1].clip.context.footage = clip.footage;
  const payload = buildNotesExport(raw, "2026-11-18T15:00:00+00:00");
  assert.equal(payload.labels.length, 2, "a grouped play must not overwrite a previous single-finding note");
  assert.deepEqual((payload.labels[1].label.footage as Record<string, unknown>).findings, members);
  const text = `${JSON.stringify(payload, null, 1)}\n`;
  const file = path.join(FIXTURES, "cloud-notes-grouped.json");
  if (process.env.UPDATE_LABELLER_FIXTURES === "1") writeFileSync(file, text, "utf8");
  assert.equal(readFileSync(file, "utf8"), text);
});
