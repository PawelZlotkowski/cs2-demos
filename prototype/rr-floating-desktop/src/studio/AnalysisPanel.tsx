import { useEffect, useState } from 'react';
import { COACH_LANGUAGES } from '../mock/coach';
import { eventTitle, typeLabel, type ReplayEvent, type RoundData } from '../mock/replay';
import {
  DRILLS,
  FINDINGS,
  SERVED_MODEL,
  YOU,
  detectorOf,
  explanation,
  findingLabel,
  mapName,
  sideOf,
  summary,
  type Finding,
  type Match,
  type Moment,
} from '../mock/world';
import { useStore } from '../state/store';
import { CoachText, type CiteHandlers } from '../ui/CoachText';
import { clock } from '../ui/time';
import type { Review } from './Rail';

export type PanelCtx = {
  match: Match;
  moments: Moment[];
  findings: Finding[];
  round: RoundData;
  rounds: RoundData[];
  review: Review;
  moment: Moment | null;
  headFinding: Finding | null;
  selectedEvent: ReplayEvent | null;
  seenMoments: Set<string>;
  seenRounds: Set<number>;
  cites: CiteHandlers;
  selectMoment: (m: Moment) => void;
  selectRound: (n: number) => void;
  setReview: (r: 'overview' | 'wrapup') => void;
  onSeek: (t: number, eventId?: string) => void;
};

function CoachBlock({ children, note }: { children: React.ReactNode; note: string }) {
  const s = useStore();
  return (
    <section className="layer coach-expl" aria-live="polite">
      <div className="coach-expl-h">
        <h3>Coach</h3>
        <select className="select" aria-label="Coach language" value={s.language} onChange={(e) => s.setLanguage(e.target.value as typeof s.language)}>
          {COACH_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {children}
      <p className="expl-note">
        {note}
        {s.language !== 'en' ? ` The prototype shows English; the model writes in ${COACH_LANGUAGES.find((l) => l.id === s.language)?.label}.` : ''}
        {s.lab ? (
          <>
            {' '}
            <button type="button" className="link" onClick={() => s.open('lab')}>
              How this was written
            </button>
          </>
        ) : null}
      </p>
    </section>
  );
}

function sourceNote(match: Match, m: Moment | null) {
  if (!match.model || m?.source === 'ranker') return 'Written from the findings: the coach model was off for this review.';
  return `Written by ${match.model} and checked against the findings.`;
}

function DoneWell({ ctx, finding }: { ctx: PanelCtx; finding: Finding }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setOpen(false);
    setReady(false);
  }, [finding.id]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setReady(true), 650);
    return () => window.clearTimeout(t);
  }, [open]);

  if (finding.kind !== 'mistake') return null;
  const done = s.matches.filter((m) => m.status === 'complete' && m.map === ctx.match.map);
  const all = done.flatMap((m) => (FINDINGS[m.id] ?? []).filter((f) => f.kind === 'strength').map((f) => ({ f, m })));
  const same = all.filter((x) => x.f.zone === finding.zone);
  const near = same.length ? [] : all.filter((x) => sideOf(x.f.round) === sideOf(finding.round)).slice(0, 3);
  const list = same.length ? same : near;

  return (
    <section className="layer done-well">
      {!open ? (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Show a round where you did this well
        </button>
      ) : (
        <>
          <h3>Where you did well in {finding.zone}</h3>
          {!ready ? (
            <p className="meta thinking">Looking through your matches</p>
          ) : (
            <>
              {!same.length ? <p className="meta">No good play in {finding.zone} yet. On the same side of {mapName(ctx.match.map)}:</p> : null}
              <ul className="round-list">
                {list.map(({ f, m }) => (
                  <li key={`${m.id}:${f.id}`}>
                    <button
                      type="button"
                      onClick={() => (m.id === ctx.match.id ? ctx.cites.onFinding?.(f.id) : s.openStudio(m.id, f.id))}
                    >
                      <span className="num t">
                        R{f.round} {clock(f.t)}
                      </span>
                      <span className="round-what">{f.summary}</span>
                      <span className="meta">{m.id === ctx.match.id ? 'This match' : `${m.ref}, ${m.when.split(',')[0]}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function RoundExplain({ ctx }: { ctx: PanelCtx }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => setState('idle'), [ctx.round.number, ctx.match.id]);
  const r = ctx.round;
  const kill = r.events.find((e) => e.type === 'kill' && (e.actor === YOU || e.victim === YOU));
  const text = `Round ${r.number}, ${r.side} side, ${r.won ? 'won' : 'lost'}: ${r.reason.toLowerCase()}. ${
    kill ? `${kill.actor === YOU ? `You killed ${kill.victim}` : `${kill.actor} killed you`} at [t:${kill.t.toFixed(1)}].` : 'You were not in a duel.'
  } ${r.stats.survived ? 'You survived the round.' : r.stats.deathTraded ? 'Your death was traded.' : 'Your death was not traded.'} No finding was raised for you in this round.`;
  return (
    <CoachBlock note={sourceNote(ctx.match, null)}>
      {state === 'idle' ? (
        <button
          type="button"
          className="link"
          onClick={() => {
            setState('loading');
            window.setTimeout(() => setState('done'), 900);
          }}
        >
          Explain round {r.number}
        </button>
      ) : state === 'loading' ? (
        <p className="meta thinking">Explaining round {r.number}</p>
      ) : (
        <p className="expl">
          <CoachText text={text} {...ctx.cites} />
        </p>
      )}
    </CoachBlock>
  );
}

function Stats({ r }: { r: RoundData }) {
  const s = r.stats;
  const cells: [string, string, string][] = [
    ['K', 'Kills', String(s.kills)],
    ['D', 'Deaths', String(s.deaths)],
    ['A', 'Assists', String(s.assists)],
    ['DMG', 'Damage', String(s.damage)],
    ['UTIL', 'Utility thrown', String(s.utilityThrown)],
    ['EQUIP', 'Equipment', `$${s.equipValue.toLocaleString('en-GB')}`],
  ];
  return (
    <section className="layer">
      <h3>
        {YOU} in round {r.number}, {s.side} side, {s.won ? 'won' : 'lost'}
      </h3>
      <dl className="stat-grid">
        {cells.map(([k, title, v]) => (
          <div key={k}>
            <dt>
              <abbr title={title}>{k}</abbr>
            </dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FindingRows({ list, ctx }: { list: Finding[]; ctx: PanelCtx }) {
  return (
    <ul className="find-list">
      {list.map((f) => (
        <li key={f.id}>
          <button type="button" className={f.id === ctx.headFinding?.id ? 'on' : ''} onClick={() => ctx.cites.onFinding?.(f.id)}>
            <i className={`g g-${f.kind}`} aria-hidden />
            <span>{findingLabel(f.template)}</span>
            <span className="mono meta">{f.id}</span>
            <span className="num meta">{clock(f.t)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Overview({ ctx }: { ctx: PanelCtx }) {
  const m = ctx.match;
  const first = ctx.moments[0];
  const lead = first ? ctx.findings.find((f) => f.id === first.findingIds[0]) : null;
  const momentRounds = new Map(ctx.moments.map((x) => [x.round, ctx.findings.find((f) => f.id === x.findingIds[0])!.kind]));
  return (
    <>
      <h2 className="ins-head">
        {YOU} on {mapName(m.map)}
      </h2>
      <p className="review-facts">
        <span className="num">
          {m.us}–{m.them}
        </span>{' '}
        {m.us > m.them ? 'win' : 'loss'} · {ctx.rounds.length} rounds · {ctx.moments.length} moments · {m.when}
      </p>
      <section className="layer">
        <h3>Rounds</h3>
        <ol className="round-strip">
          {ctx.rounds.map((r) => (
            <li key={r.number}>
              <button type="button" className={`rs${r.won ? ' won' : ''}`} title={`Round ${r.number}, ${r.won ? 'won' : 'lost'}`} onClick={() => ctx.selectRound(r.number)}>
                <span className="num">{r.number}</span>
                {momentRounds.get(r.number) ? <i className={`g g-${momentRounds.get(r.number)}`} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ol>
        <p className="meta small">Filled rounds were won. A mark is a moment the coach picked.</p>
      </section>
      <CoachBlock note={sourceNote(m, first ?? null)}>
        <p className="expl">
          <CoachText text={summary(m)} {...ctx.cites} />
        </p>
      </CoachBlock>
      {first && lead ? (
        <div className="review-start">
          <button type="button" className="btn btn-default btn-large" onClick={() => ctx.selectMoment(first)}>
            Review moment 1: {findingLabel(lead.template)}
          </button>
        </div>
      ) : null}
    </>
  );
}

function WrapUp({ ctx }: { ctx: PanelCtx }) {
  const seen = ctx.moments.filter((m) => ctx.seenMoments.has(m.id)).length;
  const counts = new Map<string, number>();
  for (const f of ctx.findings) if (f.kind === 'mistake') counts.set(detectorOf(f.template), (counts.get(detectorOf(f.template)) ?? 0) + 1);
  const next = [...counts.entries()].filter(([d]) => DRILLS[d]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const unseen = ctx.rounds.find((r) => !ctx.seenRounds.has(r.number));
  return (
    <>
      <h2 className="ins-head">{seen === ctx.moments.length ? `You reviewed all ${ctx.moments.length} moments` : `${seen} of ${ctx.moments.length} moments reviewed`}</h2>
      <p className="picked">Here is what to take into your next match.</p>
      <section className="layer">
        <h3>Practise next</h3>
        <ol className="drills">
          {next.map(([d, n]) => (
            <li key={d}>
              <b>{DRILLS[d].title}</b>
              <span className="meta">
                {' '}
                · {findingLabel(d)}, {n} {n === 1 ? 'time' : 'times'} this match
              </span>
              <p>{DRILLS[d].text}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="row-btns">
        <button type="button" className="btn" onClick={() => ctx.setReview('overview')}>
          Back to the overview
        </button>
        {unseen ? (
          <button type="button" className="btn" onClick={() => ctx.selectRound(unseen.number)}>
            Analyse round {unseen.number}
          </button>
        ) : null}
      </div>
    </>
  );
}

export function AnalysisPanel({ ctx }: { ctx: PanelCtx }) {
  if (ctx.review === 'overview') return <Overview ctx={ctx} />;
  if (ctx.review === 'wrapup') return <WrapUp ctx={ctx} />;

  const { round, moment, headFinding: f, selectedEvent: ev, match } = ctx;
  const idx = moment ? ctx.moments.findIndex((m) => m.id === moment.id) : -1;
  const next = idx >= 0 ? ctx.moments[idx + 1] : undefined;
  const inMoment = moment ? ctx.findings.filter((x) => moment.findingIds.includes(x.id)) : [];
  const text = moment ? explanation(match, moment) : f ? explanation(match, { id: 'x', findingIds: [f.id], round: f.round, t0: 0, t1: 0, pickedBecause: '', source: 'agent', clip: 'ready' }) : null;
  const killsThisRound = round.events.filter((e) => e.type === 'kill').length;

  return (
    <>
      <h2 className="ins-head">{f ? f.summary : ev ? eventTitle(ev) : `${round.winner} win, ${round.reason.toLowerCase()}`}</h2>
      {f ? (
        <p className={`ins-meta k-${f.kind}`}>
          <b>
            <i className={`g g-${f.kind}`} aria-hidden />
            {f.kind === 'mistake' ? 'Mistake' : 'Good play'}
          </b>
          {idx >= 0 ? (
            <span>
              Moment {idx + 1} of {ctx.moments.length}
            </span>
          ) : null}
          <span>
            Round {f.round}, {clock(f.t)}, {f.zone}
          </span>
        </p>
      ) : null}
      <p className="picked">
        {moment && f && moment.findingIds[0] === f.id ? (
          <CoachText
            text={
              moment.source === 'agent'
                ? `Picked by the coach: ${moment.pickedBecause}. Evidence: ${moment.findingIds.map((id) => `[${id}]`).join(' ')}.`
                : `The ${idx === 0 ? 'most important' : `number ${idx + 1}`} of ${ctx.moments.length} moments by the ranker. Evidence: ${moment.findingIds.map((id) => `[${id}]`).join(' ')}.`
            }
            {...ctx.cites}
          />
        ) : f ? (
          <CoachText text={`${findingLabel(f.template)} for ${YOU}, finding [${f.id}].`} {...ctx.cites} />
        ) : ev ? (
          `${typeLabel(ev.type)} at ${clock(ev.t)}.`
        ) : (
          'Play, scrub the timeline or pick an event.'
        )}
      </p>

      {text ? (
        <CoachBlock note={sourceNote(match, moment)}>
          <p className="expl">
            <CoachText text={text} {...ctx.cites} />
          </p>
        </CoachBlock>
      ) : (
        <RoundExplain ctx={ctx} />
      )}

      {f ? <DoneWell ctx={ctx} finding={f} /> : null}

      {moment ? (
        <div className="moment-step">
          {next ? (
            <button type="button" className="next-btn" onClick={() => ctx.selectMoment(next)}>
              <span className="next-k">Next</span>
              <b className="num">{String(idx + 2).padStart(2, '0')}</b>
              <i className={`g g-${ctx.findings.find((x) => x.id === next.findingIds[0])!.kind}`} aria-hidden />
              <span className="next-t">{findingLabel(ctx.findings.find((x) => x.id === next.findingIds[0])!.template)}</span>
              <kbd>N</kbd>
            </button>
          ) : (
            <button type="button" className="next-btn" onClick={() => ctx.setReview('wrapup')}>
              <span className="next-k">Done</span>
              <span className="next-t">Open the debrief</span>
              <kbd>N</kbd>
            </button>
          )}
        </div>
      ) : null}

      {inMoment.length > 1 ? (
        <section className="layer">
          <h3>In this moment</h3>
          <FindingRows list={inMoment} ctx={ctx} />
        </section>
      ) : null}

      <Stats r={round} />

      <section className="layer">
        <h3>Round {round.number}</h3>
        <dl className="facts compact">
          <div>
            <dt>Winner</dt>
            <dd>{round.winner}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>{round.reason}</dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd className="num">{clock(round.duration)}</dd>
          </div>
          <div>
            <dt>Kills</dt>
            <dd className="num">{killsThisRound}</dd>
          </div>
        </dl>
      </section>

      <details className="ev" open={round.findings.length > 0}>
        <summary>
          Findings this round <span className="aside num">{round.findings.length}</span>
        </summary>
        {round.findings.length ? <FindingRows list={round.findings} ctx={ctx} /> : <p className="meta">Nothing found for {YOU} in this round.</p>}
      </details>
      <details className="ev">
        <summary>
          Events <span className="aside num">{round.events.length}</span>
        </summary>
        <ul className="ev-list">
          {round.events.map((e) => (
            <li key={e.id}>
              <button type="button" className={e.id === ev?.id ? 'on' : ''} onClick={() => ctx.onSeek(e.t, e.id)}>
                <span className="num t">{clock(e.t)}</span>
                <span>{eventTitle(e)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <p className="meta small">Reviewed by {match.model ?? `templates (${SERVED_MODEL} was off)`}.</p>
    </>
  );
}
