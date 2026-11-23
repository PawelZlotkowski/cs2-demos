/**
 * Cookie sessions for the clip labeller. The cookie holds a random 256-bit token; PostgreSQL
 * stores only its SHA-256 hash and checks expiry, revocation, account status and credential
 * version on every protected call.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { hashSessionToken, isSessionToken } from "./codes";
import { labelerConfig } from "./config";
import { LabelerError, rpc } from "./db";

export type Role = "admin" | "reviewer";

export interface Account {
  id: string;
  handle: string;
  displayName: string;
  role: Role;
  status: "active" | "inactive";
}

export function cookieName(): string {
  return labelerConfig().localDevelopment ? "rr_label_session" : "__Host-rr_label_session";
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  const config = labelerConfig();
  response.cookies.set({
    name: cookieName(),
    value: token,
    httpOnly: true,
    secure: !config.localDevelopment,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: cookieName(),
    value: "",
    httpOnly: true,
    secure: !labelerConfig().localDevelopment,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The session token hash from the request cookie, or null. */
export async function sessionTokenHash(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  return isSessionToken(token) ? hashSessionToken(token) : null;
}

/** Throws LabelerError(401/403) unless the cookie names a live session with the given role. */
export async function requireSession(role: Role | null = null): Promise<{ tokenHash: string; account: Account }> {
  const tokenHash = await sessionTokenHash();
  if (!tokenHash) throw new LabelerError(401, "Sign in with your access code.");
  const result = await rpc<{ account: Account }>("labeler_session", { tokenHash, role: role ?? "" });
  return { tokenHash, account: result.account };
}

/** The current account for server components; null when signed out or the session ended. */
export async function currentAccount(): Promise<Account | null> {
  try {
    return (await requireSession()).account;
  } catch (error) {
    if (error instanceof LabelerError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}
