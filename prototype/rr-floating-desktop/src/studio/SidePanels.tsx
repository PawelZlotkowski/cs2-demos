import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api/client';
import type { AskEvent, Bookmark, MomentExplanation } from '@/lib/contracts';
import { errorText, typeLabel } from '../data/model';
import { useStore } from '../state/store';
import { CoachText } from '../ui/CoachText';
import { clock } from '../ui/time';
import type { PanelCtx } from './AnalysisPanel';

export const ROUND_SUGGESTIONS = ['Why did I die here?', 'What should I have done instead?', 'Did my team trade me?'];

const TOOL_STEP: Record<string, string> = {
  list_rounds: 'Listing the rounds',
  get_round_stats: 'Checking the round stats',
  get_match_totals: 'Adding up the match',
  list_findings: 'Reading the findings',
  get_finding: 'Reading a finding',
  get_round_timeline: 'Reading the round timeline',
  get_player_state: 'Checking where everyone was',
  get_player_history: 'Looking at your other matches',
  search_knowledge: 'Searching the map notes',
  list_matches: 'Listing your matches',
  find_moments: 'Finding moments across matches',
};

export function stepLabel(tool: string) {
  return TOOL_STEP[tool] ?? tool.replace(/_/g, ' ');
}

type Turn = {
  id: number;
  q: string;
  a: string;
  pending: boolean;
  step: string;
  source?: 'agent' | 'template';
  error?: string;
  matches?: Record<string, string>;
};

/** Stream one question to the coach; returns the finished turn's fields. */
export async function streamTurn(
  run: (onEvent: (e: AskEvent) => void, signal: AbortSignal) => Promise<void>,
  onStep: (step: string) => void,
  signal: AbortSignal,
): Promise<Pick<Turn, 'a' | 'source' | 'error' | 'matches'>> {
  let out: Pick<Turn, 'a' | 'source' | 'error' | 'matches'> = { a: '', error: 'The coach did not answer.' };
  try {
    await run((e) => {
      if (e.event === 'step') onStep(stepLabel(e.data.tool));
      else if (e.event === 'answer') out = { a: e.data.answer, source: e.data.source, matches: e.data.matches };
      else if (e.event === 'error') out = { a: '', error: e.data.detail };
    }, signal);
  } catch (e) {
    out = { a: '', error: errorText(e) };
  }
  return out;
}

export function AskPanel({ ctx, t, view }: { ctx: PanelCtx; t: number; view: 'gameplay' | 'radar' }) {
  const s = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const next = useRef(1);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setDraft('');
    const id = next.current++;
    setTurns((ts) => [...ts, { id, q, a: '', pending: true, step: 'Thinking' }]);
    const ctl = new AbortController();
    abort.current = ctl;
    const body = { question: q, language: s.language, round: ctx.round.number, t: Math.round(t * 10) / 10, momentId: ctx.moment?.id ?? null, view };
    const done = await streamTurn(
      (on, signal) => api.ask(ctx.match.id, ctx.data.playerId, body, on, signal),
      (step) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, step } : x))),
      ctl.signal,
    );
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...done, pending: false } : x)));
  }

  const asked = new Set(turns.map((x) => x.q));

  return (
    <div className="ask-tab">
      <div className="thread" aria-live="polite">
        {turns.length === 0 ? <p className="thread-empty">Ask about round {ctx.round.number}. Answers cite the findings, times and map notes they use.</p> : null}
        {turns.map((x) => (
          <div className="qa" key={x.id}>
            <div className="qq">{x.q}</div>
            <div className="aa">
              {x.pending ? <span className="meta thinking">{x.step}</span> : x.error ? <span className="err">{x.error}</span> : <CoachText text={x.a} {...ctx.cites} />}
            </div>
            {!x.pending && x.source === 'template' ? <div className="aa-note">Written from the findings: the coach model was off or its answer did not pass the checks.</div> : null}
          </div>
        ))}
      </div>
      <div className="ask-foot">
        <p className="coach-h">Ask about this round</p>
        <p className="knows">
          The coach knows round {ctx.round.number} for {ctx.you}: its {ctx.round.findings.length} findings, the round stats, the timeline and the map notes.
        </p>
        <ul className="qs">
          {ROUND_SUGGESTIONS.filter((q) => !asked.has(q)).map((q) => (
            <li key={q}>
              <button type="button" className="q" onClick={() => void ask(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="ask-field"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <input className="field" placeholder={`Ask about round ${ctx.round.number}`} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Question about this round" />
          <button type="submit" className="btn" disabled={!draft.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

const UTIL = new Set(['smoke', 'flash', 'he', 'molotov']);

function money(v: number | null | undefined) {
  return v == null ? '–' : `$${v.toLocaleString('en-GB')}`;
}

export function RoundPanel({ ctx }: { ctx: PanelCtx }) {
  const r = ctx.round;
  const s = r.stats;
  const you = ctx.you;
  const duels = r.events.filter((e) => e.type === 'kill' && (e.actor === you || e.victim === you));
  const thrown = r.events.filter((e) => UTIL.has(e.type) && e.actor === you);
  const economy = r.findings.filter((f) => f.template.startsWith('economy_mismatch'));
  const facts: [string, string][] = s
    ? [
        ['Result', s.won == null ? '–' : s.won ? 'Won' : 'Lost'],
        ['Side', s.side ?? '–'],
        ['K / D / A', `${s.kills} / ${s.deaths} / ${s.assists}`],
        ['Damage', String(s.damage)],
        ['Utility damage', String(s.utilityDamage)],
        ['Enemies flashed', String(s.enemiesFlashed)],
        ['Teammates flashed', String(s.teammatesFlashed)],
        ['Opening duel', s.openingKill ? 'Won it' : s.openingDeath ? 'Lost it' : 'Not in it'],
        ['Trade kills', String(s.tradeKills)],
        ['Survived', s.survived ? 'Yes' : `No, after ${clock(s.timeAliveS ?? 0)}${s.deathTraded ? ', traded' : s.deathTraded === false ? ', not traded' : ''}`],
        ['Money at start', money(s.moneyStart)],
        ['Equipment value', money(s.equipValue)],
      ]
    : [];
  return (
    <div className="round-tab">
      <h2 className="ins-head">
        Round {r.number} for {you}
      </h2>
      {facts.length ? (
        <dl className="round-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="meta">No round stats for {you} in this round.</p>
      )}
      <h3 className="round-h">Duels</h3>
      {!r.loaded ? (
        <p className="meta thinking">Loading the round</p>
      ) : duels.length ? (
        <ul className="round-list">
          {duels.map((e) => {
            const won = e.actor === you;
            return (
              <li key={e.id}>
                <button type="button" onClick={() => ctx.onSeek(e.t, e.id)}>
                  <span className="num t">{clock(e.t)}</span>
                  <span className={won ? 'duel-won' : 'duel-lost'}>{won ? 'Won' : 'Lost'}</span>
                  <span className="round-what">
                    {won ? 'Killed' : 'Killed by'} {won ? e.victim : e.actor}
                  </span>
                  <span className="meta">{e.weapon}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="meta">No kills or deaths for {you} this round.</p>
      )}
      <h3 className="round-h">Utility thrown</h3>
      {thrown.length ? (
        <ul className="round-list">
          {thrown.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => ctx.onSeek(e.t, e.id)}>
                <span className="num t">{clock(e.t)}</span>
                <span className="round-what">{typeLabel(e.type)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">{r.loaded ? 'No grenades thrown this round.' : ''}</p>
      )}
      {economy.length ? (
        <>
          <h3 className="round-h">Buy</h3>
          {economy.map((f) => (
            <p key={f.id} className="round-note">
              {f.summary}
            </p>
          ))}
        </>
      ) : null}
      <p className="meta small">Facts from the parse and RoundStats; no model involved.</p>
    </div>
  );
}

type Answer = { kind: 'loading' } | { kind: 'done'; e: MomentExplanation } | { kind: 'error'; text: string };

export function NotesPanel({ ctx, t }: { ctx: PanelCtx; t: number }) {
  const s = useStore();
  const [notes, setNotes] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    api
      .getBookmarks(ctx.match.id)
      .then(setNotes)
      .catch((e) => setError(errorText(e)));
  }, [ctx.match.id]);

  async function save() {
    const note = draft.trim();
    if (!note) return;
    try {
      const b = await api.addBookmark(ctx.match.id, { round: ctx.round.number, t: Math.round(t * 10) / 10, note });
      setNotes((n) => [...(n ?? []), b].sort((a, c) => a.round - c.round || a.t - c.t));
      setDraft('');
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteBookmark(ctx.match.id, id);
      setNotes((n) => (n ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function ask(id: string) {
    setAnswers((a) => ({ ...a, [id]: { kind: 'loading' } }));
    try {
      const e = await api.explainBookmark(ctx.match.id, ctx.data.playerId, id, s.language);
      setAnswers((a) => ({ ...a, [id]: { kind: 'done', e } }));
    } catch (e) {
      setAnswers((a) => ({ ...a, [id]: { kind: 'error', text: errorText(e) } }));
    }
  }

  return (
    <div className="round-tab">
      <h2 className="ins-head">Notes on this match</h2>
      <form
        className="note-add"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="note-text">
          Note at round {ctx.round.number}, <span className="num">{clock(t)}</span>
        </label>
        <textarea id="note-text" className="field" rows={2} maxLength={500} value={draft} placeholder="What do you want to remember or ask about here?" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          Save note
        </button>
      </form>
      {error ? <p className="err">{error}</p> : null}
      {notes == null ? (
        error ? null : <p className="meta thinking">Loading notes</p>
      ) : notes.length === 0 ? (
        <p className="meta">No notes yet. Pause where something happened and write down what you want to check.</p>
      ) : (
        <ul className="note-list">
          {notes.map((b) => {
            const a = answers[b.id];
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className="note-at"
                  onClick={() => {
                    ctx.selectRound(b.round);
                    window.setTimeout(() => ctx.onSeek(b.t), 0);
                  }}
                >
                  <span className="num t">
                    R{b.round} {clock(b.t)}
                  </span>
                  <span className="note-text">{b.note}</span>
                </button>
                <div className="note-actions">
                  <button type="button" className="link" disabled={a?.kind === 'loading'} onClick={() => void ask(b.id)}>
                    Ask about this
                  </button>
                  <button type="button" className="link" onClick={() => void remove(b.id)}>
                    Delete
                  </button>
                </div>
                {a?.kind === 'loading' ? (
                  <p className="meta thinking">Explaining the 10 seconds around this note for {ctx.you}</p>
                ) : a?.kind === 'error' ? (
                  <p className="err">{a.text}</p>
                ) : a?.kind === 'done' ? (
                  <>
                    <p className="expl">
                      <CoachText text={a.e.text} {...ctx.cites} />
                    </p>
                    <p className="expl-note">
                      {a.e.source === 'agent' ? `Written by ${a.e.model ?? 'the coach model'} and checked by the verifier.` : 'Written from the findings and the timeline.'}
                    </p>
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
