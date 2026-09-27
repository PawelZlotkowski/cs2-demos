"use client";

import { useEffect, useState } from "react";
import { CoachText, type CiteHandlers } from "@/components/coach/CoachText";
import { sourceNote } from "@/components/coach/CoachExplanation";
import { api } from "@/lib/api/client";
import type { Bookmark, CoachLanguage, MomentExplanation } from "@/lib/contracts";
import { formatClock } from "@/lib/replay/time";

type Props = CiteHandlers & {
  matchId: string;
  /** The analysed player; without one a note can be kept but not asked about. */
  playerId: string | null;
  playerName: string;
  round: number;
  t: number;
  language: CoachLanguage;
  /** Open the note's round (if needed) and seek to its time. */
  onOpen: (round: number, t: number) => void;
};

type Answer = { kind: "loading" } | { kind: "done"; data: MomentExplanation } | { kind: "error"; message: string };

/** Studio Notes tab: notes on a time in a round, and "Ask about this" on the window around it (doc 29 §3.2, R08). */
export function NotesPanel({ matchId, playerId, playerName, round, t, language, onOpen, ...cites }: Props) {
  const [notes, setNotes] = useState<Bookmark[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    let live = true;
    api
      .getBookmarks(matchId)
      .then((b) => live && setNotes(b))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Unable to load the notes."));
    return () => {
      live = false;
    };
  }, [matchId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const note = draft.trim();
    if (!note) return;
    setError(null);
    try {
      const saved = await api.addBookmark(matchId, { round, t: Math.round(t * 10) / 10, note });
      setNotes((n) => [...(n ?? []), saved].sort((a, b) => a.round - b.round || a.t - b.t));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save the note.");
    }
  }

  async function remove(id: string) {
    await api.deleteBookmark(matchId, id).catch(() => undefined);
    setNotes((n) => (n ?? []).filter((b) => b.id !== id));
  }

  async function ask(b: Bookmark) {
    if (!playerId) return;
    setAnswers((a) => ({ ...a, [b.id]: { kind: "loading" } }));
    try {
      const data = await api.explainBookmark(matchId, playerId, b.id, language);
      setAnswers((a) => ({ ...a, [b.id]: { kind: "done", data } }));
    } catch (err) {
      setAnswers((a) => ({
        ...a,
        [b.id]: { kind: "error", message: err instanceof Error ? err.message : "The coach did not answer." },
      }));
    }
  }

  return (
    <div className="round-tab" role="tabpanel" id="notes-tab" aria-labelledby="tab-notes">
      <h2 className="ins-head">Notes on this match</h2>
      <form className="note-add" onSubmit={add}>
        <label htmlFor="note-text">
          Note at round {round}, <span className="num">{formatClock(t)}</span>
        </label>
        <textarea
          id="note-text"
          rows={2}
          maxLength={500}
          value={draft}
          placeholder="What do you want to remember or ask about here?"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-line" disabled={!draft.trim()}>
          Save note
        </button>
      </form>
      {error ? <p className="meta err">{error}</p> : null}

      {notes === null ? (
        <p className="meta">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="meta">No notes yet. Pause where something happened and write down what you want to check.</p>
      ) : (
        <ul className="note-list">
          {notes.map((b) => {
            const answer = answers[b.id];
            return (
              <li key={b.id}>
                <button type="button" className="note-at" onClick={() => onOpen(b.round, b.t)}>
                  <span className="num t">
                    R{b.round} {formatClock(b.t)}
                  </span>
                  <span className="note-text">{b.note}</span>
                </button>
                <div className="note-actions">
                  {playerId ? (
                    <button type="button" className="link" onClick={() => ask(b)} disabled={answer?.kind === "loading"}>
                      Ask about this
                    </button>
                  ) : null}
                  <button type="button" className="link" onClick={() => remove(b.id)}>
                    Delete
                  </button>
                </div>
                {answer?.kind === "loading" ? (
                  <p className="meta thinking">Explaining the 10 seconds around this note for {playerName}…</p>
                ) : answer?.kind === "error" ? (
                  <p className="meta err">{answer.message}</p>
                ) : answer?.kind === "done" ? (
                  <>
                    <p className="expl">
                      <CoachText text={answer.data.text} {...cites} />
                    </p>
                    <p className="expl-note">{sourceNote(answer.data)}</p>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
