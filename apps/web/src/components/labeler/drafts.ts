"use client";

/**
 * Unsent note text kept on this device so a dropped connection or reload loses nothing.
 * Keys are scoped by account and clip, and every key is removed on sign-out or when a different
 * account signs in, so the next person on a shared browser never sees someone else's draft.
 * Access codes and session tokens are never stored here.
 */
const PREFIX = "rr-label-draft:";

export interface LocalDraft {
  notes: string;
  assessment: "good" | "mistake" | "uncertain" | null;
  language: "en" | "pl";
  baseRevision: number | null;
  savedAt: number;
}

function key(accountId: string, clipId: string): string {
  return `${PREFIX}${accountId}:${clipId}`;
}

export function readDraft(accountId: string, clipId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key(accountId, clipId));
    if (!raw) return null;
    const value = JSON.parse(raw) as LocalDraft;
    return typeof value.notes === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeDraft(accountId: string, clipId: string, draft: LocalDraft): void {
  try {
    window.localStorage.setItem(key(accountId, clipId), JSON.stringify(draft));
  } catch {
    // Storage may be full or disabled; the server copy still exists.
  }
}

export function removeDraft(accountId: string, clipId: string): void {
  try {
    window.localStorage.removeItem(key(accountId, clipId));
  } catch {
    // ignore
  }
}

/** Remove every labeller draft, or all except one account's. */
export function clearDrafts(exceptAccountId?: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const name = window.localStorage.key(i);
      if (name?.startsWith(PREFIX) && !(exceptAccountId && name.startsWith(`${PREFIX}${exceptAccountId}:`))) doomed.push(name);
    }
    for (const name of doomed) window.localStorage.removeItem(name);
  } catch {
    // ignore
  }
}
