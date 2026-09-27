import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { isTeam, type ReplayEvent } from '../mock/replay';
import { YOU, findingLabel, type Finding } from '../mock/world';
import { clock, clockShort } from '../ui/time';

type Props = {
  duration: number;
  t: number;
  events: ReplayEvent[];
  findings: Finding[];
  band: { t0: number; t1: number } | null;
  headFindingId: string | null;
  selectedEventId: string | null;
  rounds: { n: number; won: boolean; moment: 'mistake' | 'strength' | null }[];
  current: number;
  onRound: (n: number) => void;
  onSeek: (t: number, eventId?: string) => void;
  onFinding: (id: string) => void;
  onScrub: (active: boolean) => void;
};

export function Timeline({ duration, t, events, findings, band, headFindingId, selectedEventId, rounds, current, onRound, onSeek, onFinding, onScrub }: Props) {
  const hit = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  const scrubbing = useRef(false);
  const p = (x: number) => `${(Math.max(0, Math.min(duration, x)) / duration) * 100}%`;

  const at = (e: RPointerEvent) => {
    const r = hit.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
  };

  const ticks = [];
  for (let s = 0; s <= duration; s += 10) ticks.push(s);

  return (
    <div className="tl">
      <div className="tl-row">
        <span className="tl-n">Match</span>
        <ol className="tl-rounds" style={{ '--rounds': rounds.length } as CSSProperties}>
          {rounds.map((r) => (
            <li key={r.n}>
              <button
                type="button"
                className={`rs${r.won ? ' won' : ''}`}
                aria-current={r.n === current ? 'true' : undefined}
                title={`Round ${r.n}, ${r.won ? 'won' : 'lost'}`}
                onClick={() => onRound(r.n)}
              >
                {r.moment ? <i className={`g g-${r.moment}`} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="tl-lanes">
        <div className="tl-lane">
          <span className="tl-n">Coach</span>
          <div className="tl-track">
            {band ? <span className="tl-band" style={{ left: p(band.t0), width: `calc(${p(band.t1)} - ${p(band.t0)})` }} /> : null}
            {findings.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`tl-find${f.id === headFindingId ? ' on' : ''}`}
                style={{ left: p(f.t) }}
                title={`${findingLabel(f.template)}, ${clock(f.t)}`}
                onClick={() => onFinding(f.id)}
              >
                <i className={`g g-${f.kind}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="tl-lane">
          <span className="tl-n">Events</span>
          <div className="tl-track">
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`tl-ev ev-${e.type}${e.type === 'kill' ? (isTeam(e.actor) ? ' by-team' : ' by-enemy') : ''}${e.actor === YOU || e.victim === YOU ? ' mine' : ''}${e.id === selectedEventId ? ' on' : ''}`}
                style={{ left: p(e.t) }}
                title={`${clock(e.t)} ${e.type === 'kill' ? `${e.actor} killed ${e.victim}` : `${e.actor}, ${e.type}`}`}
                onClick={() => onSeek(e.t, e.id)}
              />
            ))}
          </div>
        </div>
        <div
          className="tl-hit"
          ref={hit}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubbing.current = true;
            onScrub(true);
            onSeek(at(e));
          }}
          onPointerMove={(e) => {
            setGhost(at(e));
            if (scrubbing.current) onSeek(at(e));
          }}
          onPointerUp={() => {
            if (scrubbing.current) onScrub(false);
            scrubbing.current = false;
          }}
          onPointerLeave={() => setGhost(null)}
          aria-label="Round position"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(t)}
        >
          <div className="tl-head" style={{ left: p(t) }} />
          {ghost != null ? (
            <div className="tl-ghost" style={{ left: p(ghost) }}>
              <span>{clock(ghost)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="tl-row tl-scale" aria-hidden>
        <span className="tl-n" />
        <div className="tl-track">
          {ticks.map((s) => (
            <span key={s} className={`tick${s % 20 === 0 ? ' major' : ''}`} style={{ left: p(s) }}>
              {s % 20 === 0 ? clockShort(s) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
