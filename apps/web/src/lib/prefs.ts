"use client";

import { api } from "@/lib/api/client";
import type { CoachLanguage, UserSettings } from "@/lib/contracts";
import type { PlaybackRate } from "@/lib/replay/usePlaybackClock";

/**
 * Account settings (doc 30, A07) mirrored in this browser's storage, so pages read them
 * synchronously and they still work while the API is down. The API copy follows the account
 * to other browsers; `pullSettings` brings it in after sign-in.
 */
const LANG_KEY = "rr.coachLanguage";
const RATE_KEY = "rr.playbackRate";
export const LANG_EVENT = "rr:coach-language";
const RATES: PlaybackRate[] = [0.5, 1, 2, 4];

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice holds for this page only */
  }
}

function readLocalLanguage(): CoachLanguage | null {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "pl" || v === "nl") return v;
  } catch {
    /* storage blocked */
  }
  return null;
}

export function readStartRate(): PlaybackRate {
  try {
    const v = Number(window.localStorage.getItem(RATE_KEY));
    if (RATES.includes(v as PlaybackRate)) return v as PlaybackRate;
  } catch {
    /* storage blocked */
  }
  return 1;
}

function toLocal(s: Partial<UserSettings>) {
  if (s.language) {
    write(LANG_KEY, s.language);
    window.dispatchEvent(new Event(LANG_EVENT));
  }
  if (s.playbackSpeed && RATES.includes(s.playbackSpeed as PlaybackRate)) write(RATE_KEY, String(s.playbackSpeed));
}

let server: UserSettings | null = null;
// Saves wait for the pull, so a choice made while it runs is not overwritten by it
let pulling: Promise<unknown> = Promise.resolve();

function readLocalRate(): PlaybackRate | null {
  try {
    const raw = window.localStorage.getItem(RATE_KEY);
    return raw ? readStartRate() : null;
  } catch {
    return null;
  }
}

/** Server copy into this browser, once per sign-in. */
export function pullSettings(): Promise<UserSettings | null> {
  const run = (async () => {
    try {
      server = await api.getMySettings();
      if (server.saved) toLocal(server);
      else {
        // Nothing on the account yet: choices this browser made before accounts become the account's
        const lang = readLocalLanguage();
        const rate = readLocalRate();
        if (lang || rate) server = await api.saveMySettings({ ...server, ...(lang ? { language: lang } : {}), ...(rate ? { playbackSpeed: rate } : {}) });
      }
      return server;
    } catch {
      return null;
    }
  })();
  pulling = run;
  return run;
}

/** Save one or more settings here and on the account. The API copy is best effort. */
export async function pushSettings(patch: Partial<UserSettings>): Promise<void> {
  toLocal(patch);
  await pulling;
  try {
    const base = server ?? (await api.getMySettings());
    server = await api.saveMySettings({ ...base, ...patch });
  } catch {
    /* API down or signed out: this browser keeps the choice */
  }
}
