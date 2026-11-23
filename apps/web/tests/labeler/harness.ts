/**
 * Test harness: a fresh database per test file on a disposable PostgreSQL 17 server, with the
 * Supabase roles (anon, authenticated, service_role) and the real migration applied. The app's
 * database layer then talks to it through LABELER_DATABASE_URL as service_role, exactly like
 * the Data API's secret key does.
 *
 *   docker run -d --name rr-labeler-testdb -e POSTGRES_PASSWORD=labeler-test -p 127.0.0.1:55432:5432 postgres:17
 *   LABELER_TEST_ADMIN_URL=postgres://postgres:labeler-test@127.0.0.1:55432/postgres npm run test:labeler
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { codeDigest, generateCode, newSessionToken, normaliseCode } from "../../src/lib/labeler/server/codes";
import { resetLabelerConfig } from "../../src/lib/labeler/server/config";
import { closeDatabase, rpc } from "../../src/lib/labeler/server/db";

export const ADMIN_URL = process.env.LABELER_TEST_ADMIN_URL ?? "";
export const PEPPER = "test-pepper-0123456789abcdef0123456789abcdef";
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

export function databaseAvailable(): boolean {
  return Boolean(ADMIN_URL);
}

export async function freshDatabase(): Promise<{ url: string; superuser: pg.Pool; drop: () => Promise<void> }> {
  const name = `lbt_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const base = new URL(ADMIN_URL);
  base.pathname = `/${name}`;
  const superuser = new pg.Pool({ connectionString: base.toString(), max: 4 });
  await superuser.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    await superuser.query(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  const url = `${base.toString()}?options=${encodeURIComponent("-c role=service_role")}`;
  return {
    url,
    superuser,
    drop: async () => {
      await closeDatabase();
      await superuser.end();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

export function configure(databaseUrl: string): void {
  Object.assign(process.env, {
    RR_WEB_MODE: "clip-labeller",
    LABELER_SITE_URL: "http://localhost:3000",
    LABELER_CODE_PEPPER: PEPPER,
    LABELER_DATABASE_URL: databaseUrl,
    R2_ENDPOINT: "http://127.0.0.1:9",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET: "cs2-demo-clips-test",
  });
  delete process.env.VERCEL;
  resetLabelerConfig();
}

export function digestOf(code: string): string {
  return codeDigest(normaliseCode(code)!, PEPPER);
}

export const LOGIN_LIMITS = {
  windowSeconds: 600,
  ipLimit: 1000,
  globalLimit: 100000,
  reviewerTtlSeconds: 7 * 24 * 3600,
  adminTtlSeconds: 12 * 3600,
};

export async function login(code: string, ip = "a".repeat(64), limits = LOGIN_LIMITS) {
  const session = newSessionToken();
  const result = await rpc<{ status: string; account?: { id: string; role: string } }>("labeler_login", {
    codeDigest: codeDigest(normaliseCode(code) ?? `invalid:${code}`, PEPPER),
    ipBucket: ip,
    tokenHash: session.hash,
    ...limits,
  });
  return { ...result, tokenHash: session.hash };
}

export async function bootstrapAdmin(handle = "owner") {
  const code = generateCode();
  const result = await rpc<{ status: string }>("labeler_bootstrap_admin", { handle, displayName: "Owner", codeDigest: digestOf(code) });
  const session = await login(code);
  return { code, result, tokenHash: session.tokenHash, accountId: session.account!.id };
}

export async function createReviewer(adminToken: string, handle: string, displayName = handle) {
  const code = generateCode();
  const result = await rpc<{ account: { id: string } }>("labeler_admin_create_reviewer", {
    tokenHash: adminToken,
    handle,
    displayName,
    codeDigest: digestOf(code),
  });
  const session = await login(code);
  return { code, id: result.account.id, tokenHash: session.tokenHash };
}

export function manifestFixture() {
  const file = path.resolve(__dirname, "../../../../eval/tests/fixtures/labeller/clips-manifest.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Registers the fixture manifest's clips into a collection and marks their media ready. */
export async function readyCollection(adminToken: string, superuser: pg.Pool, name: string, clipFilter?: (clip: { matchId: string }) => boolean) {
  const manifest = manifestFixture();
  const { id: collectionId } = await rpc<{ id: string }>("labeler_admin_collection_create", { tokenHash: adminToken, name });
  const clips = manifest.clips.filter((c: { matchId: string }) => (clipFilter ? clipFilter(c) : true));
  const result = await rpc<{ clips: Array<{ clipId: string }> }>("labeler_admin_import", {
    tokenHash: adminToken,
    collectionId,
    demos: manifest.demos,
    clips: clips.map((c: Record<string, unknown> & { finding: { id: string } }) => ({
      footageId: c.footageId,
      sha256: c.sha256,
      bytes: c.bytes,
      matchId: c.matchId,
      playerId: c.playerId,
      snapshotId: c.snapshotId,
      round: c.round,
      findingId: c.finding.id,
      context: { finding: c.finding, footage: c.footage, batchId: c.batchId },
    })),
    maxClips: 1000,
    maxClipBytes: 256 * 1024 * 1024,
  });
  const clipIds = result.clips.map((c) => c.clipId);
  for (const id of clipIds) {
    await superuser.query(`update labeler.clips set media_state='ready', object_key='clips/'||id||'/test.mp4', ready_at=now() where id=$1`, [id]);
  }
  await rpc("labeler_admin_publish_clips", { tokenHash: adminToken, collectionId, clipIds, published: true });
  await rpc("labeler_admin_collection_update", { tokenHash: adminToken, collectionId, status: "published" });
  return { collectionId, clipIds };
}
