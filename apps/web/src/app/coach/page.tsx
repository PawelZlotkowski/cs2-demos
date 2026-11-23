"use client";

import { LoadingState } from "@/components/LoadingState";
import { ModelNotice } from "@/components/SystemNotice";
import { PillBubble } from "@/components/PillBubble";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { STEP_LABELS } from "@/components/coach/CoachPanel";
import { CoachText } from "@/components/coach/CoachText";
import { KnowledgeTab } from "@/components/coach/KnowledgeTab";
import { PlanTab } from "@/components/coach/PlanTab";
import { api } from "@/lib/api/client";
import { COACH_LANGUAGES, useCoachLanguage } from "@/lib/coach/language";
import { useCoachedPlayer } from "@/lib/coach/players";
import type { CoachLanguage } from "@/lib/contracts";
import { useHashTab } from "@/lib/useHashTab";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "plan", label: "Plan" },
  { id: "knowledge", label: "Knowledge" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

const SUGGESTIONS = [
  "What mistake do I repeat most across my matches?",
  "Where do I die most often, and what should I do instead?",
  "Show me a round where I traded well.",
];

type Turn = {
  id: number;
  q: string;
  a: string;
  pending: boolean;
  steps: string[];
  error?: boolean;
  source?: "agent" | "template";
  verified?: boolean;
  /** Cited match refs ("M2") to match ids, from the answer event. */
  matches: Record<string, string>;
};

/** Coach page: Ask across every analysed match of one player, Plan and Knowledge (doc 29 §2.1, R06, R09, R12). */
export default function CoachPage() {
  const { players, error: loadError, playerId, player, pick, retry } = useCoachedPlayer();
  const [tab, setTab] = useHashTab<Tab>(TAB_IDS, "ask");
  const [admin, setAdmin] = useState(false);
  const [language, setLanguage] = useCoachLanguage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const aborts = useRef(new Map<number, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .features()
      .then((f) => setAdmin(f.lab))
      .catch(() => setAdmin(false));
    const live = aborts.current;
    return () => live.forEach((c) => c.abort());
  }, []);

  // `/` focuses Ask, as in the Studio.
  useEffect(() => {
    if (tab !== "ask") return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tab]);

  function pickPlayer(id: string) {
    aborts.current.forEach((c) => c.abort());
    aborts.current.clear();
    pick(id);
    setTurns([]);
  }

  const patch = (id: number, f: (x: Turn) => Turn) => setTurns((ts) => ts.map((x) => (x.id === id ? f(x) : x)));

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || !playerId) return;
    setDraft("");
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, q: question, a: "", pending: true, steps: [], matches: {} }]);
    const ctl = new AbortController();
    aborts.current.set(id, ctl);
    let answered = false;
    const fail = (msg: string) => patch(id, (x) => ({ ...x, a: msg, pending: false, error: true }));
    try {
      await api.askAcross(
        playerId,
        { question, language },
        (ev) => {
          if (ev.event === "step") {
            const label = STEP_LABELS[ev.data.tool] ?? `Using ${ev.data.tool}`;
            patch(id, (x) => ({ ...x, steps: [...x.steps, label] }));
          } else if (ev.event === "answer") {
            answered = true;
            patch(id, (x) => ({
              ...x,
              a: ev.data.answer,
              pending: false,
              source: ev.data.source,
              verified: ev.data.verified,
              matches: ev.data.matches ?? {},
            }));
          } else {
            answered = true;
            fail(ev.data.detail);
          }
        },
        ctl.signal,
      );
      if (!answered) fail("The coach stopped before answering.");
    } catch (e) {
      if (!ctl.signal.aborted) fail(e instanceof Error ? e.message : "The coach did not answer.");
    } finally {
      aborts.current.delete(id);
    }
  }

  function stop(id: number) {
    aborts.current.get(id)?.abort();
    patch(id, (x) => ({ ...x, a: "Answer stopped.", pending: false, error: true }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  const asked = new Set(turns.map((x) => x.q));
  const open = SUGGESTIONS.filter((q) => !asked.has(q));

  return (
    <main className={`main page-coach edge-scroll${tab === "knowledge" ? " wide" : ""}`} id="content">
      <header className="page-h">
        <div>
          <h1>Coach</h1>
          <p className="lede">
            {tab === "knowledge"
              ? "What the coach reads before it answers: map notes and Liquipedia, by callout."
              : tab === "plan"
                ? "What to practise next, from the mistakes that keep coming back across your matches."
                : "Ask about your play across every match you have reviewed. Answers cite the moments they come from, and each citation opens that match."}
          </p>
        </div>
        <label className="lang-pick">
          <span className="sr-only">Coach language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as CoachLanguage)}>
            {COACH_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="subtabs" aria-label="Coach">
        <PillBubble value={tab} />
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setTab(t.id);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {tab === "knowledge" ? (
        <KnowledgeTab admin={admin} />
      ) : loadError ? (
        <div className="sheet state-sheet"><p role="alert">Your reviewed players could not be loaded.</p>
          <button className="btn btn-line" onClick={retry}>Try again</button>
        </div>
      ) : players === null ? (
        <LoadingState label="Loading reviewed players…" />
      ) : players.length === 0 ? (
        <div className="empty">
          <p>No reviewed matches yet. Add a match and pick a player, and the coach can compare your matches here.</p>
          <Link className="btn btn-fill" href="/upload">
            Add match
          </Link>
        </div>
      ) : (
        <>
          <ModelNotice />
          <div className="coach-who">
            {players.length > 1 ? (
              <label className="who-pick">
                <span>Coaching</span>
                <select value={playerId ?? ""} onChange={(e) => pickPlayer(e.target.value)}>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="who-one">
                Coaching <b>{player?.name}</b>
              </p>
            )}
            {player ? (
              <p className="who-facts">
                <span className="num">{player.matches}</span> {player.matches === 1 ? "match" : "matches"}
                {player.maps.length ? <> on {player.maps.join(" and ")}</> : null}
              </p>
            ) : null}
          </div>

          {tab === "plan" && playerId ? (
            <PlanTab playerId={playerId} language={language} />
          ) : (
          <>
          <section className="page-thread" aria-live="polite" aria-label="Questions and answers">
            {turns.length ? null : (
              <p className="thread-empty">
                Questions collect here. With one match the coach can only compare rounds; habits show from the
                second match on.
              </p>
            )}
            {turns.map((x) => (
              <div className="qa" key={x.id}>
                <div className="qq">{x.q}</div>
                <div className={`aa${x.error ? " err" : ""}`}>
                  {x.pending ? (
                    <span className="thinking">{x.steps.length ? `${x.steps[x.steps.length - 1]}…` : "Thinking…"}</span>
                  ) : x.error ? (
                    <><p role="alert">{x.a}</p><button className="btn btn-line" onClick={() => void ask(x.q)}>Ask again</button></>
                  ) : (
                    <CoachText
                      text={x.a}
                      matchFindingHref={(ref, fid) =>
                        x.matches[ref] ? `/studio/${x.matches[ref]}?f=${encodeURIComponent(fid)}` : undefined
                      }
                    />
                  )}
                </div>
                {x.pending && <button type="button" className="btn btn-line" onClick={() => stop(x.id)}>Stop</button>}
                {!x.pending && x.source && <p className="aa-note">
                  {x.source === "template" ? "Written from the finding templates." : x.verified ? "Model answer, checked against the findings." : "Written by the coach model."}
                </p>}
              </div>
            ))}
          </section>

          <div className="page-ask">
            {open.length ? (
              <ul className="qs" aria-label="Suggested questions">
                {open.map((q) => (
                  <li key={q}>
                    <button type="button" className="q" onClick={() => void ask(q)}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="ask-row" onSubmit={onSubmit}>
              <div className="ask-field">
                <label className="sr-only" htmlFor="coach-page-ask">
                  Question about your matches
                </label>
                <input
                  ref={inputRef}
                  className="field"
                  id="coach-page-ask"
                  placeholder="Ask about your habits across matches"
                  autoComplete="off"
                  aria-keyshortcuts="/"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="submit"
                  className="ask-send"
                  aria-label="Send question"
                  title="Send question"
                  disabled={!draft.trim() || !playerId}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 13V3m-5 5 5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
          </>
          )}
        </>
      )}
    </main>
  );
}
