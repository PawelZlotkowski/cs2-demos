import type { Edits, TaskEdit } from "./tasks";

// Upstash Redis over its REST API, so no client library is needed.
// Vercel's Upstash integration exposes either the KV_* or UPSTASH_* names.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "coach-tracker:edits";

export const sharedStorage = Boolean(url && token);

async function redis<T>(command: (string | number)[]): Promise<T> {
  const res = await fetch(url!, {
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
