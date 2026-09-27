import type { RoundData } from '../mock/replay';
import { YOU, findingLabel, type Finding, type Moment } from '../mock/world';
import { clock } from '../ui/time';

export type Review = 'overview' | 'wrapup' | null;

type Props = {
  moments: Moment[];
  findings: Finding[];
  rounds: RoundData[];
  review: Review;
  momentId: string | null;
  roundNo: number;
  seenMoments: Set<string>;
  seenRounds: Set<number>;
  onReview: (r: 'overview' | 'wrapup') => void;
  onMoment: (m: Moment) => void;
  onRound: (n: number) => void;
};

export function Rail({ moments, findings, rounds, review, momentId, roundNo, seenMoments, seenRounds, onReview, onMoment, onRound }: Props) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  return (
    <aside className="rail" aria-label="Moments and rounds">
      <div className="rail-h">
        Moments for {YOU}
        <span>{moments.length}</span>
      </div>
      <ol className="moms">
        <li>
          <button type="button" className="mom" aria-current={review === 'overview' ? 'true' : undefined} onClick={() => onReview('overview')}>
            <span className="mom-n">
              <i className="g g-round" />
            </span>
            <span className="mom-title">Match brief</span>
            <span className="mom-meta">Summary and rounds</span>
          </button>
        </li>
        {moments.map((m, i) => {
          const lead = byId.get(m.findingIds[0])!;
          const current = m.id === momentId && !review;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`mom${seenMoments.has(m.id) && !current ? ' is-seen' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => onMoment(m)}
              >
                <span className="mom-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="mom-title">
                  <i className={`g g-${lead.kind}`} aria-hidden />
                  {findingLabel(lead.template)}
                </span>
                <span className="mom-meta">
                  R{m.round} {clock(lead.t)} · {lead.zone}
                  {m.clip === 'ready' ? <span className="pov-tag">POV</span> : <span className="pov-tag rec">Recording</span>}
                </span>
                <span className="mom-why">{m.pickedBecause.charAt(0).toUpperCase() + m.pickedBecause.slice(1)}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="mom" aria-current={review === 'wrapup' ? 'true' : undefined} onClick={() => onReview('wrapup')}>
            <span className="mom-n">
              <i className="g g-round" />
            </span>
            <span className="mom-title">Debrief</span>
            <span className="mom-meta">What to practise next</span>
          </button>
        </li>
      </ol>
      <div className="rail-h sub">
        All rounds
        <span>
          {seenRounds.size} of {rounds.length} seen
        </span>
      </div>
      <ol className="moms secondary">
        {rounds.map((r) => {
          const current = r.number === roundNo && !momentId && !review;
          return (
            <li key={r.number}>
              <button
                type="button"
                className={`mom${seenRounds.has(r.number) && !current ? ' is-seen' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => onRound(r.number)}
              >
                <span className="mom-n">{String(r.number).padStart(2, '0')}</span>
                <span className="mom-title">
                  {r.winner} win{r.won ? '' : ', lost'}
                </span>
                <span className="mom-meta">
                  {r.reason}, {r.duration} s
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
