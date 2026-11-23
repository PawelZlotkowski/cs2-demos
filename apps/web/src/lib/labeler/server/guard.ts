/**
 * The cookie's session token hash for a protected route. The database function behind every
 * protected call re-checks the session, account status, credential version, role and
 * assignment in its own transaction; the browser never supplies an account ID or role.
 */
import { LabelerError } from "./db";
import { sessionTokenHash } from "./session";

export async function tokenHashOr401(): Promise<string> {
  const hash = await sessionTokenHash();
  if (!hash) throw new LabelerError(401, "Sign in with your access code.");
  return hash;
}

export type Params<T extends string> = { params: Promise<Record<T, string>> };
