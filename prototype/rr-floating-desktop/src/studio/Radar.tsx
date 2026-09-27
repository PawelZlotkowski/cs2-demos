import { useMemo } from 'react';
import { MAPS, zoneCentre, type MapId } from '../data/maps';
import { posAt, type Finding, type RoundData } from '../data/model';

type Props = {
  map: MapId | null;
  round: RoundData;
  t: number;
  whole: boolean;
  small: boolean;
  focusFinding: Finding | null;
  selectedEventId: string | null;
};

const NADE_R: Record<string, number> = { smoke: 26, molotov: 20, flash: 10, he: 12 };
const NADE_S: Record<string, number> = { smoke: 18, molotov: 7 };

/** Radar in the 1024 px overview space; "This round" crops to where the round happened. */
export function Radar({ map, round, t, whole, small, focusFinding, selectedEventId }: Props) {
  const meta = map ? MAPS[map] : null;
  const you = round.you;

  const view = useMemo(() => {
    const pts = [...(round.tracks[you] ?? []), ...round.events.filter((e) => e.type === 'kill' && e.x != null)].map((p) => ({ x: p.x!, y: p.y! }));
    if (whole || !pts.length) return { s: 1, x: 0, y: 0 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 90;
    const x0 = Math.max(0, Math.min(...xs) - pad);
    const x1 = Math.min(1024, Math.max(...xs) + pad);
    const y0 = Math.max(0, Math.min(...ys) - pad);
    const y1 = Math.min(1024, Math.max(...ys) + pad);
    const size = Math.max(420, x1 - x0, y1 - y0);
    const s = Math.min(2.2, 1024 / size);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return { s, x: 512 - cx * s, y: 512 - cy * s };
  }, [whole, round, you]);

  if (!meta) return <div className="clip-note">No radar for this map yet; the app draws Mirage and Anubis.</div>;

  const placed = round.events.filter((e) => e.x != null && e.y != null);
  const recent = placed.filter((e) => NADE_R[e.type] && e.t <= t && t - e.t < (NADE_S[e.type] ?? 1.2));
  const kills = placed.filter((e) => e.type === 'kill' && e.t <= t);
  const plant = placed.find((e) => e.type === 'plant' && e.t <= t);
  const mine = round.tracks[you] ?? [];
  const trail = mine.filter((k) => k.t <= t && (round.deaths[you] == null || k.t <= round.deaths[you]));
  const me = posAt(mine, t);
  const selected = placed.find((e) => e.id === selectedEventId);
  const ring = focusFinding?.zone ? zoneCentre(meta.id, focusFinding.zone) : null;
  const label = small ? 0 : 1;
  const order = [...round.enemy, ...[...round.team].filter((p) => p !== you), you];

  return (
    <svg className="radar" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${meta.name} radar, round ${round.number}`}>
      <g className="radar-cam" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        <image href={meta.radar} x="0" y="0" width="1024" height="1024" />
        {ring ? <circle className="r-zone" cx={ring[0]} cy={ring[1]} r={46} /> : null}
        {recent.map((e) => (
          <circle key={e.id} className={`r-nade r-${e.type}`} cx={e.x!} cy={e.y!} r={NADE_R[e.type] ?? 10} />
        ))}
        {trail.length > 1 && me ? <polyline className="r-trail" points={[...trail.map((k) => `${k.x},${k.y}`), `${me[0]},${me[1]}`].join(' ')} /> : null}
        {plant ? (
          <g className="r-bomb" transform={`translate(${plant.x} ${plant.y})`}>
            <rect x={-7} y={-7} width={14} height={14} rx={2} />
          </g>
        ) : null}
        {kills.map((e) => (
          <g key={e.id} className={`r-dead${e.victim && round.team.has(e.victim) ? ' team' : ''}${e.victim === you ? ' you' : ''}`} transform={`translate(${e.x} ${e.y})`}>
            <path d="M-6 -6L6 6M6 -6L-6 6" />
          </g>
        ))}
        {order.map((name) => {
          const dead = round.deaths[name] != null && round.deaths[name] <= t;
          if (dead) return null;
          const p = posAt(round.tracks[name], t);
          if (!p) return null;
          const cls = name === you ? 'you' : round.team.has(name) ? 'team' : 'enemy';
          return (
            <g key={name} className={`r-p ${cls}`} transform={`translate(${p[0]} ${p[1]})`}>
              <circle r={name === you ? 9 : 7} />
              {label ? (
                <text y={-14} textAnchor="middle">
                  {name}
                </text>
              ) : null}
            </g>
          );
        })}
        {selected ? <circle className="r-sel" cx={selected.x!} cy={selected.y!} r={16} /> : null}
      </g>
    </svg>
  );
}
