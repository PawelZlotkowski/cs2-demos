/**
 * Owner commands for the hosted clip labeller. Run them on your own PC with the server
 * credentials; they never go through the website.
 *
 *   npm run labeler:admin -- bootstrap --handle pawel --name "Pawel" [--env-file .env.labeler.local]
 *   npm run labeler:admin -- recover --handle pawel [--env-file .env.labeler.local]
 *   npm run labeler:admin -- check [--env-file .env.labeler.local]
 *
 * Needs SUPABASE_URL, SUPABASE_SECRET_KEY and LABELER_CODE_PEPPER (the same pepper as the
 * deployment). bootstrap is idempotent: once any administrator exists it changes nothing.
 * recover issues a new code for an existing administrator and ends their sessions.
 * The new code is printed once. Store it privately; it is not saved anywhere else.
 */
import { codeDigest, generateCode, normaliseCode } from "../src/lib/labeler/server/codes";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function call(name: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  if (process.env.LABELER_DATABASE_URL) {
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: process.env.LABELER_DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(payload)]);
      return { status: 200, body: result.rows[0].result };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      return { status: /^LB\d{3}$/.test(e.code ?? "") ? Number(e.code!.slice(2)) : 500, body: { message: e.message } };
    } finally {
      await client.end();
    }
  }
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) fail("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or pass --env-file).");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ p: payload }),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }
  const code = typeof body.code === "string" && /^LB\d{3}$/.test(body.code) ? Number(body.code.slice(2)) : response.status;
  return { status: response.ok ? 200 : code, body };
}

function pepper(): string {
  const value = process.env.LABELER_CODE_PEPPER ?? "";
  if (Buffer.byteLength(value, "utf8") < 32) fail("Set LABELER_CODE_PEPPER to the deployment's pepper (32 bytes or more).");
  return value;
}

async function main() {
  const envFile = argument("env-file");
  if (envFile) process.loadEnvFile(envFile);
  const command = process.argv[2];
  if (command === "check") {
    const result = await call("labeler_session", { tokenHash: "0".repeat(64) });
    if (result.status === 401) {
      console.log("Database reachable; the labeller functions answer and reject an unknown session as expected.");
      return;
    }
    fail(`Unexpected answer (${result.status}). Check SUPABASE_URL, SUPABASE_SECRET_KEY and that the migration ran.`);
  }
  if (command !== "bootstrap" && command !== "recover") {
    fail("Usage: labeler-admin bootstrap --handle NAME --name 'Display name' | recover --handle NAME | check");
  }
  const handle = argument("handle") ?? "";
  if (!/^[A-Za-z0-9_]{1,40}$/.test(handle)) fail("--handle needs 1–40 letters, digits or underscores.");
  const code = generateCode();
  const digest = codeDigest(normaliseCode(code)!, pepper());
  if (command === "bootstrap") {
    const name = (argument("name") ?? handle).trim();
    const result = await call("labeler_bootstrap_admin", { handle, displayName: name, codeDigest: digest });
    if (result.status !== 200) fail(`Bootstrap failed (${result.status}): ${String(result.body.message ?? "")}`);
    if (result.body.status === "exists") {
      console.log(`An administrator already exists (${String(result.body.admins)}). Nothing changed.`);
      console.log("If you lost the admin code, run: npm run labeler:admin -- recover --handle <handle>");
      return;
    }
  } else {
    const result = await call("labeler_recover_admin", { handle, codeDigest: digest });
    if (result.status !== 200) fail(`Recovery failed (${result.status}): ${String(result.body.message ?? "")}`);
    console.log(`Old admin sessions ended: ${String(result.body.revokedSessions ?? 0)}.`);
  }
  console.log("");
  console.log(`Administrator access code for ${handle} (shown once):`);
  console.log("");
  console.log(`    ${code}`);
  console.log("");
  console.log("Save it in your password manager, then sign in at <your site>/label/login.");
}

main().catch((error: unknown) => fail(`The command failed: ${error instanceof Error ? error.message : String(error)}`));
