"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { STEP_LABELS } from "@/components/coach/CoachPanel";
import { CoachText } from "@/components/coach/CoachText";
import { api } from "@/lib/api/client";
import { COACH_LANGUAGES, useCoachLanguage } from "@/lib/coach/language";
import type { CoachLanguage, CoachedPlayer } from "@/lib/contracts";

const PLAYER_KEY = "rr.coachPlayer";

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
  /** Cited match refs ("M2") to match ids, from the answer event. */
  matches: Record<string, string>;
};

/** Coach page, Ask: questions across every analysed match of one player (doc 29 §2.1, R06). */
export default function CoachPage() {
  const [players, setPlayers] = useState<CoachedPlayer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [language, setLanguage] = useCoachLanguage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const aborts = useRef(new Set<AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getPlayers()
      .then((ps) => {
        setPlayers(ps);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(PLAYER_KEY);
        } catch {
          /* storage blocked */
        }
        setPlayerId(ps.find((p) => p.id === saved)?.id ?? ps[0]?.id ?? null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "The API did not answer."));
    const live = aborts.current;
    return () => live.forEach((c) => c.abort());
  }, []);

  function pickPlayer(id: string) {
    setPlayerId(id);
    setTurns([]);
    try {
      window.localStorage.setItem(PLAYER_KEY, id);
    } catch {
      /* storage blocked */
    }
  }

  const patch = (id: number, f: (x: Turn) => Turn) => setTurns((ts) => ts.map((x) => (x.id === id ? f(x) : x)));

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || !playerId) return;
    setDraft("");
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, q: question, a: "", pending: true, steps: [], matches: {} }]);
    const ctl = new AbortController();
    aborts.current.add(ctl);
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
      aborts.current.delete(ctl);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  const player = players?.find((p) => p.id === playerId) ?? null;
  const asked = new Set(turns.map((x) => x.q));
  const open = SUGGESTIONS.filter((q) => !asked.has(q));

  return (
    <main className="main page-coach" id="content">
      <header className="page-h">
        <div>
          <h1>Coach</h1>
          <p className="lede">
            Ask about your play across every match you have reviewed. Answers cite the moments they come from, and
            each citation opens that match.
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

      {loadError ? (
        <p className="err" role="alert">
          Could not load your players: {loadError}. Check that the API is running on port 8000.
        </p>
      ) : players === null ? (
        <p className="meta">Loading players…</p>
      ) : players.length === 0 ? (
        <div className="empty">
          <p>No reviewed matches yet. Add a match and pick a player, and the coach can compare your matches here.</p>
          <Link className="btn btn-fill" href="/upload">
            Add match
          </Link>
        </div>
      ) : (
        <>
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
                    x.a
                  ) : (
                    <CoachText
                      text={x.a}
                      matchFindingHref={(ref, fid) =>
                        x.matches[ref] ? `/studio/${x.matches[ref]}?f=${encodeURIComponent(fid)}` : undefined
                      }
                    />
                  )}
                </div>
                {!x.pending && x.source === "template" ? (
                  <div className="aa-note">
                    Written from the findings: the coach model is off or its answer did not pass the checks.
                  </div>
                ) : null}
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
              <p className="ask-ctx">
                <span aria-hidden>{player?.name ?? "Player"}</span>
                <span aria-hidden>
                  {player?.matches ?? 0} {player?.matches === 1 ? "match" : "matches"}
                </span>
                <span aria-hidden>{COACH_LANGUAGES.find((l) => l.id === language)?.label}</span>
              </p>
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
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="ask-send" disabled={!draft.trim() || !playerId}>
                  Ask
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
