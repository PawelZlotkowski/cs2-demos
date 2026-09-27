"use client";

import { useCallback, useEffect, useState } from "react";
import type { CoachLanguage } from "@/lib/contracts";
import { LANG_EVENT, pushSettings } from "@/lib/prefs";

/** Coach answer languages (plan §6.4). UI copy stays English. */
export const COACH_LANGUAGES: { id: CoachLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pl", label: "Polish" },
  { id: "nl", label: "Dutch" },
];

const KEY = "rr.coachLanguage";
const EVENT = LANG_EVENT;

export function readCoachLanguage(): CoachLanguage {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "en" || v === "pl" || v === "nl") return v;
  } catch {
    /* storage blocked */
  }
  return "en";
}

/** Account setting, mirrored in this browser, shared by the Studio, the Ask tab and the player picker. */
export function useCoachLanguage(): [CoachLanguage, (lang: CoachLanguage) => void] {
  const [lang, setLang] = useState<CoachLanguage>("en");

  useEffect(() => {
    setLang(readCoachLanguage());
    const sync = () => setLang(readCoachLanguage());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((next: CoachLanguage) => {
    setLang(next);
    // Saved here and on the account, so the coach answers in it on every device
    void pushSettings({ language: next });
  }, []);

  return [lang, set];
}
