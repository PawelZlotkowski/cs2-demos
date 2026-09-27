import { useState, type CSSProperties } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { DEATH_ZONES, progressRows, trendText } from '../mock/coach';
import { MAPS, type MapId } from '../mock/maps';
import { YOU, mapName, matchByRef, roundsOf } from '../mock/world';
import { useStore } from '../state/store';

function Heat({ map, hover }: { map: MapId; hover: string | null }) {
  const zones = DEATH_ZONES.filter((z) => z.map === map);
  const max = Math.max(...zones.map((z) => z.deaths));
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
  const done = s.matches.filter((m) => m.status === 'complete' && m.ref).sort((a, b) => a.ref!.localeCompare(b.ref!));
  const rows = progressRows(done);
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  const open = (e: string) => {
    const [ref, fid] = e.split(':');
    const m = matchByRef(ref, s.matches);
    if (m) s.openStudio(m.id, fid);
  };

  const body = (kind: 'mistake' | 'good', label: string) => (
    <>
      <tr className="group-h">
        <td colSpan={done.length + 2}>{label}</td>
      </tr>
      {rows
        .filter((r) => r.kind === kind)
        .map((r) => (
          <tr key={r.template} data-kind={r.kind}>
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
      subtitle={`${YOU}, ${done.length} matches`}
      minW={640}
      toolbar={
        <label className="who">
          <span className="meta">Player</span>
          <select className="select" value={YOU} onChange={() => undefined} aria-label="Player">
            <option>{YOU}</option>
          </select>
        </label>
      }
    >
      <div className="page">
        <p className="lede">What keeps happening across your matches, oldest on the left. Counts come from the detectors; nothing here is a score.</p>
        <div className="table-wrap">
          <table className="data prog">
            <thead>
              <tr>
                <th scope="col">What</th>
                {done.map((m) => (
                  <th scope="col" key={m.ref} className="n">
                    <button type="button" className="link" title={`${mapName(m.map)}, ${m.when}, ${roundsOf(m)} rounds`} onClick={() => s.openStudio(m.id)}>
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
            {(['de_mirage', 'de_anubis'] as MapId[]).map((map) => {
              const zones = DEATH_ZONES.filter((z) => z.map === map);
              const top = Math.max(...zones.map((z) => z.deaths));
              return (
                <div className="zones-col" key={map}>
                  <h3>{mapName(map)}</h3>
                  <Heat map={map} hover={hover} />
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
