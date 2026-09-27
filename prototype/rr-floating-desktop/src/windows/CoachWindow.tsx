import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api/client';
import type { CoachLanguage, KnowledgeRow, PracticePlan } from '@/lib/contracts';
import { WindowFrame } from '../desktop/WindowFrame';
import { COACH_LANGUAGES } from '../data/languages';
import { MAPS, mapName, type MapId } from '../data/maps';
import { errorText } from '../data/model';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { historyTurns, streamTurn, type Turn } from '../studio/SidePanels';
import { CoachText } from '../ui/CoachText';
import { Segmented } from '../ui/Segmented';
import { ApiTooOld } from '../ui/ApiNotice';

const ACROSS_SUGGESTIONS = [
  'What mistake do I repeat most across my matches?',
  'Where do I die most often, and what should I do instead?',
  'Show me a round where I traded well.',
];

type Tab = 'ask' | 'plan' | 'knowledge';

const LEDE: Record<Tab, string> = {
  ask: 'Ask about your play across every match you have reviewed. Answers cite the moments they come from, and each citation opens that match.',
  plan: 'What to practise next, from the mistakes that keep coming back across your matches.',
  knowledge: 'What the coach reads before it answers: map notes and Liquipedia, by callout.',
};

export function CoachWindow() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('ask');
  const player = s.players.find((p) => p.id === s.playerId) ?? null;
  const onMatchFinding = (matchId: string, fid: string) => s.openStudio(matchId, fid);

  return (
    <WindowFrame
      id="coach"
      subtitle={player ? `Coaching ${player.name}, ${player.matches} ${player.matches === 1 ? 'match' : 'matches'} on ${player.maps.map(mapName).join(' and ')}` : 'No reviewed matches yet'}
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
          {s.players.length > 1 ? (
            <select className="select" aria-label="Player" value={s.playerId ?? ''} onChange={(e) => s.pickPlayer(e.target.value)}>
              {s.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
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
      {tab !== 'knowledge' && !player ? (
        <div className="page">
          <p className="lede">{LEDE[tab]}</p>
          {s.apiTooOld ? <ApiTooOld /> : <p className="empty">Review a match first: add a demo and pick the player, then ask here.</p>}
        </div>
      ) : null}
      {tab === 'ask' && player ? <AskAcross key={player.id} playerId={player.id} name={player.name} onMatchFinding={onMatchFinding} matches={player.matches} lede={LEDE.ask} /> : null}
      {tab === 'plan' && player ? <PlanTab key={player.id} playerId={player.id} onMatchFinding={onMatchFinding} lede={LEDE.plan} /> : null}
      {tab === 'knowledge' ? <KnowledgeTab lede={LEDE.knowledge} /> : null}
    </WindowFrame>
  );
}


function AskAcross({
  playerId,
  name,
  onMatchFinding,
  matches,
  lede,
}: {
  playerId: string;
  name: string;
  onMatchFinding: (matchId: string, fid: string) => void;
  matches: number;
  lede: string;
}) {
  const s = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const next = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns]);

  // Questions asked here before, across matches (A09)
  useEffect(() => {
    let live = true;
    api
      .askHistoryAcross(playerId)
      .then((rows) => {
        if (!live) return;
        const earlier = historyTurns(
          rows.filter((r) => !r.matchId),
          () => next.current++,
        );
        setTurns((ts) => [...earlier, ...ts.filter((x) => !x.earlier)]);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [playerId]);
  const model = s.system?.checks.find((c) => c.name === 'llm')?.state === 'ok' ? s.system.llmModel : 'The coach model';

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setDraft('');
    const id = next.current++;
    setTurns((t) => [...t, { id, q, a: '', pending: true, step: 'Thinking' }]);
    const ctl = new AbortController();
    abort.current = ctl;
    const done = await streamTurn(
      (on, signal) => api.askAcross(playerId, { question: q, language: s.language }, on, signal),
      (step) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, step } : x))),
      ctl.signal,
    );
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...done, pending: false } : x)));
  }

  const asked = new Set(turns.filter((t) => !t.earlier).map((t) => t.q));
  const firstNew = turns.findIndex((x) => !x.earlier);
  const open = ACROSS_SUGGESTIONS.filter((q) => !asked.has(q));

  return (
    <div className="coach-ask">
      <div className="page">
        <p className="lede">{lede}</p>
        <div className="thread" aria-live="polite">
          {turns.length === 0 ? <p className="thread-empty">Questions collect here. With one match the coach can only compare rounds; habits show from the second match on.</p> : null}
          {turns[0]?.earlier ? <p className="thread-sep">Asked before</p> : null}
          {turns.map((x, i) => (
            <div className="qa" key={x.id}>
              {i === firstNew && i > 0 ? <p className="thread-sep">Now</p> : null}
              <div className="qq">{x.q}</div>
              <div className="aa">
                {x.pending ? (
                  <span className="meta thinking">{x.step}</span>
                ) : x.error ? (
                  <span className="err">{x.error}</span>
                ) : (
                  <CoachText text={x.a} matches={x.matches} onMatchFinding={onMatchFinding} />
                )}
              </div>
              {!x.pending && x.source === 'template' ? <div className="aa-note">Written from the findings: the coach model was off or its answer did not pass the checks.</div> : null}
              {!x.pending && x.source === 'agent' ? <div className="aa-note">{model}, checked against your findings.</div> : null}
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>
      <form
        className="ask-bar"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        {open.length ? (
          <ul className="qs" aria-label="Suggested questions">
            {open.map((q) => (
              <li key={q}>
                <button type="button" className="q" onClick={() => void ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ask-ctx">
          <span>{name}</span>
          <span>
            {matches} {matches === 1 ? 'match' : 'matches'}
          </span>
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

function PlanTab({ playerId, onMatchFinding, lede }: { playerId: string; onMatchFinding: (matchId: string, fid: string) => void; lede: string }) {
  const s = useStore();
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    setBusy(true);
    setError(null);
    api
      .getPlan(playerId, s.language)
      .then((p) => !stop && setPlan(p))
      .catch((e) => !stop && setError(errorText(e)))
      .finally(() => !stop && setBusy(false));
    return () => {
      stop = true;
    };
  }, [playerId, s.language]);

  async function renew() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.newPlan(playerId, s.language));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function tick(detector: string, done: boolean) {
    try {
      setPlan(await api.tickPlan(playerId, detector, done, s.language));
    } catch (e) {
      setError(errorText(e));
    }
  }

  const openExample = (ex: string) => {
    const [ref, fid] = ex.split(':');
    const matchId = plan?.matches[ref];
    if (matchId) onMatchFinding(matchId, fid);
  };

  return (
    <div className="page narrow">
      <p className="lede">{lede}</p>
      {error ? <p className="err">{error}</p> : null}
      {busy ? (
        <p className="meta thinking">Writing your practice plan</p>
      ) : plan ? (
        <section className="plan" aria-live="polite">
          <div className="plan-note">
            <p className="expl">
              <CoachText text={plan.text} matches={plan.matches} onMatchFinding={onMatchFinding} />
            </p>
            <p className="aa-note">
              {plan.source === 'agent' ? 'Written by the coach model and checked against your findings.' : 'Written from the findings.'} Plan from{' '}
              {new Date(plan.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
            </p>
          </div>
          {plan.items.length ? (
            <ol className="plan-items">
              {plan.items.map((i, n) => {
                const moved =
                  i.per10Recent != null && i.per10Before != null
                    ? `${i.per10Recent} per 10 rounds in your last 3 matches, ${i.per10Recent < i.per10Before ? 'down from' : i.per10Recent > i.per10Before ? 'up from' : 'the same as'} ${i.per10Before} before.`
                    : null;
                return (
                  <li key={i.detector} data-done={i.done || undefined}>
                    <span className="plan-n num" aria-hidden>
                      {i.done ? '✓' : n + 1}
                    </span>
                    <div className="plan-item-h">
                      <h2>{i.label}</h2>
                      <label className="plan-done">
                        <input type="checkbox" checked={i.done} onChange={(e) => void tick(i.detector, e.target.checked)} />
                        Practised
                      </label>
                    </div>
                    <p className="plan-evidence">
                      In <span className="num">{i.matchesWith}</span> of your last <span className="num">{i.matchesTotal}</span> matches. {moved}{' '}
                      {i.example && plan.matches[i.example.split(':')[0]] ? (
                        <button type="button" className="link" onClick={() => openExample(i.example!)}>
                          Watch the latest one
                        </button>
                      ) : null}
                    </p>
                    {i.drillTitle ? (
                      <div className="plan-drill">
                        <h3>Drill: {i.drillTitle}</h3>
                        <p>{i.drillText}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
      ) : null}
      <div className="plan-actions">
        <button type="button" className="btn" onClick={() => void renew()} disabled={busy}>
          {busy ? 'Writing…' : 'Write a new plan'}
        </button>
        <span className="meta">A new plan counts the matches you have added since and keeps what you ticked.</span>
      </div>
    </div>
  );
}

function KnowledgeTab({ lede }: { lede: string }) {
  const { isAdmin } = useAuth();
  const [map, setMap] = useState<MapId>('de_mirage');
  const [zone, setZone] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    setZone(null);
  }, [map]);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let stop = false;
    api
      .browseKnowledge({ map, zone: zone ?? undefined, q: query || undefined })
      .then((r) => {
        if (stop) return;
        setRows(r);
        setError(null);
      })
      .catch((e) => !stop && setError(errorText(e)));
    return () => {
      stop = true;
    };
  }, [map, zone, query, reload]);

  async function flag(id: string) {
    try {
      await api.flagPassage(id, note.trim());
      setFlagging(null);
      setNote('');
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const zones = MAPS[map].zones;
  const list = rows ?? [];

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
              {rows == null ? 'Loading' : `${list.length} ${list.length === 1 ? 'passage' : 'passages'}`}
              {zone && rows && list.length === 0 ? ' (none name this callout)' : ''}
            </span>
          </div>
          {error ? <p className="err">{error}</p> : null}
          <ul className="passages">
            {list.map((r) => (
              <li key={r.id}>
                <div className="psg-h">
                  <h3>
                    <span className="mono">{r.id}</span>
                    {r.title}
                  </h3>
                  <span className="meta small">
                    {r.source}
                    {r.side && r.side !== 'any' ? `, ${r.side} side` : ''}
                    {r.cited ? `, cited in ${r.cited} ${r.cited === 1 ? 'explanation' : 'explanations'}` : ''}
                  </span>
                </div>
                <p>{r.text}</p>
                {r.zones.length ? <p className="meta small">Callouts: {r.zones.join(', ')}</p> : null}
                {r.flags.length ? <p className="psg-flag">Flagged as wrong: {r.flags.join('; ')}</p> : null}
                {flagging === r.id ? (
                  <form
                    className="flag-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (note.trim()) void flag(r.id);
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
          {isAdmin ? <AddNote map={map} zones={zones.map((z) => z.name)} onAdd={() => setReload((n) => n + 1)} /> : null}
        </div>
      </section>
    </div>
  );
}

function AddNote({ map, zones, onAdd }: { map: MapId; zones: string[]; onAdd: () => void }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [state, setState] = useState<string | null>(null);

  async function add() {
    setState('Saving and re-indexing…');
    try {
      const row = await api.addKnowledgeNote({ map, title: title.trim(), zones: picked, text: text.trim() });
      setState(`Added as ${row.id}.`);
      setTitle('');
      setText('');
      setPicked([]);
      onAdd();
    } catch (e) {
      setState(errorText(e));
    }
  }

  return (
    <details className="add-note">
      <summary>Add a note (admin)</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
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
