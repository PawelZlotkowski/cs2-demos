"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Verdict = "useful" | "not_right";

// One fetch per match, shared by every explanation and answer on the page
const cache = new Map<string, Promise<Map<string, Verdict>>>();

function verdicts(matchId: string): Promise<Map<string, Verdict>> {
  let p = cache.get(matchId);
  if (!p) {
    p = api
      .getFeedback(matchId)
      .then((rows) => new Map(rows.map((r) => [`${r.kind}:${r.target}`, r.verdict as Verdict])))
      .catch(() => new Map());
    cache.set(matchId, p);
  }
  return p;
}

/**
 * "Useful" or "Not right" under a coach explanation or answer (A10). It feeds the Lab's
 * evaluation and the fine-tune dataset review; "Not right" can say what was wrong.
 */
export function Feedback({ matchId, target, kind = "explanation" }: { matchId: string; target: string; kind?: "explanation" | "answer" }) {
  const key = `${kind}:${target}`;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let live = true;
    setVerdict(null);
    setAsking(false);
    setSent(false);
    void verdicts(matchId).then((m) => live && setVerdict(m.get(key) ?? null));
    return () => {
      live = false;
    };
  }, [matchId, key]);

  async function send(v: Verdict, text?: string) {
    setVerdict(v);
    try {
      await api.giveFeedback(matchId, { target, kind, verdict: v, note: text || undefined });
      void verdicts(matchId).then((m) => m.set(key, v));
      setSent(true);
    } catch {
      setSent(false);
    }
  }

  return (
    <div className="feedback" role="group" aria-label="Was this right?">
      <button type="button" className="link small" aria-pressed={verdict === "useful"} onClick={() => void send("useful")}>
        Useful
      </button>
      <button
        type="button"
        className="link small"
        aria-pressed={verdict === "not_right"}
        onClick={() => {
          void send("not_right");
          setAsking(true);
        }}
      >
        Not right
      </button>
      {asking ? (
        <form
          className="feedback-note"
          onSubmit={(e) => {
            e.preventDefault();
            void send("not_right", note.trim());
            setAsking(false);
          }}
        >
          <label className="sr-only" htmlFor={`fb-${key}`}>
            What was wrong?
          </label>
          <input
            id={`fb-${key}`}
            className="input small"
            placeholder="What was wrong? (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" className="link small">
            Send
          </button>
        </form>
      ) : sent ? (
        <span className="meta" role="status">
          Thanks
        </span>
      ) : null}
    </div>
  );
}
