"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api/client";
import type { KnowledgeRow, MapZone } from "@/lib/contracts";
import { MAPS } from "@/lib/replay/maps";

const MAP_IDS = ["de_mirage", "de_anubis"] as const;
type MapId = (typeof MAP_IDS)[number];

/** Coach page, Knowledge: what the retriever searches, by callout (doc 29 §2.3, R12). */
export function KnowledgeTab({ admin }: { admin: boolean }) {
  const [map, setMap] = useState<MapId>("de_mirage");
  const [zones, setZones] = useState<MapZone[]>([]);
  const [zone, setZone] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setZone(null);
    api.getZones(map).then(setZones).catch(() => setZones([]));
  }, [map]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .browseKnowledge({ map, zone: zone ?? undefined, q: q.trim() || undefined })
        .then((r) => live && setRows(r))
        .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The API did not answer."));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [map, zone, q, reload]);

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of rows ?? []) for (const z of r.zones) out.set(z.toLowerCase(), (out.get(z.toLowerCase()) ?? 0) + 1);
    return out;
  }, [rows]);

  async function flag(e: FormEvent, id: string) {
    e.preventDefault();
    if (!flagNote.trim()) return;
    await api.flagPassage(id, flagNote.trim()).catch(() => undefined);
    setFlagging(null);
    setFlagNote("");
    setReload((n) => n + 1);
  }

  const meta = MAPS[map];

  return (
    <section className="know">
      <div className="know-side">
        <div className="filters">
          <div className="seg seg-plain" role="group" aria-label="Map">
            {MAP_IDS.map((m) => (
              <button key={m} type="button" aria-pressed={map === m} onClick={() => setMap(m)}>
                {MAPS[m].displayName}
              </button>
            ))}
          </div>
        </div>
        <figure className="know-radar">
          {meta.radarImage ? <img src={meta.radarImage} alt="" width={1024} height={1024} /> : null}
          <svg viewBox="0 0 1024 1024" role="group" aria-label={`${meta.displayName} callouts`}>
            {zones.map((z) => (
              <g key={z.name}>
                {z.polygons.map((poly, i) => (
                  <polygon
                    key={i}
                    points={poly.map((p) => p.join(",")).join(" ")}
                    data-on={zone === z.name || undefined}
                    onClick={() => setZone(zone === z.name ? null : z.name)}
                  >
                    <title>{z.name}</title>
                  </polygon>
                ))}
              </g>
            ))}
          </svg>
          <figcaption className="meta">Click a callout to read what the coach knows about it.</figcaption>
        </figure>
        <ul className="zone-list" aria-label="Callouts">
          {zones.map((z) => (
            <li key={z.name}>
              <button type="button" aria-pressed={zone === z.name} onClick={() => setZone(zone === z.name ? null : z.name)}>
                {z.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="know-main">
        <div className="filters">
          <label className="grow">
            <span className="sr-only">Search the passages</span>
            <input className="input" placeholder="Search, for example window smoke" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {zone ? (
            <button type="button" className="btn btn-line" onClick={() => setZone(null)}>
              {zone}, clear
            </button>
          ) : null}
          {rows ? (
            <span className="meta">
              {rows.length} {rows.length === 1 ? "passage" : "passages"}
              {zone && !counts.get(zone.toLowerCase()) ? " (none name this callout)" : ""}
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="err" role="alert">{error}</p>
        ) : !rows ? (
          <p className="meta">Loading…</p>
        ) : (
          <ul className="passages">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="psg-h">
                  <h3>
                    <span className="mono">{r.id}</span> {r.title}
                  </h3>
                  <span className="meta">
                    {r.source}
                    {r.side !== "any" ? `, ${r.side} side` : ""}
                    {r.cited ? `, cited in ${r.cited} ${r.cited === 1 ? "explanation" : "explanations"}` : ""}
                  </span>
                </div>
                <p>{r.text}</p>
                {r.zones.length ? <p className="meta">Callouts: {r.zones.join(", ")}</p> : null}
                {r.flags.length ? (
                  <p className="psg-flag">Flagged as wrong: {r.flags.join("; ")}</p>
                ) : null}
                {flagging === r.id ? (
                  <form className="flag-form" onSubmit={(e) => void flag(e, r.id)}>
                    <label className="sr-only" htmlFor={`flag-${r.id}`}>
                      What is wrong
                    </label>
                    <input
                      id={`flag-${r.id}`}
                      className="input"
                      autoFocus
                      maxLength={500}
                      placeholder="What is wrong, for example the smoke no longer lands"
                      value={flagNote}
                      onChange={(e) => setFlagNote(e.target.value)}
                    />
                    <button type="submit" className="btn btn-line" disabled={!flagNote.trim()}>
                      Flag
                    </button>
                    <button type="button" className="link" onClick={() => setFlagging(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" className="link small" onClick={() => setFlagging(r.id)}>
                    Flag as wrong
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {admin ? <AddNote map={map} zones={zones} onAdded={() => setReload((n) => n + 1)} /> : null}
      </div>
    </section>
  );
}

function AddNote({ map, zones, onAdded }: { map: MapId; zones: MapZone[]; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [state, setState] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setState("Saving and re-indexing…");
    try {
      const row = await api.addKnowledgeNote({ map, title, zones: picked, text });
      setState(`Added as ${row.id}.`);
      setTitle("");
      setText("");
      setPicked([]);
      onAdded();
    } catch (err) {
      setState(err instanceof Error ? err.message : "Unable to save the note.");
    }
  }

  return (
    <details className="add-note">
      <summary>Add a note (admin)</summary>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Title
          <input className="input" value={title} minLength={3} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Callouts
          <select multiple value={picked} onChange={(e) => setPicked([...e.target.selectedOptions].map((o) => o.value))}>
            {zones.map((z) => (
              <option key={z.name}>{z.name}</option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea rows={4} value={text} minLength={20} maxLength={3000} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="plan-actions">
          <button type="submit" className="btn btn-fill" disabled={title.trim().length < 3 || text.trim().length < 20}>
            Add to the knowledge base
          </button>
          {state ? <span className="meta">{state}</span> : null}
        </div>
      </form>
    </details>
  );
}
