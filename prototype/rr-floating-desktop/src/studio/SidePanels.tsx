import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ROUND_SUGGESTIONS } from '../mock/coach';
import { eventTitle, isTeam, typeLabel } from '../mock/replay';
import { DEATH_TEMPLATES, YOU, adviceFor, kFor, sideOf } from '../mock/world';
import { useStore } from '../state/store';
import { CoachText } from '../ui/CoachText';
import { clock } from '../ui/time';
import type { PanelCtx } from './AnalysisPanel';

type Turn = { id: number; q: string; a: string; pending: boolean; step: string };

const STEPS = ['Reading the round timeline', 'Checking the round stats', 'Searching the map notes'];

function answerRound(ctx: PanelCtx, q: string): string {
  const r = ctx.round;
  const death = r.findings.filter((f) => DEATH_TEMPLATES.has(f.template)).sort((a, b) => b.t - a.t)[0];
  const main = ctx.headFinding ?? death ?? r.findings[0];
  const k = main ? kFor(ctx.match.map, main.zone, sideOf(r.number)) : undefined;
  const cite = k ? ` [${k}]` : '';
  const s = q.toLowerCase();
  if (s.includes('trade')) {
    if (r.stats.survived) return `You survived round ${r.number}, so there was nothing to trade.`;
    return r.stats.deathTraded
      ? `Yes. You died at [t:${r.deaths[YOU].toFixed(1)}] and your killer died within 5 seconds.`
      : `No. You died at [t:${r.deaths[YOU].toFixed(1)}]${death ? ` [${death.id}]` : ''} and nobody on your team was close enough to trade.${cite}`;
  }
  if (s.includes('die') || s.includes('death')) {
    if (r.stats.survived) return `You did not die in round ${r.number}. You were alive at the end, [t:${r.duration.toFixed(1)}].`;
    const by = r.events.find((e) => e.type === 'kill' && e.victim === YOU);
    return `${death ? `${death.summary} [${death.id}]` : `You died at [t:${r.deaths[YOU].toFixed(1)}].`} ${by ? `${by.actor} got the kill with the ${by.weapon}.` : ''} ${death ? adviceFor(death.template) : ''}${cite}`;
  }
  if (main) return `${adviceFor(main.template)} In this round that was ${main.zone} at [t:${main.t.toFixed(1)}] [${main.id}].${cite}`;
  return `Round ${r.number} had no finding for you. You had ${r.stats.kills} kills and ${r.stats.utilityThrown} grenades thrown; the round was ${r.won ? 'won' : 'lost'}.`;
}

export function AskPanel({ ctx }: { ctx: PanelCtx }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const next = useRef(1);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function ask(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setDraft('');
    const id = next.current++;
    setTurns((ts) => [...ts, { id, q, a: '', pending: true, step: STEPS[0] }]);
    STEPS.forEach((st, i) => timers.current.push(window.setTimeout(() => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, step: st } : x))), i * 500)));
    const a = answerRound(ctx, q);
    timers.current.push(window.setTimeout(() => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, a, pending: false } : x))), STEPS.length * 500 + 200));
  }

  const asked = new Set(turns.map((x) => x.q));

  return (
    <div className="ask-tab">
      <div className="thread" aria-live="polite">
        {turns.length === 0 ? <p className="thread-empty">Ask about round {ctx.round.number}. Answers cite the findings, times and map notes they use.</p> : null}
        {turns.map((x) => (
          <div className="qa" key={x.id}>
            <div className="qq">{x.q}</div>
            <div className="aa">{x.pending ? <span className="meta thinking">{x.step}</span> : <CoachText text={x.a} {...ctx.cites} />}</div>
          </div>
        ))}
      </div>
      <div className="ask-foot">
        <p className="coach-h">Ask about this round</p>
        <p className="knows">
          The coach knows round {ctx.round.number} for {YOU}: its {ctx.round.findings.length} findings, the round stats, the timeline and the map notes.
        </p>
        <ul className="qs">
          {ROUND_SUGGESTIONS.filter((q) => !asked.has(q)).map((q) => (
            <li key={q}>
              <button type="button" className="q" onClick={() => ask(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="ask-field"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            ask(draft);
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

export function RoundPanel({ ctx }: { ctx: PanelCtx }) {
  const r = ctx.round;
  const s = r.stats;
  const duels = r.events.filter((e) => e.type === 'kill' && (e.actor === YOU || e.victim === YOU));
  const thrown = r.events.filter((e) => UTIL.has(e.type) && e.actor === YOU);
  const economy = r.findings.filter((f) => f.template.startsWith('economy_mismatch'));
  const facts: [string, string][] = [
    ['Result', s.won ? 'Won' : 'Lost'],
    ['Side', s.side],
    ['K / D / A', `${s.kills} / ${s.deaths} / ${s.assists}`],
    ['Damage', String(s.damage)],
    ['Utility damage', String(s.utilityDamage)],
    ['Enemies flashed', String(s.enemiesFlashed)],
    ['Teammates flashed', String(s.teammatesFlashed)],
    ['Opening duel', s.openingKill ? 'Won it' : s.openingDeath ? 'Lost it' : 'Not in it'],
    ['Trade kills', String(s.tradeKills)],
    ['Survived', s.survived ? 'Yes' : `No, after ${clock(s.timeAliveS ?? 0)}${s.deathTraded ? ', traded' : s.deathTraded === false ? ', not traded' : ''}`],
    ['Money at start', `$${s.moneyStart.toLocaleString('en-GB')}`],
    ['Equipment value', `$${s.equipValue.toLocaleString('en-GB')}`],
  ];
  return (
    <div className="round-tab">
      <h2 className="ins-head">
        Round {r.number} for {YOU}
      </h2>
      <dl className="round-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="round-h">Duels</h3>
      {duels.length ? (
        <ul className="round-list">
          {duels.map((e) => {
            const won = e.actor === YOU;
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
        <p className="meta">No kills or deaths for {YOU} this round.</p>
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
        <p className="meta">No grenades thrown this round.</p>
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

type Answer = { kind: 'loading' } | { kind: 'done'; text: string };

export function NotesPanel({ ctx, t }: { ctx: PanelCtx; t: number }) {
  const s = useStore();
  const notes = s.notes[ctx.match.id] ?? [];
  const [draft, setDraft] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  function explain(round: number, at: number): string {
    const r = ctx.rounds[round - 1];
    const near = r.events.filter((e) => Math.abs(e.t - at) <= 5);
    const fs = r.findings.filter((f) => Math.abs(f.t - at) <= 5);
    const alive = near.filter((e) => e.type === 'kill');
    const bits = [
      fs.length ? `${fs[0].summary} [${fs[0].id}]` : null,
      near.length
        ? `In the 10 seconds around [t:${at.toFixed(1)}]: ${near
            .slice(0, 3)
            .map((e) => `${eventTitle(e).replace(/^kestrel/, 'you')} at [t:${e.t.toFixed(1)}]`)
            .join('; ')}.`
        : `Nothing happened near you in the 10 seconds around [t:${at.toFixed(1)}].`,
      alive.some((e) => isTeam(e.victim!)) ? 'Your team lost a player in that window.' : null,
      fs.length ? adviceFor(fs[0].template) : null,
    ];
    return bits.filter(Boolean).join(' ');
  }

  function ask(id: string, round: number, at: number) {
    setAnswers((a) => ({ ...a, [id]: { kind: 'loading' } }));
    window.setTimeout(() => setAnswers((a) => ({ ...a, [id]: { kind: 'done', text: explain(round, at) } })), 1100);
  }

  return (
    <div className="round-tab">
      <h2 className="ins-head">Notes on this match</h2>
      <form
        className="note-add"
        onSubmit={(e) => {
          e.preventDefault();
          const note = draft.trim();
          if (!note) return;
          s.setNotes(ctx.match.id, (n) =>
            [...n, { id: `n${Date.now().toString(36)}`, round: ctx.round.number, t: Math.round(t * 10) / 10, note }].sort((a, b) => a.round - b.round || a.t - b.t),
          );
          setDraft('');
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
      {notes.length === 0 ? (
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
                  <button type="button" className="link" disabled={a?.kind === 'loading'} onClick={() => ask(b.id, b.round, b.t)}>
                    Ask about this
                  </button>
                  <button type="button" className="link" onClick={() => s.setNotes(ctx.match.id, (n) => n.filter((x) => x.id !== b.id))}>
                    Delete
                  </button>
                </div>
                {a?.kind === 'loading' ? (
                  <p className="meta thinking">
                    Explaining the 10 seconds around this note for {YOU}
                  </p>
                ) : a?.kind === 'done' ? (
                  <>
                    <p className="expl">
                      <CoachText text={a.text} {...ctx.cites} />
                    </p>
                    <p className="expl-note">Written from the findings and the timeline, checked by the verifier.</p>
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
