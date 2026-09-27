"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage, PlanItem, PracticePlan } from "@/lib/contracts";
import { CoachText } from "./CoachText";

type Props = { playerId: string; language: CoachLanguage };

function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function trend(i: PlanItem): string | null {
  if (i.per10Recent == null || i.per10Before == null) return null;
  const moved =
    i.per10Recent < i.per10Before ? "down from" : i.per10Recent > i.per10Before ? "up from" : "the same as";
  return `${i.per10Recent} per 10 rounds in your last 3 matches, ${moved} ${i.per10Before} before.`;
}

/** Coach page, Plan: what to practise across matches, with the evidence and a drill (doc 29 §2.1, R09). */
export function PlanTab({ playerId, language }: Props) {
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPlan(null);
    setError(null);
    setBusy(true);
    api
      .getPlan(playerId, language)
      .then((p) => live && setPlan(p))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The coach did not answer."))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [playerId, language]);

  async function renew() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.newPlan(playerId, language));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach did not answer.");
    } finally {
      setBusy(false);
    }
  }

  async function tick(i: PlanItem, done: boolean) {
    try {
      setPlan(await api.tickPlan(playerId, i.detector, done, language));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save that.");
    }
  }

  const href = (ref: string, fid: string) =>
    plan?.matches[ref] ? `/studio/${plan.matches[ref]}?f=${encodeURIComponent(fid)}` : undefined;

  if (error) return <p className="err" role="alert">{error}</p>;
  if (!plan) return <p className="meta thinking">{busy ? "Writing your practice plan…" : "Loading…"}</p>;

  return (
    <section className="plan" aria-live="polite">
      <div className="plan-note">
        <p className="expl">
          <CoachText text={plan.text} matchFindingHref={href} />
        </p>
        <p className="aa-note">
          {plan.source === "agent"
            ? "Written by the coach model and checked against your findings."
            : "Written from your findings: the coach model is off or its note did not pass the checks."}{" "}
          Plan from {when(plan.createdAt)}.
        </p>
      </div>

      {plan.items.length ? (
        <ol className="plan-items">
          {plan.items.map((i) => {
            const moved = trend(i);
            const [ref, fid] = i.example?.split(":") ?? [];
            const exampleHref = ref && fid ? href(ref, fid) : undefined;
            return (
              <li key={i.detector} data-done={i.done || undefined}>
                <div className="plan-item-h">
                  <h2>{i.label}</h2>
                  <label className="plan-done">
                    <input type="checkbox" checked={i.done} onChange={(e) => void tick(i, e.target.checked)} />
                    Practised
                  </label>
                </div>
                <p className="plan-evidence">
                  In <span className="num">{i.matchesWith}</span> of your last{" "}
                  <span className="num">{i.matchesTotal}</span> {i.matchesTotal === 1 ? "match" : "matches"}.
                  {moved ? <> {moved}</> : null}
                  {exampleHref ? (
                    <>
                      {" "}
                      <a className="link" href={exampleHref}>
                        Watch the latest one
                      </a>
                    </>
                  ) : null}
                </p>
                {i.drillTitle ? (
                  <div className="plan-drill">
                    <h3>Drill: {i.drillTitle}</h3>
                    <p>{i.drillText}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="plan-actions">
        <button type="button" className="btn btn-line" onClick={() => void renew()} disabled={busy}>
          {busy ? "Writing…" : "Write a new plan"}
        </button>
        <span className="meta">A new plan counts the matches you have added since and keeps what you ticked.</span>
      </div>
    </section>
  );
}
