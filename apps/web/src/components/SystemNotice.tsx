"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

const CACHE_KEY = "rr.system";
const CACHE_MS = 60_000;

/** Top-bar line that shows only when part of the local setup is on but not working (doc 29 R01). */
export function SystemNotice() {
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null") as
        | { at: number; problem: string | null }
        | null;
      if (cached && Date.now() - cached.at < CACHE_MS) {
        setProblem(cached.problem);
        return;
      }
    } catch {
      /* storage blocked */
    }
    api
      .getSystem()
      .then((s) => {
        const bad = s.checks.filter((c) => c.state === "problem").map((c) => LABELS[c.name]);
        const text = bad.length ? `${bad.join(" and ")} not working` : null;
        if (cancelled) return;
        setProblem(text);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), problem: text }));
        } catch {
          /* storage blocked */
        }
      })
      .catch(() => {
        if (!cancelled) setProblem("API not reachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!problem) return null;
  return (
    <Link href="/settings#system" className="sys-notice" title={`${problem}. Open the system checks.`}>
      <span className="sys-dot" aria-hidden />
      <span className="sys-text">{problem}</span>
    </Link>
  );
}

export const LABELS: Record<string, string> = {
  llm: "Coach model",
  mcp: "Coach tools",
  csdm: "Clip recording",
  knowledge: "Knowledge base",
  traces: "Run log",
};
