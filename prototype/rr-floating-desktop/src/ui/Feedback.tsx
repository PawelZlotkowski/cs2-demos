import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

type Verdict = 'useful' | 'not_right';

// One fetch per match, shared by every explanation and answer in the Studio
const cache = new Map<string, Promise<Map<string, Verdict>>>();

function verdicts(matchId: string): Promise<Map<string, Verdict>> {
  let p = cache.get(matchId);
  if (!p) {
    p = api
      .getFeedback(matchId)
      .then((rows) => new Map(rows.map((r) => [`${r.kind}:${r.target}`, r.verdict as Verdict])))
      .catch(() => new Map<string, Verdict>());
    cache.set(matchId, p);
  }
  return p;
}

const ThumbUp = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <path d="M5 7.2V14H2.6V7.2zM5 7.2l2.6-4.7c.9 0 1.6.8 1.4 1.7L8.6 6.4h3.7a1.3 1.3 0 0 1 1.3 1.6l-1.1 4.9a1.3 1.3 0 0 1-1.3 1.1H5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

/**
 * "Useful" or "Not right" under a coach explanation or answer (A10), as a small pair of toggle
 * buttons. It feeds the Lab's evaluation and the fine-tune review; "Not right" asks what was wrong.
 */
export function Feedback({ matchId, target, kind = 'explanation' }: { matchId: string; target: string; kind?: 'explanation' | 'answer' }) {
  const key = `${kind}:${target}`;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let live = true;
    setVerdict(null);
    setAsking(false);
    setSent(false);
    setNote('');
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
      <span className="feedback-q">Was this right?</span>
      <button type="button" className="fb-btn" aria-pressed={verdict === 'useful'} onClick={() => void send('useful')}>
        <ThumbUp />
        Useful
      </button>
      <button
        type="button"
        className="fb-btn"
        aria-pressed={verdict === 'not_right'}
        onClick={() => {
          void send('not_right');
          setAsking(true);
        }}
      >
        <span className="fb-down">
          <ThumbUp />
        </span>
        Not right
      </button>
      {asking ? (
        <form
          className="feedback-note"
          onSubmit={(e) => {
            e.preventDefault();
            void send('not_right', note.trim());
            setAsking(false);
          }}
        >
          <input className="field" aria-label="What was wrong?" placeholder="What was wrong? (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="btn small">
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
