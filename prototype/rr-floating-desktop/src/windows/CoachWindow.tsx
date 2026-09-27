import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { ACROSS_STEPS, ACROSS_SUGGESTIONS, COACH_LANGUAGES, answerAcross, planItems, planText, type CoachLanguage } from '../mock/coach';
import { MAPS, type MapId } from '../mock/maps';
import { PASSAGES, SERVED_MODEL, YOU, mapName, matchByRef, type Passage } from '../mock/world';
import { useStore } from '../state/store';
import { CoachText } from '../ui/CoachText';
import { Segmented } from '../ui/Segmented';

type Tab = 'ask' | 'plan' | 'knowledge';

const LEDE: Record<Tab, string> = {
  ask: 'Ask about your play across every match you have reviewed. Answers cite the moments they come from, and each citation opens that match.',
  plan: 'What to practise next, from the mistakes that keep coming back across your matches.',
  knowledge: 'What the coach reads before it answers: map notes and Liquipedia, by callout.',
};

export function CoachWindow() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('ask');
  const done = s.matches.filter((m) => m.status === 'complete' && m.ref);
  const maps = [...new Set(done.map((m) => mapName(m.map)))];
  const onMatchFinding = (ref: string, fid: string) => {
    const m = matchByRef(ref, s.matches);
    if (m) s.openStudio(m.id, fid);
  };

  return (
    <WindowFrame
      id="coach"
      subtitle={`Coaching ${YOU}, ${done.length} matches on ${maps.join(' and ')}`}
      minW={560}
      toolbar={
        <>
          <Segmented<Tab>
            label="Coach"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'ask', label: 'Ask' },
              { id: 'plan', label: 'Plan' },
              { id: 'knowledge', label: 'Knowledge' },
            ]}
          />
          <select className="select" aria-label="Coach language" value={s.language} onChange={(e) => s.setLanguage(e.target.value as CoachLanguage)}>
            {COACH_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </>
      }
    >
      {tab === 'ask' ? <AskAcross onMatchFinding={onMatchFinding} matches={done.length} lede={LEDE.ask} /> : null}
      {tab === 'plan' ? <PlanTab onMatchFinding={onMatchFinding} lede={LEDE.plan} /> : null}
      {tab === 'knowledge' ? <KnowledgeTab lede={LEDE.knowledge} /> : null}
    </WindowFrame>
  );
}

type Turn = { id: number; q: string; a: string; pending: boolean; step: string; source?: 'agent' | 'template' };

function AskAcross({ onMatchFinding, matches, lede }: { onMatchFinding: (ref: string, fid: string) => void; matches: number; lede: string }) {
  const s = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const next = useRef(1);
  const timers = useRef<number[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [turns]);

  function ask(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setDraft('');
    const id = next.current++;
    setTurns((t) => [...t, { id, q, a: '', pending: true, step: ACROSS_STEPS[0] }]);
    ACROSS_STEPS.forEach((st, i) => timers.current.push(window.setTimeout(() => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, step: st } : x))), i * 600)));
    const ans = answerAcross(q);
    timers.current.push(window.setTimeout(() => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, a: ans.text, source: ans.source, pending: false } : x))), ACROSS_STEPS.length * 600 + 250));
  }

  const asked = new Set(turns.map((t) => t.q));
  const open = ACROSS_SUGGESTIONS.filter((q) => !asked.has(q));

  return (
    <div className="coach-ask">
      <div className="page">
        <p className="lede">{lede}</p>
        <div className="thread" aria-live="polite">
          {turns.length === 0 ? <p className="thread-empty">Questions collect here. With one match the coach can only compare rounds; habits show from the second match on.</p> : null}
          {turns.map((x) => (
            <div className="qa" key={x.id}>
              <div className="qq">{x.q}</div>
              <div className="aa">{x.pending ? <span className="meta thinking">{x.step}</span> : <CoachText text={x.a} onMatchFinding={onMatchFinding} />}</div>
              {!x.pending && x.source === 'template' ? <div className="aa-note">Written from the findings: the model&rsquo;s answer did not pass the checks.</div> : null}
              {!x.pending && x.source === 'agent' ? <div className="aa-note">{SERVED_MODEL}, checked against your findings.</div> : null}
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>
      <form
        className="ask-bar"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        {open.length ? (
          <ul className="qs" aria-label="Suggested questions">
            {open.map((q) => (
              <li key={q}>
                <button type="button" className="q" onClick={() => ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ask-ctx">
          <span>{YOU}</span>
          <span>{matches} matches</span>
          <span>{COACH_LANGUAGES.find((l) => l.id === s.language)?.label}</span>
        </p>
        <div className="ask-field">
          <input className="field" placeholder="Ask about your habits across matches" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Question about your matches" />
          <button type="submit" className="btn btn-default" disabled={!draft.trim()}>
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

function PlanTab({ onMatchFinding, lede }: { onMatchFinding: (ref: string, fid: string) => void; lede: string }) {
  const s = useStore();
  const done = s.matches.filter((m) => m.status === 'complete' && m.ref);
  const [createdAt, setCreatedAt] = useState(new Date('2026-09-25T09:00:00'));
  const [busy, setBusy] = useState(false);
  const refs = done.map((m) => m.ref).join();
  const items = useMemo(() => planItems(done), [refs]);

  function renew() {
    setBusy(true);
    window.setTimeout(() => {
      setCreatedAt(new Date());
      setBusy(false);
    }, 1300);
  }

  return (
    <div className="page narrow">
      <p className="lede">{lede}</p>
      {busy ? (
        <p className="meta thinking">Writing your practice plan</p>
      ) : (
        <section className="plan" aria-live="polite">
          <div className="plan-note">
            <p className="expl">
              <CoachText text={planText(items)} onMatchFinding={onMatchFinding} />
            </p>
            <p className="aa-note">
              Written by {SERVED_MODEL} and checked against your findings. Plan from {createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
            </p>
          </div>
          <ol className="plan-items">
            {items.map((i, n) => {
              const doneTick = s.ticks[i.detector] ?? false;
              const moved =
                i.per10Recent != null && i.per10Before != null
                  ? `${i.per10Recent} per 10 rounds in your last 3 matches, ${i.per10Recent < i.per10Before ? 'down from' : i.per10Recent > i.per10Before ? 'up from' : 'the same as'} ${i.per10Before} before.`
                  : null;
              return (
                <li key={i.detector} data-done={doneTick || undefined}>
                  <span className="plan-n num" aria-hidden>
                    {doneTick ? '✓' : n + 1}
                  </span>
                  <div className="plan-item-h">
                    <h2>{i.label}</h2>
                    <label className="plan-done">
                      <input type="checkbox" checked={doneTick} onChange={(e) => s.setTick(i.detector, e.target.checked)} />
                      Practised
                    </label>
                  </div>
                  <p className="plan-evidence">
                    In <span className="num">{i.matchesWith}</span> of your last <span className="num">{i.matchesTotal}</span> matches. {moved}{' '}
                    {i.example ? (
                      <button type="button" className="link" onClick={() => onMatchFinding(...(i.example!.split(':') as [string, string]))}>
                        Watch the latest one
                      </button>
                    ) : null}
                  </p>
                  <div className="plan-drill">
                    <h3>Drill: {i.drillTitle}</h3>
                    <p>{i.drillText}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <div className="plan-actions">
        <button type="button" className="btn" onClick={renew} disabled={busy}>
          {busy ? 'Writing…' : 'Write a new plan'}
        </button>
        <span className="meta">A new plan counts the matches you have added since and keeps what you ticked.</span>
      </div>
    </div>
  );
}

function KnowledgeTab({ lede }: { lede: string }) {
  const s = useStore();
  const [map, setMap] = useState<MapId>('de_mirage');
  const [zone, setZone] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [extra, setExtra] = useState<Passage[]>([]);
  const [flags, setFlags] = useState<Record<string, string[]>>({ K2: ['The smoke line changed with the last map update'] });
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => setZone(null), [map]);

  const rows = [...PASSAGES, ...extra].filter(
    (p) =>
      p.map === map &&
      (!zone || p.zones.includes(zone)) &&
      (!q.trim() || `${p.title} ${p.text} ${p.zones.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const zones = MAPS[map].zones;

  return (
    <div className="page">
      <p className="lede">{lede}</p>
      <section className="know">
        <div className="know-side">
          <Segmented<MapId>
            label="Map"
            value={map}
            onChange={setMap}
            options={[
              { id: 'de_mirage', label: 'Mirage' },
              { id: 'de_anubis', label: 'Anubis' },
            ]}
          />
          <figure className="map-fig">
            <img src={MAPS[map].radar} alt="" />
            <svg viewBox="0 0 1024 1024" role="group" aria-label={`${mapName(map)} callouts`}>
              {zones.map((z) =>
                z.polygons.map((poly, i) => (
                  <polygon key={`${z.name}${i}`} points={poly.map((p) => p.join(',')).join(' ')} data-on={zone === z.name || undefined} onClick={() => setZone(zone === z.name ? null : z.name)}>
                    <title>{z.name}</title>
                  </polygon>
                )),
              )}
            </svg>
            <figcaption>Click a callout to read what the coach knows about it.</figcaption>
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
        <div className="sec">
          <div className="filters">
            <label className="grow">
              <span className="sr-only">Search the passages</span>
              <input className="field" placeholder="Search, for example window smoke" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {zone ? (
              <button type="button" className="btn" onClick={() => setZone(null)}>
                {zone}, clear
              </button>
            ) : null}
            <span className="meta">
              {rows.length} {rows.length === 1 ? 'passage' : 'passages'}
              {zone && rows.length === 0 ? ' (none name this callout)' : ''}
            </span>
          </div>
          <ul className="passages">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="psg-h">
                  <h3>
                    <span className="mono">{r.id}</span>
                    {r.title}
                  </h3>
                  <span className="meta small">
                    {r.source}
                    {r.side !== 'any' ? `, ${r.side} side` : ''}
                    {r.cited ? `, cited in ${r.cited} ${r.cited === 1 ? 'explanation' : 'explanations'}` : ''}
                  </span>
                </div>
                <p>{r.text}</p>
                {r.zones.length ? <p className="meta small">Callouts: {r.zones.join(', ')}</p> : null}
                {flags[r.id]?.length ? <p className="psg-flag">Flagged as wrong: {flags[r.id].join('; ')}</p> : null}
                {flagging === r.id ? (
                  <form
                    className="flag-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!note.trim()) return;
                      setFlags((f) => ({ ...f, [r.id]: [...(f[r.id] ?? []), note.trim()] }));
                      setFlagging(null);
                      setNote('');
                    }}
                  >
                    <input className="field" autoFocus maxLength={500} placeholder="What is wrong, for example the smoke no longer lands" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What is wrong" />
                    <button type="submit" className="btn" disabled={!note.trim()}>
                      Flag
                    </button>
                    <button type="button" className="link" onClick={() => setFlagging(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setFlagging(r.id)}>
                    Flag as wrong
                  </button>
                )}
              </li>
            ))}
          </ul>
          {s.lab ? <AddNote map={map} zones={zones.map((z) => z.name)} onAdd={(p) => setExtra((x) => [...x, p])} count={PASSAGES.length + extra.length} /> : null}
        </div>
      </section>
    </div>
  );
}

function AddNote({ map, zones, onAdd, count }: { map: MapId; zones: string[]; onAdd: (p: Passage) => void; count: number }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [state, setState] = useState<string | null>(null);
  return (
    <details className="add-note">
      <summary>Add a note (admin)</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setState('Saving and re-indexing…');
          window.setTimeout(() => {
            const id = `K${count + 1}`;
            onAdd({ id, map, title, source: 'Admin note', side: 'any', zones: picked, text, cited: 0 });
            setState(`Added as ${id}.`);
            setTitle('');
            setText('');
            setPicked([]);
          }, 700);
        }}
      >
        <label>
          Title
          <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Callouts
          <select className="select" multiple size={4} value={picked} onChange={(e) => setPicked([...e.target.selectedOptions].map((o) => o.value))} style={{ height: 'auto' }}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea className="field" rows={4} value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="plan-actions">
          <button type="submit" className="btn btn-default" disabled={title.trim().length < 3 || text.trim().length < 20}>
            Add to the knowledge base
          </button>
          {state ? <span className="meta">{state}</span> : null}
        </div>
      </form>
    </details>
  );
}
