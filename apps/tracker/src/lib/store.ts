import type { Edits, TaskEdit } from "./tasks";

// Upstash Redis over its REST API, so no client library is needed.
// Vercel's Upstash integration exposes either the KV_* or UPSTASH_* names.
// Read at request time so values added in the Vercel dashboard apply on the next deploy.
const KEY = "coach-tracker:edits";

function config() {
  const env = process.env;
  return {
    url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "",
    token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

export function sharedStorage() {
  const { url, token } = config();
  return Boolean(url && token);
}

/** Which storage variables this deployment can see (names only, never values). */
export function storageEnvSeen() {
  return ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter(
    (name) => Boolean(process.env[name]),
  );
}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const { url, token } = config();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `Redis ${res.status}`);
  return body.result as T;
}

export async function readEdits(): Promise<Edits> {
  // HGETALL returns a flat [field, value, field, value, …] list.
  const flat = await redis<string[]>(["HGETALL", KEY]);
  const edits: Edits = {};
  for (let i = 0; i < flat.length; i += 2) {
    try {
      edits[flat[i]] = JSON.parse(flat[i + 1]) as TaskEdit;
    } catch {
      // Ignore a corrupt entry rather than failing the whole board.
    }
  }
  return edits;
}

export async function writeEdit(id: string, edit: TaskEdit): Promise<void> {
  await redis(["HSET", KEY, id, JSON.stringify(edit)]);
}

export async function clearEdit(id: string): Promise<void> {
  await redis(["HDEL", KEY, id]);
}
