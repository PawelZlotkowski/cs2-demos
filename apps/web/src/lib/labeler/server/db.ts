/**
 * Calls the server-only public.labeler_* database functions. In production this is the
 * Supabase Data API with the secret key in the apikey header (service_role). Local development
 * and tests may use LABELER_DATABASE_URL for a direct Postgres connection with the same SQL.
 *
 * Every function takes one jsonb argument and re-checks the session, role and assignment in
 * its own transaction. Payloads (token and code digests) are never logged.
 */
import { labelerConfig } from "./config";

export class LabelerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LabelerError";
  }
}

export type Transport = (name: string, payload: Record<string, unknown>) => Promise<unknown>;

const NAME = /^labeler_[a-z_]{2,60}$/;
let override: Transport | null = null;

/** Tests swap the transport; production never calls this. */
export function setTransport(transport: Transport | null): void {
  override = transport;
}

function databaseError(code: unknown, message: unknown): LabelerError | null {
  if (typeof code === "string" && /^LB\d{3}$/.test(code)) {
    return new LabelerError(Number(code.slice(2)), typeof message === "string" ? message : "Request rejected.");
  }
  return null;
}

async function viaDataApi(name: string, payload: Record<string, unknown>): Promise<unknown> {
  const config = labelerConfig();
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseSecretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p: payload }),
      cache: "no-store",
    });
  } catch {
    throw new LabelerError(503, "The database is unreachable. Try again shortly.");
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = body as { code?: unknown; message?: unknown } | null;
    const known = databaseError(error?.code, error?.message);
    if (known) throw known;
    console.error(`labeler rpc ${name} failed: HTTP ${response.status} ${typeof error?.code === "string" ? error.code : ""}`);
    throw new LabelerError(502, "The database rejected the request. Try again shortly.");
  }
  return body;
}

type PgPool = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  end: () => Promise<void>;
};
let pool: PgPool | null = null;

/** Local development and tests: close the direct Postgres pool. */
export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = null;
  await current?.end();
}

async function viaPostgres(name: string, payload: Record<string, unknown>): Promise<unknown> {
  if (!pool) {
    const pg = await import("pg");
    pool = new pg.default.Pool({ connectionString: labelerConfig().databaseUrl, max: 5 }) as unknown as PgPool;
  }
  try {
    const result = await pool.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(payload)]);
    return result.rows[0]?.result ?? null;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    const known = databaseError(e.code, e.message);
    if (known) throw known;
    console.error(`labeler rpc ${name} failed: ${typeof e.code === "string" ? e.code : "error"}`);
    throw new LabelerError(502, "The database rejected the request. Try again shortly.");
  }
}

export async function rpc<T = Record<string, unknown>>(name: string, payload: Record<string, unknown>): Promise<T> {
  if (!NAME.test(name)) throw new Error("Unknown labeller function.");
  if (override) return (await override(name, payload)) as T;
  const config = labelerConfig();
  return (await (config.databaseUrl ? viaPostgres(name, payload) : viaDataApi(name, payload))) as T;
}
