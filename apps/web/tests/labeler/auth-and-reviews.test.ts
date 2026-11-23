/**
 * Authentication, authorisation and transactional-save boundaries, run against the real
 * migration on PostgreSQL. Every call goes through the same rpc() the route handlers use.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { generateCode } from "../../src/lib/labeler/server/codes";
import { LabelerError, rpc } from "../../src/lib/labeler/server/db";
import { buildNotesExport, type ExportRaw } from "../../src/lib/labeler/server/export";
import {
  bootstrapAdmin,
  configure,
  createReviewer,
  databaseAvailable,
  digestOf,
  freshDatabase,
  login,
  LOGIN_LIMITS,
  manifestFixture,
  readyCollection,
} from "./harness";

const skip = !databaseAvailable() && "set LABELER_TEST_ADMIN_URL to a disposable PostgreSQL server";

async function rejects(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => error instanceof LabelerError && error.status === status);
}

function save(tokenHash: string, clipId: string, values: Record<string, unknown> = {}) {
  return rpc<{ result: string; review: { revision: number; status: string; notes: string }; current?: { revision: number } | null; headRevision?: number }>(
    "labeler_reviewer_save",
    {
      tokenHash,
      clipId,
      requestId: randomUUID(),
      previousRevision: null,
      status: "draft",
      notes: "",
      assessment: null,
      language: "en",
      issue: null,
      confirmFootage: false,
      ...values,
    },
  );
}

describe("clip labeller database boundaries", { skip }, () => {
  let db: Awaited<ReturnType<typeof freshDatabase>>;
  let admin: Awaited<ReturnType<typeof bootstrapAdmin>>;
  let alex: Awaited<ReturnType<typeof createReviewer>>;
  let jamie: Awaited<ReturnType<typeof createReviewer>>;
  let ancient: { collectionId: string; clipIds: string[] };
  let anubis: { collectionId: string; clipIds: string[] };

  before(async () => {
    db = await freshDatabase();
    configure(db.url);
    admin = await bootstrapAdmin();
    alex = await createReviewer(admin.tokenHash, "alex_web", "Alex");
    jamie = await createReviewer(admin.tokenHash, "jamie_web", "Jamie");
    const fixture = manifestFixture();
    const [ancientDemo] = Object.keys(fixture.demos).filter((id) => fixture.demos[id].metadata.map === "de_ancient");
    ancient = await readyCollection(admin.tokenHash, db.superuser, "Ancient pilot", (c) => c.matchId === ancientDemo);
    anubis = await readyCollection(admin.tokenHash, db.superuser, "Anubis pilot", (c) => c.matchId !== ancientDemo);
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: alex.id, assigned: true });
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: jamie.id, assigned: true });
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: anubis.collectionId, accountId: jamie.id, assigned: true });
  });

  after(async () => {
    await db?.drop();
  });

  test("bootstrap is idempotent and never resets an existing owner", async () => {
    const again = await rpc<{ status: string }>("labeler_bootstrap_admin", { handle: "owner", displayName: "Owner", codeDigest: digestOf(generateCode()) });
    assert.equal(again.status, "exists");
    assert.equal((await login(admin.code)).status, "ok", "the original admin code still works");
  });

  test("distinct codes sign into the right accounts; invalid and malformed codes look the same", async () => {
    assert.notEqual(alex.code, jamie.code);
    assert.match(alex.code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    const a = await login(alex.code.toLowerCase().replace(/-/g, " "));
    assert.equal(a.status, "ok");
    assert.equal(a.account!.id, alex.id);
    assert.equal(a.account!.role, "reviewer");
    assert.equal((await login(jamie.code)).account!.id, jamie.id);
    const malformed = await login("not a code");
    assert.equal(malformed.status, "invalid");
    const wrong = await login(generateCode());
    assert.equal(wrong.status, "invalid");
    assert.equal(Object.keys(wrong).sort().join(), "status,tokenHash");
  });

  test("login is rate limited per client bucket, persistently", async () => {
    const ip = "b".repeat(64);
    const limits = { ...LOGIN_LIMITS, ipLimit: 3 };
    for (let i = 0; i < 3; i += 1) assert.equal((await login(generateCode(), ip, limits)).status, "invalid");
    assert.equal((await login(alex.code, ip, limits)).status, "rate_limited", "even a valid code is refused once limited");
    assert.equal((await login(alex.code, "c".repeat(64), limits)).status, "ok", "other clients are unaffected");
  });

  test("reviewers cannot use admin functions; signed-out callers are rejected", async () => {
    await rejects(rpc("labeler_admin_overview", { tokenHash: alex.tokenHash }), 403);
    await rejects(rpc("labeler_admin_create_reviewer", { tokenHash: alex.tokenHash, handle: "mallory", displayName: "M", codeDigest: digestOf(generateCode()) }), 403);
    await rejects(rpc("labeler_admin_upload_begin", { tokenHash: alex.tokenHash }), 403);
    await rejects(rpc("labeler_admin_export", { tokenHash: alex.tokenHash, accountId: jamie.id }), 403);
    await rejects(rpc("labeler_reviewer_home", { tokenHash: "f".repeat(64) }), 401);
    await rejects(rpc("labeler_reviewer_home", { tokenHash: "not-a-hash" }), 401);
  });

  test("assignments, publication and archive bound what a reviewer can open, play and save", async () => {
    const [anubisClip] = anubis.clipIds;
    const [ancientClip] = ancient.clipIds;
    await rejects(rpc("labeler_reviewer_clip", { tokenHash: alex.tokenHash, collectionId: anubis.collectionId, clipId: anubisClip }), 404);
    await rejects(rpc("labeler_reviewer_clip", { tokenHash: alex.tokenHash, collectionId: ancient.collectionId, clipId: anubisClip }), 404);
    await rejects(rpc("labeler_reviewer_playback", { tokenHash: alex.tokenHash, clipId: anubisClip }), 404);
    await rejects(save(alex.tokenHash, anubisClip, { notes: "sneaky" }), 404);
    const home = await rpc<{ collections: Array<{ id: string }> }>("labeler_reviewer_home", { tokenHash: alex.tokenHash });
    assert.deepEqual(home.collections.map((c) => c.id), [ancient.collectionId]);

    const view = await rpc<Record<string, unknown> & { clip: Record<string, unknown> }>("labeler_reviewer_clip", {
      tokenHash: alex.tokenHash,
      collectionId: ancient.collectionId,
      clipId: ancientClip,
    });
    const text = JSON.stringify(view);
    for (const secret of ["finding", "detector", "snapshot", "76561198", "demo-", "objectKey", "evidence"]) {
      assert.ok(!text.includes(secret), `reviewer view leaks ${secret}`);
    }
    assert.equal(view.clip.playerName, "Selected player");
    assert.equal(view.clip.map, "de_ancient");

    // Withdrawing the clip, unpublishing or archiving the collection, or revoking the
    // assignment each stop new playback immediately.
    const check = () => rpc("labeler_reviewer_playback", { tokenHash: jamie.tokenHash, clipId: ancientClip });
    await check();
    await rpc("labeler_admin_publish_clips", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, clipIds: [ancientClip], published: false });
    await rejects(check(), 404);
    await rpc("labeler_admin_publish_clips", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, clipIds: [ancientClip], published: true });
    await rpc("labeler_admin_collection_update", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, status: "archived" });
    await rejects(check(), 404);
    await rpc("labeler_admin_collection_update", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, status: "published" });
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: jamie.id, assigned: false });
    await rejects(check(), 404);
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: jamie.id, assigned: true });
    await check();
  });

  test("saves: required note and confirmation, idempotent retries, conflicts, append-only revisions", async () => {
    const [clip] = ancient.clipIds;
    await rejects(save(alex.tokenHash, clip, { status: "complete", notes: "  ", confirmFootage: true }), 422);
    await rejects(save(alex.tokenHash, clip, { status: "complete", notes: "Good trade", confirmFootage: false }), 422);
    await rejects(save(alex.tokenHash, clip, { status: "draft", notes: "x", confirmFootage: true }), 422);

    const draft = await save(alex.tokenHash, clip, { notes: "Thinking…" });
    assert.equal(draft.result, "saved");
    const requestId = randomUUID();
    const body = { requestId, previousRevision: draft.review.revision, status: "complete", notes: "Swung wide without a trade.", assessment: "mistake", confirmFootage: true };
    const complete = await save(alex.tokenHash, clip, body);
    assert.equal(complete.result, "saved");
    assert.ok(complete.review.revision > draft.review.revision, "revisions increase");

    const later = await save(alex.tokenHash, clip, { previousRevision: complete.review.revision, notes: "Reconsidering", status: "draft" });
    const retried = await save(alex.tokenHash, clip, body);
    assert.equal(retried.result, "replayed", "the same request returns its original result");
    assert.equal(retried.review.revision, complete.review.revision);
    assert.equal(retried.headRevision, later.review.revision);
    await rejects(save(alex.tokenHash, clip, { ...body, notes: "different text" }), 409);

    const stale = await save(alex.tokenHash, clip, { previousRevision: draft.review.revision, notes: "Old tab" });
    assert.equal(stale.result, "conflict");
    assert.equal(stale.current!.revision, later.review.revision, "the server version is returned for resolution");

    // Jamie's review of the same clip is independent.
    const jamieSave = await save(jamie.tokenHash, clip, { status: "complete", notes: "Fine spacing.", confirmFootage: true, assessment: "good" });
    assert.equal(jamieSave.result, "saved");
    const jamieView = await rpc<{ review: { notes: string } }>("labeler_reviewer_clip", { tokenHash: jamie.tokenHash, collectionId: ancient.collectionId, clipId: clip });
    assert.equal(jamieView.review.notes, "Fine spacing.");

    await assert.rejects(db.superuser.query("update labeler.review_revisions set notes='edited'"), /append-only/);
    await assert.rejects(db.superuser.query("delete from labeler.review_revisions"), /append-only/);
  });

  test("two tabs saving from the same revision: exactly one wins", async () => {
    const clip = ancient.clipIds[0];
    const head = await rpc<{ review: { revision: number } }>("labeler_reviewer_clip", { tokenHash: jamie.tokenHash, collectionId: ancient.collectionId, clipId: clip });
    const results = await Promise.all(
      ["Tab one", "Tab two", "Tab three"].map((notes) => save(jamie.tokenHash, clip, { previousRevision: head.review.revision, notes })),
    );
    assert.equal(results.filter((r) => r.result === "saved").length, 1);
    assert.equal(results.filter((r) => r.result === "conflict").length, 2);
  });

  test("deactivation and code regeneration end sessions; notes stay attributed", async () => {
    const extra = await createReviewer(admin.tokenHash, "temp_web", "Temp");
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: extra.id, assigned: true });
    const saved = await save(extra.tokenHash, ancient.clipIds[0], { status: "complete", notes: "Kept after deactivation.", confirmFootage: true });
    await rpc("labeler_admin_set_status", { tokenHash: admin.tokenHash, accountId: extra.id, status: "inactive" });
    await rejects(save(extra.tokenHash, ancient.clipIds[0], { previousRevision: saved.review.revision, notes: "after" }), 401);
    await rejects(rpc("labeler_reviewer_playback", { tokenHash: extra.tokenHash, clipId: ancient.clipIds[0] }), 401);
    assert.equal((await login(extra.code)).status, "invalid");
    const exported = await rpc<ExportRaw>("labeler_admin_export", { tokenHash: admin.tokenHash, accountId: extra.id });
    assert.equal(exported.reviews[0].notes, "Kept after deactivation.");
    assert.equal(exported.account.handle, "temp_web");
    await rejects(rpc("labeler_admin_set_status", { tokenHash: admin.tokenHash, accountId: extra.id, status: "active" }), 422);

    const old = await login(jamie.code);
    const fresh = generateCode();
    await rpc("labeler_admin_regenerate_code", { tokenHash: admin.tokenHash, accountId: jamie.id, codeDigest: digestOf(fresh) });
    await rejects(rpc("labeler_reviewer_home", { tokenHash: old.tokenHash }), 401);
    await rejects(rpc("labeler_reviewer_home", { tokenHash: jamie.tokenHash }), 401);
    assert.equal((await login(jamie.code)).status, "invalid");
    const renewed = await login(fresh);
    assert.equal(renewed.account!.id, jamie.id, "same immutable account");
    jamie = { ...jamie, code: fresh, tokenHash: renewed.tokenHash };
    const notes = await rpc<{ notes: Array<{ accountId: string }> }>("labeler_admin_notes", { tokenHash: admin.tokenHash, accountId: jamie.id });
    assert.ok(notes.notes.length > 0, "earlier notes remain on the account");
  });

  test("concurrent login and code rotation never leaves a session for the obsolete code", async () => {
    for (let i = 0; i < 15; i += 1) {
      const fresh = generateCode();
      const [attempt] = await Promise.all([
        login(jamie.code),
        rpc("labeler_admin_regenerate_code", { tokenHash: admin.tokenHash, accountId: jamie.id, codeDigest: digestOf(fresh) }),
      ]);
      if (attempt.status === "ok") await rejects(rpc("labeler_reviewer_home", { tokenHash: attempt.tokenHash }), 401);
      jamie = { ...jamie, code: fresh, tokenHash: (await login(fresh)).tokenHash };
    }
  });

  test("concurrent save and deactivation stay consistent", async () => {
    const temp = await createReviewer(admin.tokenHash, "race_web", "Race");
    await rpc("labeler_admin_assign", { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, accountId: temp.id, assigned: true });
    const [outcome] = await Promise.allSettled([
      save(temp.tokenHash, ancient.clipIds[0], { notes: "racing" }),
      rpc("labeler_admin_set_status", { tokenHash: admin.tokenHash, accountId: temp.id, status: "inactive" }),
    ]);
    const { rows } = await db.superuser.query(
      `select r.created_at, a.updated_at from labeler.review_revisions r join labeler.accounts a on a.id=r.account_id where a.id=$1`,
      [temp.id],
    );
    if (outcome.status === "fulfilled") assert.equal(rows.length, 1);
    else assert.equal(rows.length, 0);
    await rejects(save(temp.tokenHash, ancient.clipIds[0], { notes: "late" }), 401);
  });

  test("the final active administrator cannot be deactivated", async () => {
    await rejects(rpc("labeler_admin_set_status", { tokenHash: admin.tokenHash, accountId: admin.accountId, status: "inactive" }), 409);
  });

  test("admin recovery replaces the code and ends old sessions", async () => {
    const fresh = generateCode();
    const result = await rpc<{ status: string }>("labeler_recover_admin", { handle: "OWNER", codeDigest: digestOf(fresh) });
    assert.equal(result.status, "recovered");
    await rejects(rpc("labeler_admin_overview", { tokenHash: admin.tokenHash }), 401);
    assert.equal((await login(admin.code)).status, "invalid");
    const session = await login(fresh);
    admin = { ...admin, code: fresh, tokenHash: session.tokenHash };
    await rpc("labeler_admin_overview", { tokenHash: admin.tokenHash });
  });

  test("manifest imports converge; source context and ready media are immutable", async () => {
    const manifest = manifestFixture();
    const clip = manifest.clips[0];
    const entry = {
      footageId: clip.footageId,
      sha256: clip.sha256,
      bytes: clip.bytes,
      matchId: clip.matchId,
      playerId: clip.playerId,
      snapshotId: clip.snapshotId,
      round: clip.round,
      findingId: clip.finding.id,
      context: { finding: clip.finding, footage: clip.footage, batchId: clip.batchId },
    };
    const base = { tokenHash: admin.tokenHash, collectionId: ancient.collectionId, demos: manifest.demos, maxClips: 1000, maxClipBytes: 1e9 };
    const first = await rpc<{ clips: Array<{ clipId: string; created: boolean }> }>("labeler_admin_import", { ...base, clips: [entry] });
    assert.equal(first.clips[0].created, false, "repeated import converges on the existing clip");
    const { rows: before } = await db.superuser.query("select count(*)::int as n from labeler.clips");
    await rejects(rpc("labeler_admin_import", { ...base, clips: [{ ...entry, round: entry.round + 1 }] }), 409);
    const changed = { ...entry, sha256: "e".repeat(64), context: { ...entry.context, footage: { ...entry.context.footage, sha256: "e".repeat(64) } } };
    const version = await rpc<{ clips: Array<{ created: boolean; newVersion: boolean }> }>("labeler_admin_import", { ...base, clips: [changed] });
    assert.deepEqual([version.clips[0].created, version.clips[0].newVersion], [true, true], "changed media becomes a new version");
    const { rows: afterRows } = await db.superuser.query("select count(*)::int as n from labeler.clips");
    assert.equal(afterRows[0].n, before[0].n + 1);
    const tamperedDemo = structuredClone(manifest.demos);
    tamperedDemo[clip.matchId].metadata.players[0].name = "Renamed";
    await rejects(rpc("labeler_admin_import", { ...base, demos: tamperedDemo, clips: [entry] }), 409);
    await assert.rejects(db.superuser.query("update labeler.clips set object_key='clips/other.mp4' where media_state='ready'"), /immutable/);
  });

  test("browser roles have no access to tables, schema or functions", async () => {
    for (const role of ["anon", "authenticated"]) {
      const client = new pg.Client({ connectionString: db.url.replace("role%3Dservice_role", `role%3D${role}`) });
      await client.connect();
      await assert.rejects(client.query("select * from labeler.accounts"), /permission denied/);
      await assert.rejects(client.query("select public.labeler_login('{}'::jsonb)"), /permission denied/);
      await assert.rejects(client.query(`select public.labeler_reviewer_home('{"tokenHash":"${"a".repeat(64)}"}'::jsonb)`), /permission denied/);
      await client.end();
    }
    const service = new pg.Client({ connectionString: db.url });
    await service.connect();
    await assert.rejects(service.query("select * from labeler.accounts"), /permission denied/, "even the server role reaches data only through functions");
    await service.end();
  });

  test("notes export recreates clip labels; skipped work becomes a draft", async () => {
    const head = await rpc<{ review: { revision: number } }>("labeler_reviewer_clip", { tokenHash: jamie.tokenHash, collectionId: ancient.collectionId, clipId: ancient.clipIds[0] });
    await save(jamie.tokenHash, ancient.clipIds[0], { previousRevision: head.review.revision, status: "complete", notes: "Good spacing.", confirmFootage: true, assessment: "good" });
    const clip = anubis.clipIds[0];
    await save(jamie.tokenHash, clip, { status: "skipped", notes: "Need the full round.", issue: "insufficient_context" });
    const raw = await rpc<ExportRaw>("labeler_admin_export", { tokenHash: admin.tokenHash, accountId: jamie.id });
    const notes = buildNotesExport(raw, "2026-11-17T12:00:00Z");
    assert.equal(notes.format, "round-reviewer-notes-v1");
    assert.match(notes.origin, /^[a-f0-9]{32}$/);
    assert.equal(notes.labeller, "jamie_web");
    const skipped = notes.labels.find((l) => l.label.cloud.clipId === clip)!;
    assert.equal(skipped.label.status, "draft");
    assert.equal(skipped.label.footage.alignmentConfirmed, false);
    const complete = notes.labels.find((l) => l.label.status === "complete")!;
    assert.equal(complete.label.footage.alignmentConfirmed, true);
    assert.equal(complete.label.inputMode, "note");
    assert.ok(Object.keys(notes.demos).every((id) => notes.labels.some((l) => l.label.matchId === id)));
  });
});
