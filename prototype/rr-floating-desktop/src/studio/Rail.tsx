import { findingLabel, type Finding, type Moment, type RoundData } from '../data/model';
import { clock } from '../ui/time';

export type Review = 'overview' | 'wrapup' | null;

type Props = {
  you: string;
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

export function Rail({ you, moments, findings, rounds, review, momentId, roundNo, seenMoments, seenRounds, onReview, onMoment, onRound }: Props) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  return (
    <aside className="rail" aria-label="Moments and rounds">
      <div className="rail-h">
        Moments for {you}
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
          const lead = byId.get(m.findingIds[0]);
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
                  <i className={`g g-${lead?.kind ?? 'mistake'}`} aria-hidden />
                  {lead ? findingLabel(lead.template) : `Round ${m.round}`}
                </span>
                <span className="mom-meta">
                  R{m.round} {clock(lead?.t ?? m.t0)}
                  {lead?.zone ? ` · ${lead.zone}` : ''}
                  {m.clip.status === 'ready' ? <span className="pov-tag">POV</span> : m.clip.status === 'recording' ? <span className="pov-tag rec">Recording</span> : null}
                </span>
                {m.pickedBecause ? <span className="mom-why">{m.pickedBecause.charAt(0).toUpperCase() + m.pickedBecause.slice(1)}</span> : null}
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
                  {r.winner ? `${r.winner} win` : `Round ${r.number}`}
                  {r.won === false ? ', lost' : r.won ? ', won' : ''}
                </span>
                <span className="mom-meta">
                  {r.reason}, {Math.round(r.duration)} s
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
