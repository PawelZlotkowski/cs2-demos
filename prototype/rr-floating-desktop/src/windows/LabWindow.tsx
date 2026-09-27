import { useMemo, useState } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { AB_PAIRS, JOBS, RUNS, SOURCES, jobLabel, modelRows, type Run } from '../mock/lab';
import { FINDINGS, detectorOf, findingLabel, mapName, matchById, momentsFor } from '../mock/world';
import { useStore } from '../state/store';
import { Segmented } from '../ui/Segmented';
import { clock } from '../ui/time';

type Tab = 'runs' | 'labels' | 'evaluation' | 'dataset';

const LEDES: Record<Tab, string> = {
  runs: 'Every coach run on this computer: which tools the model called, which passages it read, and whether its text passed the verifier.',
  labels: "Mark each finding right or wrong, add what the detectors missed, and pick your own six moments without seeing the coach's. Saved in the data/labels format.",
  evaluation: "Each model's runs from the traces, and a blind vote between two models' answers to the same question.",
  dataset: 'Coach runs that passed the verifier on the first try, one at a time. Accepted and edited ones become the fine-tuning set.',
};

function when(d: Date) {
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function LabWindow() {
  const [tab, setTab] = useState<Tab>('runs');
  return (
    <WindowFrame
      id="lab"
      subtitle="Owner only · RR_LAB_ENABLED=1"
      minW={720}
      toolbar={
        <Segmented<Tab>
          label="Lab"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'runs', label: 'Runs' },
            { id: 'labels', label: 'Labels' },
            { id: 'evaluation', label: 'Evaluation' },
            { id: 'dataset', label: 'Dataset' },
          ]}
        />
      }
    >
      <div className="page">
        <p className="lede">{LEDES[tab]}</p>
        {tab === 'runs' ? <RunsTab /> : tab === 'labels' ? <LabelsTab /> : tab === 'evaluation' ? <EvalTab /> : <DatasetTab />}
      </div>
    </WindowFrame>
  );
}

function Verdict({ r }: { r: Run }) {
  if (r.verifierOk === null) return <span className="meta">No check</span>;
  if (r.verifierOk) return <span>Passed{r.repaired ? ' after one repair' : ''}</span>;
  return <span className="verdict-fail">Failed, used the {r.source === 'ranker' ? 'ranker' : 'templates'}</span>;
}

const PAGE = 12;

function RunsTab() {
  const s = useStore();
  const [job, setJob] = useState('');
  const [source, setSource] = useState('');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = RUNS.filter((r) => (!job || r.job === job) && (!source || r.source === source));
  const page = rows.slice(offset, offset + PAGE);
  const detail = RUNS.find((r) => r.id === openId);

  return (
    <section className="sec">
      <div className="filters">
        <select className="select" aria-label="Job" value={job} onChange={(e) => (setJob(e.target.value), setOffset(0))}>
          {JOBS.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Result" value={source} onChange={(e) => (setSource(e.target.value), setOffset(0))}>
          {SOURCES.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
        <span className="meta">
          {rows.length} {rows.length === 1 ? 'run' : 'runs'}
        </span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Job</th>
              <th>Model</th>
              <th className="n">Tools</th>
              <th className="n">Seconds</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {page.map((r) => (
              <tr key={r.id} aria-selected={openId === r.id}>
                <td>
                  <button type="button" className="row-open num" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    {when(r.ts)}
                  </button>
                </td>
                <td>
                  {jobLabel(r.job)}
                  {r.lang ? <span className="meta"> {r.lang}</span> : null}
                </td>
                <td className="mono">{r.model ?? 'none'}</td>
                <td className="n num">{r.toolCalls}</td>
                <td className="n num">{r.latencyS?.toFixed(1) ?? ''}</td>
                <td>
                  <Verdict r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE ? (
        <div className="filters">
          <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </button>
          <span className="meta num">
            {offset + 1} to {Math.min(offset + PAGE, rows.length)}
          </span>
          <button type="button" className="btn" disabled={offset + PAGE >= rows.length} onClick={() => setOffset(offset + PAGE)}>
            Older
          </button>
        </div>
      ) : null}
      {detail ? (
        <article className="run-detail" aria-label="Run details">
          <header>
            <h2>
              {jobLabel(detail.job)} <span className="meta">{when(detail.ts)}</span>
            </h2>
            <button type="button" className="btn" onClick={() => setOpenId(null)}>
              Close
            </button>
          </header>
          <dl className="facts">
            <div>
              <dt>Model</dt>
              <dd className="mono">{detail.model ?? 'none'}</dd>
            </div>
            {detail.matchId ? (
              <div>
                <dt>Match</dt>
                <dd>
                  <button type="button" className="link" onClick={() => s.openStudio(detail.matchId!)}>
                    Open {mapName(matchById(detail.matchId)!.map)} in the Studio
                  </button>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Passages read</dt>
              <dd>{detail.knowledgeIds.length ? detail.knowledgeIds.join(', ') : 'none'}</dd>
            </div>
          </dl>
          <h3>Tool calls</h3>
          {detail.steps.length ? (
            <ol className="steps">
              {detail.steps.map((st, i) => (
                <li key={i}>
                  <b className="mono">{st.tool}</b>
                  <span className="mono args">{JSON.stringify(st.args)}</span>
                  <span className="meta num">
                    {st.ms} ms, {st.resultBytes} bytes
                  </span>
                  {st.error ? <span className="verdict-fail"> {st.error}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="meta">No tool calls in this run.</p>
          )}
          <h3>Verifier</h3>
          {detail.verifierErrors.length ? (
            <ul className="v-errors">
              {detail.verifierErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <p className="meta">{detail.verifierOk === null ? 'No model text to check.' : 'No errors.'}</p>
          )}
          {detail.output ? (
            <>
              <h3>Model output</h3>
              <pre className="out">{detail.output}</pre>
            </>
          ) : null}
          {detail.fallback ? (
            <>
              <h3>Shown instead</h3>
              <pre className="out">{detail.fallback}</pre>
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

type Mark = 'correct' | 'wrong' | null;
type Missed = { round: number; t: number; kind: 'mistake' | 'good'; detector: string };

function LabelsTab() {
  const s = useStore();
  const done = s.matches.filter((m) => m.status === 'complete' && FINDINGS[m.id]);
  const [matchId, setMatchId] = useState(done[0]?.id ?? '');
  const [name, setName] = useState('pawel');
  const [marks, setMarks] = useState<Record<string, Mark>>({ 'm5:F3': 'correct', 'm5:F4': 'correct', 'm5:F6': 'wrong' });
  const [missed, setMissed] = useState<Record<string, Missed[]>>({ m5: [{ round: 12, t: 41, kind: 'mistake', detector: 'dry_peek' }] });
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<Missed>({ round: 1, t: 30, kind: 'mistake', detector: 'untraded_death' });

  const fs = FINDINGS[matchId] ?? [];
  const mine = picks[matchId] ?? [];
  const coach = momentsFor(matchId).map((m) => m.findingIds[0]);
  const overlap = mine.filter((id) => coach.includes(id)).length;
  const ndcg = useMemo(() => {
    if (mine.length < 6) return null;
    const rel = new Set(mine);
    const dcg = coach.reduce((sum, id, i) => sum + (rel.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
    const ideal = Array.from({ length: Math.min(6, coach.length) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
    return ideal ? dcg / ideal : 0;
  }, [mine, coach]);

  const quality = useMemo(() => {
    const rows = new Map<string, { correct: number; wrong: number; missed: number }>();
    for (const m of done)
      for (const f of FINDINGS[m.id] ?? []) {
        const v = marks[`${m.id}:${f.id}`];
        const d = detectorOf(f.template);
        const r = rows.get(d) ?? { correct: 0, wrong: 0, missed: 0 };
        if (v === 'correct') r.correct++;
        if (v === 'wrong') r.wrong++;
        rows.set(d, r);
      }
    for (const list of Object.values(missed))
      for (const x of list) {
        const r = rows.get(x.detector) ?? { correct: 0, wrong: 0, missed: 0 };
        r.missed++;
        rows.set(x.detector, r);
      }
    return [...rows.entries()].filter(([, r]) => r.correct + r.wrong + r.missed > 0);
  }, [marks, missed, done]);

  const detectors = [...new Set(Object.values(FINDINGS).flat().map((f) => detectorOf(f.template)))];

  return (
    <>
      <div className="filters">
        <label className="who">
          <span className="meta">Match</span>
          <select className="select" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            {done.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ref} · {mapName(m.map)} {m.us}–{m.them}
              </option>
            ))}
          </select>
        </label>
        <label className="who">
          <span className="meta">Your name</span>
          <input className="field" value={name} placeholder="Your name, for example pawel" onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="meta">
          Saves to <code>data/labels/{matchId}.{name || 'you'}.json</code>
        </span>
      </div>

      <section className="sec">
        <div className="sec-h">
          <h2>Findings</h2>
          <span className="meta">{fs.filter((f) => marks[`${matchId}:${f.id}`]).length} of {fs.length} labelled</span>
        </div>
        <div className="group">
          {fs.map((f) => {
            const k = `${matchId}:${f.id}`;
            return (
              <div className="label-row" key={f.id}>
                <span className="num meta">
                  R{f.round} {clock(f.t)}
                </span>
                <span className="what">
                  <i className={`g g-${f.kind}`} aria-hidden />
                  <b>{findingLabel(f.template)}</b>
                  <span className="meta">{f.summary}</span>
                </span>
                <Segmented<'correct' | 'wrong' | 'none'>
                  label={`Label ${f.id}`}
                  value={marks[k] ?? 'none'}
                  onChange={(v) => setMarks((m) => ({ ...m, [k]: v === 'none' ? null : v }))}
                  options={[
                    { id: 'none', label: '–' },
                    { id: 'correct', label: 'Correct' },
                    { id: 'wrong', label: 'Wrong' },
                  ]}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Missed by the detectors</h2>
        </div>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setMissed((m) => ({ ...m, [matchId]: [...(m[matchId] ?? []), form] }));
          }}
        >
          <input className="field" type="number" min={1} style={{ width: 70 }} aria-label="Round" value={form.round} onChange={(e) => setForm({ ...form, round: Number(e.target.value) })} />
          <input className="field" type="number" min={0} style={{ width: 120 }} placeholder="Round clock, seconds" aria-label="Round clock, seconds" value={form.t} onChange={(e) => setForm({ ...form, t: Number(e.target.value) })} />
          <select className="select" aria-label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Missed['kind'] })}>
            <option value="mistake">Mistake</option>
            <option value="good">Good play</option>
          </select>
          <select className="select" aria-label="Detector" value={form.detector} onChange={(e) => setForm({ ...form, detector: e.target.value })}>
            {detectors.map((d) => (
              <option key={d} value={d}>
                {findingLabel(d)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn">
            Add
          </button>
        </form>
        {(missed[matchId] ?? []).length ? (
          <ul className="round-list">
            {(missed[matchId] ?? []).map((x, i) => (
              <li key={i}>
                <span className="meta num">
                  R{x.round} {clock(x.t)} · {x.kind === 'mistake' ? 'Mistake' : 'Good play'}, {findingLabel(x.detector)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">No labels yet.</p>
        )}
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Your six moments</h2>
          <span className="meta">
            {mine.length} of 6 picked{mine.length < 6 ? "; the coach's picks show when you have six" : ''}
          </span>
        </div>
        <div className="group">
          {fs.map((f) => (
            <label className="label-row" key={f.id}>
              <span className="num meta">
                R{f.round} {clock(f.t)}
              </span>
              <span className="what">
                <i className={`g g-${f.kind}`} aria-hidden />
                {findingLabel(f.template)}, {f.zone}
                {mine.length >= 6 && coach.includes(f.id) ? <span className="pov-tag">Coach</span> : null}
              </span>
              <input
                type="checkbox"
                checked={mine.includes(f.id)}
                disabled={!mine.includes(f.id) && mine.length >= 6}
                onChange={(e) => setPicks((p) => ({ ...p, [matchId]: e.target.checked ? [...mine, f.id] : mine.filter((x) => x !== f.id) }))}
              />
            </label>
          ))}
        </div>
        {ndcg != null ? (
          <dl className="facts">
            <div>
              <dt>Coach picks you also picked</dt>
              <dd className="num">
                {overlap} of 6
              </dd>
            </div>
            <div>
              <dt>Overlap@6</dt>
              <dd className="num">{(overlap / 6).toFixed(2)}</dd>
            </div>
            <div>
              <dt>NDCG@6 of the coach&rsquo;s order</dt>
              <dd className="num">{ndcg.toFixed(2)}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Detector quality</h2>
          <span className="meta">Across every labelled match</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Detector</th>
                <th className="n">Correct</th>
                <th className="n">Wrong</th>
                <th className="n">Missed</th>
                <th className="n">Precision</th>
                <th className="n">Recall</th>
              </tr>
            </thead>
            <tbody>
              {quality.map(([d, r]) => (
                <tr key={d}>
                  <td>{findingLabel(d)}</td>
                  <td className="n num">{r.correct}</td>
                  <td className="n num">{r.wrong}</td>
                  <td className="n num">{r.missed}</td>
                  <td className="n num">{r.correct + r.wrong ? (r.correct / (r.correct + r.wrong)).toFixed(2) : '–'}</td>
                  <td className="n num">{r.correct + r.missed ? (r.correct / (r.correct + r.missed)).toFixed(2) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function EvalTab() {
  const models = modelRows(RUNS);
  const [pair, setPair] = useState(0);
  const [votes, setVotes] = useState<Record<string, 'a' | 'b' | 'same'>>({});
  const p = AB_PAIRS[pair];
  const flip = pair % 2 === 1;
  const left = flip ? p.b : p.a;
  const right = flip ? p.a : p.b;
  const voted = votes[p.id];
  const tally = Object.entries(votes).reduce<Record<string, number>>((acc, [id, v]) => {
    const pr = AB_PAIRS.find((x) => x.id === id)!;
    const who = v === 'same' ? 'Same' : v === 'a' ? pr.a.model : pr.b.model;
    acc[who] = (acc[who] ?? 0) + 1;
    return acc;
  }, {});
  const langs = ['en', 'pl'].map((l) => {
    const rs = RUNS.filter((r) => r.lang === l);
    return { l, runs: rs.length, ok: rs.filter((r) => r.verifierOk).length };
  });

  return (
    <>
      <section className="sec">
        <div className="sec-h">
          <h2>Models on this computer</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Model</th>
                <th className="n">Runs</th>
                <th className="n">Verified</th>
                <th className="n">Repaired</th>
                <th className="n">Fell back</th>
                <th className="n">Median s</th>
                <th className="n">Tool calls, failed</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model}>
                  <td className="mono">{m.model}</td>
                  <td className="n num">{m.runs}</td>
                  <td className="n num">{m.verified}</td>
                  <td className="n num">{m.repaired}</td>
                  <td className="n num">{m.fellBack}</td>
                  <td className="n num">{m.median.toFixed(1)}</td>
                  <td className="n num">
                    {m.toolCalls}, {m.toolFailed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h2>By language</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Language</th>
                <th className="n">Runs</th>
                <th className="n">Verified</th>
              </tr>
            </thead>
            <tbody>
              {langs.map((l) => (
                <tr key={l.l}>
                  <td>{l.l === 'en' ? 'English' : 'Polski'}</td>
                  <td className="n num">{l.runs}</td>
                  <td className="n num">{l.ok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h2>Blind A/B</h2>
          <span className="meta num">
            Pair {pair + 1} of {AB_PAIRS.length}
            {Object.keys(tally).length ? ` · ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}
          </span>
        </div>
        <p>
          <b>{p.question}</b>
        </p>
        <div className="ab">
          {[left, right].map((x, i) => (
            <div key={i}>
              <h3>{voted ? x.model : i === 0 ? 'Answer 1' : 'Answer 2'}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
        <div className="ab-vote">
          <button type="button" className="btn" disabled={!!voted} onClick={() => setVotes((v) => ({ ...v, [p.id]: flip ? 'b' : 'a' }))}>
            Answer 1 is better
          </button>
          <button type="button" className="btn" disabled={!!voted} onClick={() => setVotes((v) => ({ ...v, [p.id]: flip ? 'a' : 'b' }))}>
            Answer 2 is better
          </button>
          <button type="button" className="btn" disabled={!!voted} onClick={() => setVotes((v) => ({ ...v, [p.id]: 'same' }))}>
            About the same
          </button>
          {voted ? (
            pair < AB_PAIRS.length - 1 ? (
              <button type="button" className="btn btn-default" onClick={() => setPair(pair + 1)}>
                Next pair
              </button>
            ) : (
              <span className="meta">Every pair has a vote. New pairs appear as both models answer more.</span>
            )
          ) : null}
        </div>
      </section>
    </>
  );
}

function DatasetTab() {
  const queue = RUNS.filter((r) => r.verifierOk && !r.repaired && r.source === 'agent' && r.output);
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(queue[0]?.output ?? '');
  const [counts, setCounts] = useState({ accepted: 12, edited: 3, rejected: 5 });
  const r = queue[i];

  function decide(kind: 'accepted' | 'edited' | 'rejected') {
    setCounts((c) => ({ ...c, [kind]: c[kind] + 1 }));
    setEditing(false);
    const n = i + 1;
    setI(n);
    setText(queue[n]?.output ?? '');
  }

  return (
    <>
      <p className="meta num">
        {counts.accepted} accepted, {counts.edited} edited, {counts.rejected} rejected · {Math.max(0, queue.length - i)} left to review
      </p>
      {!r ? (
        <p className="empty">Nothing left to review. New runs arrive as the coach model answers.</p>
      ) : (
        <section className="sec">
          <div className="sec-h">
            <h2>
              {jobLabel(r.job)} <span className="meta">{when(r.ts)}</span>
            </h2>
            <span className="mono meta">{r.model}</span>
          </div>
          <h3 className="round-h">What the model was given</h3>
          <pre className="out">{r.prompt}</pre>
          <h3 className="round-h">Its answer</h3>
          {editing ? <textarea className="field" rows={5} value={text} onChange={(e) => setText(e.target.value)} /> : <pre className="out">{text}</pre>}
          <div className="ds-actions">
            <button type="button" className="btn btn-default" onClick={() => decide(editing ? 'edited' : 'accepted')}>
              {editing ? 'Save edit' : 'Accept'}
            </button>
            {!editing ? (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => decide('rejected')}>
              Reject
            </button>
          </div>
        </section>
      )}
    </>
  );
}
