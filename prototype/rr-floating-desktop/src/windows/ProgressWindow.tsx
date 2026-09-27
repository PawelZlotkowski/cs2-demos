import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '@/lib/api/client';
import type { ProgressResponse, ProgressZone } from '@/lib/contracts';
import { WindowFrame } from '../desktop/WindowFrame';
import { MAPS, mapIdOf, mapName, type MapId } from '../data/maps';
import { errorText } from '../data/model';
import { useStore } from '../state/store';

function trendText(recent: number | null, before: number | null): string {
  if (recent == null || before == null) return '';
  if (recent === before) return `${recent} per 10 rounds, as before`;
  return `${recent} per 10 rounds lately, ${before} before`;
}

function Heat({ map, zones, hover }: { map: MapId; zones: ProgressZone[]; hover: string | null }) {
  const max = Math.max(1, ...zones.map((z) => z.deaths));
  return (
    <figure className="map-fig heat">
      <img src={MAPS[map].radar} alt="" />
      <svg viewBox="0 0 1024 1024" aria-hidden>
        {MAPS[map].zones.map((z) => {
          const d = zones.find((x) => x.zone === z.name)?.deaths ?? 0;
          const a = d ? 0.18 + (0.55 * d) / max : 0;
          return z.polygons.map((poly, i) => (
            <polygon
              key={`${z.name}${i}`}
              points={poly.map((p) => p.join(',')).join(' ')}
              style={{ fill: `rgba(232, 133, 12, ${a})`, stroke: hover === z.name ? '#fff' : undefined, strokeWidth: hover === z.name ? 5 : undefined }}
            >
              <title>
                {z.name}
                {d ? `, ${d} deaths` : ''}
              </title>
            </polygon>
          ));
        })}
      </svg>
    </figure>
  );
}

export function ProgressWindow() {
  const s = useStore();
  const [hover, setHover] = useState<string | null>(null);
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = s.players.find((p) => p.id === s.playerId) ?? null;
  const reviewed = s.matches.filter((m) => m.status === 'complete').length;

  useEffect(() => {
    if (!s.playerId) return;
    let stop = false;
    setError(null);
    api
      .getProgress(s.playerId)
      .then((d) => !stop && setData(d))
      .catch((e) => !stop && setError(errorText(e)));
    return () => {
      stop = true;
    };
  }, [s.playerId, reviewed]);

  const done = data?.matches ?? [];
  const rows = (data?.detectors ?? []).map((d) => ({ ...d, kind: d.kind === 'good' ? ('good' as const) : ('mistake' as const) }));
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  const refs = new Map(done.map((m) => [m.ref, m.matchId]));
  const open = (e: string) => {
    const [ref, fid] = e.split(':');
    const mid = refs.get(ref);
    if (mid) s.openStudio(mid, fid);
  };
  const maps = (['de_mirage', 'de_anubis'] as MapId[]).filter((m) => done.some((x) => mapIdOf(x.map) === m));

  const body = (kind: 'mistake' | 'good', label: string) => (
    <>
      <tr className="group-h">
        <td colSpan={done.length + 2}>{label}</td>
      </tr>
      {rows
        .filter((r) => r.kind === kind)
        .map((r) => (
          <tr key={r.detector} data-kind={r.kind}>
            <th scope="row">
              <i className={`g g-${r.kind === 'good' ? 'strength' : 'mistake'}`} aria-hidden /> {r.label}
            </th>
            {r.counts.map((c, i) => (
              <td key={i} className="n">
                <span className="dot" style={{ '--s': String(c ? 0.35 + (0.65 * c) / max : 0) } as CSSProperties} aria-hidden />
                <span className="num">{c || ''}</span>
              </td>
            ))}
            <td className="meta">{trendText(r.per10Recent, r.per10Before)}</td>
          </tr>
        ))}
    </>
  );

  return (
    <WindowFrame
      id="progress"
      subtitle={player ? `${player.name}, ${done.length} matches` : 'No reviewed matches yet'}
      minW={640}
      toolbar={
        s.players.length ? (
          <label className="who">
            <span className="meta">Player</span>
            <select className="select" value={s.playerId ?? ''} onChange={(e) => s.pickPlayer(e.target.value)} aria-label="Player">
              {s.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null
      }
    >
      <div className="page">
        {!player ? <p className="empty">Review a match first; progress starts with the first reviewed match.</p> : null}
        {error ? <p className="err">{error}</p> : null}
        <p className="lede">What keeps happening across your matches, oldest on the left. Counts come from the detectors; nothing here is a score.</p>
        <div className="table-wrap">
          <table className="data prog">
            <thead>
              <tr>
                <th scope="col">What</th>
                {done.map((m) => (
                  <th scope="col" key={m.ref} className="n">
                    <button type="button" className="link" title={`${mapName(m.map)}, ${m.when}, ${m.rounds} rounds`} onClick={() => s.openStudio(m.matchId)}>
                      {m.ref}
                    </button>
                  </th>
                ))}
                <th scope="col">Lately</th>
              </tr>
            </thead>
            <tbody>
              {body('mistake', 'Mistakes')}
              {body('good', 'Good plays')}
            </tbody>
          </table>
        </div>
        <p className="meta small">Lately is the last three matches, per 10 rounds, against the ones before.</p>

        <section className="sec">
          <div className="sec-h">
            <h2>Where you die</h2>
            <span className="meta">Callouts with the most deaths across your matches, with the findings there.</span>
          </div>
          <div className="zones-cols">
            {maps.map((map) => {
              const zones = (data?.zones ?? []).filter((z) => mapIdOf(z.map) === map).sort((a, b) => b.deaths - a.deaths);
              const top = Math.max(1, ...zones.map((z) => z.deaths));
              return (
                <div className="zones-col" key={map}>
                  <h3>{mapName(map)}</h3>
                  <Heat map={map} zones={zones} hover={hover} />
                  <ol className="zone-rank">
                    {zones.map((z) => (
                      <li key={z.zone} onPointerEnter={() => setHover(z.zone)} onPointerLeave={() => setHover(null)} aria-current={hover === z.zone ? 'true' : undefined}>
                        <span className="num">{z.deaths}</span>
                        <span>{z.zone}</span>
                        <span className="bar" style={{ '--w': z.deaths / top } as CSSProperties} aria-hidden />
                        <span className="zone-ex">
                          {z.examples.map((e) => (
                            <button key={e} type="button" className="cite" title="Open in the Studio" onClick={() => open(e)}>
                              {e}
                            </button>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}
