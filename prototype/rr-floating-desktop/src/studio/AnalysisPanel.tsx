import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { MomentExplanation } from '@/lib/contracts';
import { COACH_LANGUAGES } from '../data/languages';
import { eventTitle, findingLabel, typeLabel, type Finding, type Match, type Moment, type ReplayEvent, type RoundData } from '../data/model';
import { useCached, type StudioData } from '../data/useStudio';
import { useStore } from '../state/store';
import { CoachText, type CiteHandlers } from '../ui/CoachText';
import { clock } from '../ui/time';
import type { Review } from './Rail';

export type PanelCtx = {
  match: Match;
  data: StudioData;
  you: string;
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

function sourceNote(e: MomentExplanation | null): string {
  if (!e) return '';
  if (e.source === 'agent') return `Written by ${e.model ?? 'the coach model'} and checked against the findings.`;
  return e.verifierErrors.length
    ? 'Written from the findings: the model’s text did not pass the checks.'
    : 'Written from the findings: the coach model was off for this review.';
}

function CoachBlock({ children, expl }: { children: ReactNode; expl: MomentExplanation | null }) {
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
      {expl ? (
        <p className="expl-note">
          {sourceNote(expl)}
          {s.lab ? (
            <>
              {' '}
              <button type="button" className="link" onClick={() => s.open('lab')}>
                How this was written
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

function CoachAnswer({ state, busy, cites }: { state: { value: MomentExplanation | null; error: string | null; loading: boolean }; busy: string; cites: CiteHandlers }) {
  return (
    <CoachBlock expl={state.value}>
      {state.loading ? (
        <p className="meta thinking">{busy}</p>
      ) : state.error ? (
        <p className="err">{state.error}</p>
      ) : state.value ? (
        <p className="expl">
          <CoachText text={state.value.text} {...cites} />
        </p>
      ) : null}
    </CoachBlock>
  );
}

function useKey(ctx: PanelCtx, target: string | null) {
  const s = useStore();
  return target ? `${ctx.match.id}:${ctx.data.playerId}:${target}:${s.language}` : null;
}

function DoneWell({ ctx, finding }: { ctx: PanelCtx; finding: Finding }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [finding.id]);
  const key = open ? `${ctx.match.id}:${ctx.data.playerId}:well:${finding.id}` : null;
  const res = useCached(key, () => api.doneWell(ctx.match.id, ctx.data.playerId, finding.id));

  if (finding.kind !== 'mistake') return null;
  const zone = res.value?.zone ?? finding.zone;
  const list = res.value?.items ?? [];

  return (
    <section className="layer done-well">
      {!open ? (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Show a round where you did this well
        </button>
      ) : (
        <>
          <h3>{zone ? `Where you did well in ${zone}` : 'Where you did well'}</h3>
          {res.loading ? (
            <p className="meta thinking">Looking through your matches</p>
          ) : res.error ? (
            <p className="err">{res.error}</p>
          ) : !list.length ? (
            <p className="meta">No good play to compare with yet. Review more matches on {ctx.match.mapLabel}.</p>
          ) : (
            <>
              {list.some((x) => x.zone === zone) ? null : <p className="meta">No good play in {zone || 'this spot'} yet. Nearby:</p>}
              <ul className="round-list">
                {list.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => (x.sameMatch ? ctx.cites.onFinding?.(x.findingId) : s.openStudio(x.matchId, x.findingId))}>
                      <span className="num t">
                        R{x.round} {clock(x.t)}
                      </span>
                      <span className="round-what">{x.summary}</span>
                      <span className="meta">{x.sameMatch ? 'This match' : (s.matches.find((m) => m.id === x.matchId)?.when ?? x.id.split(':')[0])}</span>
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
  const s = useStore();
  const n = ctx.round.number;
  const [asked, setAsked] = useState(false);
  useEffect(() => setAsked(false), [n, ctx.match.id]);
  const key = useKey(ctx, asked ? `r${n}` : null);
  const res = useCached(key, () => api.explainRound(ctx.match.id, ctx.data.playerId, n, s.language));
  if (!asked)
    return (
      <CoachBlock expl={null}>
        <button type="button" className="link" onClick={() => setAsked(true)}>
          Explain round {n}
        </button>
      </CoachBlock>
    );
  return <CoachAnswer state={res} busy={`Explaining round ${n}`} cites={ctx.cites} />;
}

function money(v: number | null | undefined) {
  return v == null ? '–' : `$${v.toLocaleString('en-GB')}`;
}

function Stats({ r, you }: { r: RoundData; you: string }) {
  const s = r.stats;
  if (!s) return null;
  const cells: [string, string, string][] = [
    ['K', 'Kills', String(s.kills)],
    ['D', 'Deaths', String(s.deaths)],
    ['A', 'Assists', String(s.assists)],
    ['DMG', 'Damage', String(s.damage)],
    ['UTIL', 'Utility thrown', String(s.utilityThrown)],
    ['EQUIP', 'Equipment', money(s.equipValue)],
  ];
  return (
    <section className="layer">
      <h3>
        {you} in round {r.number}
        {s.side ? `, ${s.side} side` : ''}
        {s.won == null ? '' : s.won ? ', won' : ', lost'}
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
  const s = useStore();
  const m = ctx.match;
  const first = ctx.moments[0];
  const lead = first ? ctx.findings.find((f) => f.id === first.findingIds[0]) : null;
  const momentRounds = new Map(ctx.moments.map((x) => [x.round, ctx.findings.find((f) => f.id === x.findingIds[0])?.kind ?? 'mistake']));
  const key = useKey(ctx, 'summary');
  const summary = useCached(key, () => api.getReviewSummary(m.id, ctx.data.playerId, s.language));
  const { us, them } = ctx.data;
  return (
    <>
      <h2 className="ins-head">
        {ctx.you} on {m.mapLabel}
      </h2>
      <p className="review-facts">
        <span className="num">
          {us}–{them}
        </span>{' '}
        {us > them ? 'win' : us < them ? 'loss' : 'draw'} · {ctx.rounds.length} rounds · {ctx.moments.length} moments · {m.when}
      </p>
      <section className="layer">
        <h3>Rounds</h3>
        <ol className="round-strip">
          {ctx.rounds.map((r) => (
            <li key={r.number}>
              <button type="button" className={`rs${r.won ? ' won' : ''}`} title={`Round ${r.number}${r.won == null ? '' : r.won ? ', won' : ', lost'}`} onClick={() => ctx.selectRound(r.number)}>
                <span className="num">{r.number}</span>
                {momentRounds.get(r.number) ? <i className={`g g-${momentRounds.get(r.number)}`} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ol>
        <p className="meta small">Filled rounds were won. A mark is a moment the coach picked.</p>
      </section>
      <CoachAnswer state={summary} busy="Writing the match summary" cites={ctx.cites} />
      {first ? (
        <div className="review-start">
          <button type="button" className="btn btn-default btn-large" onClick={() => ctx.selectMoment(first)}>
            Review moment 1{lead ? `: ${findingLabel(lead.template)}` : ''}
          </button>
        </div>
      ) : (
        <p className="meta">The coach picked no moments in this match. Open any round from the list.</p>
      )}
    </>
  );
}

function WrapUp({ ctx }: { ctx: PanelCtx }) {
  const s = useStore();
  const seen = ctx.moments.filter((m) => ctx.seenMoments.has(m.id)).length;
  const unseen = ctx.rounds.find((r) => !ctx.seenRounds.has(r.number));
  const key = useKey(ctx, 'wrapup');
  const wrap = useCached(key, () => api.getReviewWrapUp(ctx.match.id, ctx.data.playerId, s.language));
  const expl = { value: wrap.value?.explanation ?? null, error: wrap.error, loading: wrap.loading };
  const counts = new Map<string, number>();
  for (const f of ctx.findings) if (f.kind === 'mistake') counts.set(f.detector, (counts.get(f.detector) ?? 0) + 1);
  return (
    <>
      <h2 className="ins-head">{seen === ctx.moments.length ? `You reviewed all ${ctx.moments.length} moments` : `${seen} of ${ctx.moments.length} moments reviewed`}</h2>
      <p className="picked">Here is what to take into your next match.</p>
      <CoachAnswer state={expl} busy="Writing the debrief" cites={ctx.cites} />
      {wrap.value?.drills.length ? (
        <section className="layer">
          <h3>Practise next</h3>
          <ol className="drills">
            {wrap.value.drills.map((d) => (
              <li key={d.detector}>
                <b>{d.title}</b>
                <span className="meta">
                  {' '}
                  · {findingLabel(d.detector)}, {counts.get(d.detector) ?? d.findingIds.length} {(counts.get(d.detector) ?? d.findingIds.length) === 1 ? 'time' : 'times'} this match
                </span>
                <p>{d.text}</p>
                <span className="meta small">
                  <CoachText text={`[${d.passageId}] ${d.source}`} {...ctx.cites} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
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

function MomentExplain({ ctx, moment }: { ctx: PanelCtx; moment: Moment }) {
  const s = useStore();
  const key = useKey(ctx, moment.id);
  const res = useCached(key, () => api.getMomentExplanation(ctx.match.id, ctx.data.playerId, moment.id, s.language));
  return <CoachAnswer state={res} busy="Reading the coach’s explanation" cites={ctx.cites} />;
}

export function AnalysisPanel({ ctx }: { ctx: PanelCtx }) {
  if (ctx.review === 'overview') return <Overview ctx={ctx} />;
  if (ctx.review === 'wrapup') return <WrapUp ctx={ctx} />;

  const { round, moment, headFinding: f, selectedEvent: ev, match, you } = ctx;
  const idx = moment ? ctx.moments.findIndex((m) => m.id === moment.id) : -1;
  const next = idx >= 0 ? ctx.moments[idx + 1] : undefined;
  const nextLead = next ? ctx.findings.find((x) => x.id === next.findingIds[0]) : undefined;
  const inMoment = moment ? ctx.findings.filter((x) => moment.findingIds.includes(x.id)) : [];
  const killsThisRound = round.events.filter((e) => e.type === 'kill').length;

  return (
    <>
      <h2 className="ins-head">{f ? f.summary : ev ? eventTitle(ev) : `${round.winner ? `${round.winner} win, ` : ''}${round.reason.toLowerCase()}`}</h2>
      {f ? (
        <p className={`ins-meta k-${f.kind}`}>
          <b>
            <i className={`g g-${f.kind}`} aria-hidden />
            {f.kind === 'mistake' ? 'Mistake' : f.kind === 'strength' ? 'Good play' : 'Context'}
          </b>
          {idx >= 0 ? (
            <span>
              Moment {idx + 1} of {ctx.moments.length}
            </span>
          ) : null}
          <span>
            Round {f.round}, {clock(f.t)}
            {f.zone ? `, ${f.zone}` : ''}
          </span>
        </p>
      ) : null}
      <p className="picked">
        {moment && f && moment.findingIds[0] === f.id ? (
          <CoachText
            text={
              moment.source === 'agent'
                ? `Picked by the coach: ${moment.pickedBecause || 'one of the moments that mattered most'}. Evidence: ${moment.findingIds.map((id) => `[${id}]`).join(' ')}.`
                : `The ${idx === 0 ? 'most important' : `number ${idx + 1}`} of ${ctx.moments.length} moments by the ranker. Evidence: ${moment.findingIds.map((id) => `[${id}]`).join(' ')}.`
            }
            {...ctx.cites}
          />
        ) : f ? (
          <CoachText text={`${findingLabel(f.template)} for ${you}, finding [${f.id}].`} {...ctx.cites} />
        ) : ev ? (
          `${typeLabel(ev.type)} at ${clock(ev.t)}.`
        ) : (
          'Play, scrub the timeline or pick an event.'
        )}
      </p>

      {moment ? <MomentExplain ctx={ctx} moment={moment} /> : <RoundExplain ctx={ctx} />}

      {f ? <DoneWell ctx={ctx} finding={f} /> : null}

      {moment ? (
        <div className="moment-step">
          {next ? (
            <button type="button" className="next-btn" onClick={() => ctx.selectMoment(next)}>
              <span className="next-k">Next</span>
              <b className="num">{String(idx + 2).padStart(2, '0')}</b>
              <i className={`g g-${nextLead?.kind ?? 'mistake'}`} aria-hidden />
              <span className="next-t">{nextLead ? findingLabel(nextLead.template) : `Round ${next.round}`}</span>
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

      <Stats r={round} you={you} />

      <section className="layer">
        <h3>Round {round.number}</h3>
        <dl className="facts compact">
          <div>
            <dt>Winner</dt>
            <dd>{round.winner ?? '–'}</dd>
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
            <dd className="num">{round.loaded ? killsThisRound : '–'}</dd>
          </div>
        </dl>
      </section>

      <details className="ev" open={round.findings.length > 0}>
        <summary>
          Findings this round <span className="aside num">{round.findings.length}</span>
        </summary>
        {round.findings.length ? <FindingRows list={round.findings} ctx={ctx} /> : <p className="meta">Nothing found for {you} in this round.</p>}
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
      <p className="meta small">Reviewed by {match.model ?? 'templates (the coach model was off)'}.</p>
    </>
  );
}
