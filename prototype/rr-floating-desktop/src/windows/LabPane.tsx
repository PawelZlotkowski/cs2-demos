import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { ABPair, DatasetPage, EvalSummary, Finding as ApiFinding, LabelsSummary, PickScore, SelectedMoment, TraceDetail, TracePage, TraceSummary } from '@/lib/contracts';
import { errorText, findingLabel, fromFinding, type Finding } from '../data/model';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { PaneHead } from '../ui/kit';
import { Segmented } from '../ui/Segmented';
import { clock } from '../ui/time';

const JOBS = [
  { id: '', label: 'All jobs' },
  { id: 'select_moments', label: 'Moment selection' },
  { id: 'explain', label: 'Explanations' },
  { id: 'summary', label: 'Match summary' },
  { id: 'wrapup', label: 'Wrap-up' },
  { id: 'ask', label: 'Ask tab' },
  { id: 'ask_across', label: 'Coach page' },
  { id: 'practice_plan', label: 'Practice plan' },
];

const SOURCES = [
  { id: '', label: 'Any result' },
  { id: 'agent', label: 'Model, verified' },
  { id: 'template', label: 'Fell back to templates' },
  { id: 'ranker', label: 'Fell back to the ranker' },
];

function jobLabel(job: string) {
  return JOBS.find((j) => j.id === job)?.label ?? job.replace(/_/g, ' ');
}

const DETECTORS = [
  'untraded_death',
  'shot_while_moving',
  'unused_utility',
  'dry_peek',
  'team_flash',
  'economy_mismatch',
  'late_rotation',
  'repeated_death_zone',
  'opening_duel',
  'good_plays',
];

type Tab = 'runs' | 'labels' | 'evaluation' | 'dataset';

const LEDES: Record<Tab, string> = {
  runs: 'Every coach run on this computer: which tools the model called, which passages it read, and whether its text passed the verifier.',
  labels: "Mark each finding right or wrong, add what the detectors missed, and pick your own six moments without seeing the coach's. Saved in the data/labels format.",
  evaluation: "Each model's runs from the traces, and a blind vote between two models' answers to the same question.",
  dataset: 'Coach runs that passed the verifier on the first try, one at a time. Accepted and edited ones become the fine-tuning set.',
};

function when(ts: string) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The Lab, as the Admin window's Lab section (doc 30 §5.2). Admins and labellers; the API checks the role. */
export function LabPane() {
  const [tab, setTab] = useState<Tab>('runs');
  const [on, setOn] = useState<boolean | null>(null);
  const { isAdmin } = useAuth();
  const s = useStore();
  useEffect(() => {
    api
      .features()
      .then((f) => setOn(f.lab))
      .catch(() => setOn(false));
  }, []);
  return (
    <div className="pane">
      <PaneHead title="Lab" lede={LEDES[tab]}>
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
      </PaneHead>
      {on === false ? (
        <p className="empty">
          The Lab is switched off.{' '}
          {isAdmin ? (
            <>
              Turn it on under{' '}
              <button type="button" className="link" onClick={() => s.openAdmin('settings')}>
                Settings
              </button>{' '}
              (Lab), or add <code>RR_LAB_ENABLED=1</code> to <code>apps/api/.env</code>.
            </>
          ) : (
            'Ask the admin to turn it on.'
          )}
        </p>
      ) : on == null ? (
        <p className="meta thinking">Checking the API</p>
      ) : tab === 'runs' ? (
        <RunsTab />
      ) : tab === 'labels' ? (
        <LabelsTab />
      ) : tab === 'evaluation' ? (
        <EvalTab />
      ) : (
        <DatasetTab />
      )}
    </div>
  );
}

function Verdict({ r }: { r: TraceSummary }) {
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
  const [page, setPage] = useState<TracePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);

  useEffect(() => {
    let stop = false;
    api
      .getTraces({ job: job || undefined, source: source || undefined, limit: PAGE, offset })
      .then((p) => {
        if (stop) return;
        setPage(p);
        setError(null);
      })
      .catch((e) => !stop && setError(errorText(e)));
    return () => {
      stop = true;
    };
  }, [job, source, offset]);

  useEffect(() => {
    setDetail(null);
    if (!openId) return;
    api
      .getTrace(openId)
      .then(setDetail)
      .catch((e) => setError(errorText(e)));
  }, [openId]);

  const rows = page?.items ?? [];
  const total = page?.total ?? 0;
  const match = detail?.matchId ? s.matches.find((m) => m.id === detail.matchId) : null;

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
          {total} {total === 1 ? 'run' : 'runs'}
        </span>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {page && !rows.length ? <p className="empty">No coach runs logged yet. Runs appear here as the coach reviews matches and answers questions.</p> : null}
      {rows.length ? (
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
              {rows.map((r) => (
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
      ) : null}
      {total > PAGE ? (
        <div className="filters">
          <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </button>
          <span className="meta num">
            {offset + 1} to {Math.min(offset + PAGE, total)}
          </span>
          <button type="button" className="btn" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Older
          </button>
        </div>
      ) : null}
      {openId && !detail ? <p className="meta thinking">Loading the run</p> : null}
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
                    Open {match ? `${match.mapLabel} ${match.score}` : 'the match'} in the Studio
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

type Mark = 'correct' | 'wrong' | 'unsure';
type Missed = { round: number; t: number; detector: string };

const NAME_RE = /^[A-Za-z0-9_]{1,40}$/;

function LabelsTab() {
  const s = useStore();
  const ready = s.matches.filter((m) => m.status === 'complete' && m.playerId && m.moments > 0);
  const [matchId, setMatchId] = useState(ready[0]?.id ?? '');
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem('rr.labeller') ?? 'pawel';
    } catch {
      return 'pawel';
    }
  });
  const match = ready.find((m) => m.id === matchId) ?? ready[0];
  const pid = match?.playerId ?? null;
  const valid = NAME_RE.test(name);
  const [fs, setFs] = useState<Finding[]>([]);
  const [coach, setCoach] = useState<SelectedMoment[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [missed, setMissed] = useState<Missed[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [score, setScore] = useState<PickScore | null>(null);
  const [summary, setSummary] = useState<LabelsSummary | null>(null);
  const [form, setForm] = useState<Missed>({ round: 1, t: 30, detector: DETECTORS[0] });
  const [state, setState] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      window.localStorage.setItem('rr.labeller', name);
    } catch {
      /* storage blocked */
    }
  }, [name]);

  useEffect(() => {
    if (!match || !pid || !valid) return;
    let stop = false;
    setState(null);
    setDirty(new Set());
    Promise.all([
      api.getFindings(match.id, pid),
      api.getRoundLabels(match.id, pid, name),
      api.getPlayerMoments(match.id, pid),
      api.getPicks(match.id, pid, name),
    ])
      .then(([findings, labels, moments, saved]) => {
        if (stop) return;
        setFs(findings.map((f: ApiFinding) => fromFinding(f)));
        setMarks(Object.fromEntries(labels.flatMap((l) => l.findings.map((v) => [v.findingId, v.verdict as Mark]))));
        setMissed(labels.flatMap((l) => l.missed.map((m) => ({ round: l.round, t: m.t, detector: m.detector }))));
        setCoach(moments);
        const picked = (saved.picks?.picks ?? [])
          .map((p) => findings.find((f) => f.round === p.round && f.t >= p.t0 && f.t <= p.t1)?.id)
          .filter((x): x is string => !!x);
        setPicks(picked);
        setScore(saved.score);
      })
      .catch((e) => !stop && setState(errorText(e)));
    return () => {
      stop = true;
    };
  }, [match?.id, pid, name, valid]);

  useEffect(() => {
    api
      .getLabelsSummary(valid ? name : undefined)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [name, valid, state]);

  function touch(round: number) {
    setDirty((d) => new Set(d).add(round));
  }

  async function saveLabels() {
    if (!match || !pid) return;
    setState('Saving…');
    try {
      for (const round of [...dirty].sort((a, b) => a - b)) {
        await api.saveRoundLabel({
          matchId: match.id,
          map: match.map ?? 'de_mirage',
          playerId: pid,
          round,
          labeller: name,
          findings: fs.filter((f) => f.round === round && marks[f.id]).map((f) => ({ findingId: f.id, detector: f.detector, t: f.t, verdict: marks[f.id] })),
          missed: missed.filter((m) => m.round === round).map((m) => ({ detector: m.detector, t: m.t })),
        });
      }
      setDirty(new Set());
      setState(`Saved to data/labels as ${name}.`);
    } catch (e) {
      setState(errorText(e));
    }
  }

  async function savePicks() {
    if (!match || !pid) return;
    try {
      const rows = picks
        .map((id) => fs.find((f) => f.id === id))
        .filter((f): f is Finding => !!f)
        .map((f) => ({ round: f.round, t0: Math.max(0, f.t - 5), t1: f.t + 3, kind: f.kind === 'strength' ? ('good' as const) : ('mistake' as const) }));
      const out = await api.savePicks({ matchId: match.id, playerId: pid, labeller: name, picks: rows });
      setScore(out.score);
    } catch (e) {
      setState(errorText(e));
    }
  }

  const coachLeads = new Set(coach.map((m) => m.findingIds[0]));
  const quality = Object.entries(summary?.score ?? {});

  if (!ready.length) return <p className="empty">No reviewed match yet. Pick a player in a match first.</p>;

  return (
    <>
      <div className="filters">
        <label className="who">
          <span className="meta">Match</span>
          <select className="select" value={match?.id ?? ''} onChange={(e) => setMatchId(e.target.value)}>
            {ready.map((m) => (
              <option key={m.id} value={m.id}>
                {m.mapLabel} {m.score} · {m.playerName} · {m.when}
              </option>
            ))}
          </select>
        </label>
        <label className="who">
          <span className="meta">Your name</span>
          <input className="field" value={name} maxLength={40} placeholder="Your name, for example pawel" aria-invalid={!valid} onChange={(e) => setName(e.target.value.trim())} />
        </label>
        <span className="meta">Saves to data/labels, one file per labeller</span>
      </div>
      {!valid ? <p className="empty">Type your name first (letters, digits and _). Labels are saved per person.</p> : null}
      {state ? <p className={state.startsWith('Saved') || state === 'Saving…' ? 'meta' : 'err'}>{state}</p> : null}

      <section className="sec">
        <div className="sec-h">
          <h2>Findings</h2>
          <span className="meta">
            {fs.filter((f) => marks[f.id]).length} of {fs.length} labelled
          </span>
        </div>
        <div className="group">
          {fs.map((f) => (
            <div className="label-row" key={f.id}>
              <span className="num meta">
                R{f.round} {clock(f.t)}
              </span>
              <span className="what">
                <i className={`g g-${f.kind}`} aria-hidden />
                <b>{findingLabel(f.template)}</b>
                <span className="meta">{f.summary}</span>
              </span>
              <Segmented<Mark | 'none'>
                label={`Label ${f.id}`}
                value={marks[f.id] ?? 'none'}
                onChange={(v) => {
                  setMarks((m) => {
                    const next = { ...m };
                    if (v === 'none') delete next[f.id];
                    else next[f.id] = v;
                    return next;
                  });
                  touch(f.round);
                }}
                options={[
                  { id: 'none', label: '–' },
                  { id: 'correct', label: 'Correct' },
                  { id: 'wrong', label: 'Wrong' },
                  { id: 'unsure', label: 'Unsure' },
                ]}
              />
            </div>
          ))}
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
            setMissed((m) => [...m, form]);
            touch(form.round);
          }}
        >
          <input className="field" type="number" min={1} style={{ width: 70 }} aria-label="Round" value={form.round} onChange={(e) => setForm({ ...form, round: Number(e.target.value) })} />
          <input className="field" type="number" min={0} style={{ width: 120 }} placeholder="Round clock, seconds" aria-label="Round clock, seconds" value={form.t} onChange={(e) => setForm({ ...form, t: Number(e.target.value) })} />
          <select className="select" aria-label="Detector" value={form.detector} onChange={(e) => setForm({ ...form, detector: e.target.value })}>
            {DETECTORS.map((d) => (
              <option key={d} value={d}>
                {findingLabel(d)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn">
            Add
          </button>
        </form>
        {missed.length ? (
          <ul className="round-list">
            {missed.map((x, i) => (
              <li key={i}>
                <span className="meta num">
                  R{x.round} {clock(x.t)} · {findingLabel(x.detector)}
                </span>{' '}
                <button
                  type="button"
                  className="link small"
                  onClick={() => {
                    setMissed((m) => m.filter((_, j) => j !== i));
                    touch(x.round);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">Nothing added.</p>
        )}
        <div className="plan-actions">
          <button type="button" className="btn btn-default" disabled={!valid || !dirty.size} onClick={() => void saveLabels()}>
            Save labels{dirty.size ? ` (${dirty.size} ${dirty.size === 1 ? 'round' : 'rounds'})` : ''}
          </button>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Your six moments</h2>
          <span className="meta">
            {picks.length} of 6 picked{score ? '' : "; the coach's picks show after you save"}
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
                {findingLabel(f.template)}
                {f.zone ? `, ${f.zone}` : ''}
                {score && coachLeads.has(f.id) ? <span className="pov-tag">Coach</span> : null}
              </span>
              <input
                type="checkbox"
                checked={picks.includes(f.id)}
                disabled={!picks.includes(f.id) && picks.length >= 6}
                onChange={(e) => setPicks((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
              />
            </label>
          ))}
        </div>
        <div className="plan-actions">
          <button type="button" className="btn btn-default" disabled={!valid || !picks.length} onClick={() => void savePicks()}>
            Save picks
          </button>
        </div>
        {score ? (
          <dl className="facts">
            <div>
              <dt>Coach picks you also picked</dt>
              <dd className="num">
                {score.overlap} of {score.coachPicks}
              </dd>
            </div>
            <div>
              <dt>Overlap@6</dt>
              <dd className="num">{score.overlapAt6 ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>NDCG@6 of the coach&rsquo;s order</dt>
              <dd className="num">{score.ndcgAt6 ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Coach picks by</dt>
              <dd>{score.coachSource === 'agent' ? 'the coach model' : 'code (ranker)'}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Detector quality</h2>
          <span className="meta">
            {summary
              ? `${summary.rounds} labelled ${summary.rounds === 1 ? 'round' : 'rounds'} by ${
                  Object.entries(summary.labellers)
                    .map(([n, c]) => `${n} (${c})`)
                    .join(', ') || 'nobody yet'
                }`
              : ''}
          </span>
        </div>
        {summary && !summary.tool ? (
          <p className="meta">eval/label_tool.py is not next to the API, so scores are off.</p>
        ) : quality.length ? (
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
                    <td className="n num">{r.precision ?? '–'}</td>
                    <td className="n num">{r.recall ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="meta">No labels yet.</p>
        )}
      </section>
    </>
  );
}

function EvalTab() {
  const [data, setData] = useState<EvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pair, setPair] = useState<ABPair | null | undefined>(undefined);
  const [voted, setVoted] = useState<'a' | 'b' | 'tie' | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    api
      .getEval()
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [n]);

  useEffect(() => {
    setVoted(null);
    api
      .getPair()
      .then(setPair)
      .catch(() => setPair(null));
  }, [n]);

  async function vote(w: 'a' | 'b' | 'tie') {
    if (!pair) return;
    setVoted(w);
    await api.ratePair(pair.a.traceId, pair.b.traceId, w).catch((e) => setError(errorText(e)));
  }

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="meta thinking">Loading</p>;
  const langs = [...new Set(data.rows.flatMap((r) => Object.keys(r.byLang)))];

  return (
    <>
      <section className="sec">
        <div className="sec-h">
          <h2>Models on this computer</h2>
        </div>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Job</th>
                  <th className="n">Runs</th>
                  <th className="n">Verified</th>
                  <th className="n">Repaired</th>
                  <th className="n">Fell back</th>
                  <th className="n">Median s</th>
                  <th className="n">Tool calls, failed</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={`${m.model}:${m.job}`}>
                    <td className="mono">{m.model}</td>
                    <td>{jobLabel(m.job)}</td>
                    <td className="n num">{m.runs}</td>
                    <td className="n num">{m.verified}</td>
                    <td className="n num">{m.repaired}</td>
                    <td className="n num">{m.fallbacks}</td>
                    <td className="n num">{m.medianS?.toFixed(1) ?? '–'}</td>
                    <td className="n num">
                      {m.toolCalls}, {m.toolErrors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="meta">No coach runs in the traces yet.</p>
        )}
      </section>
      {langs.length ? (
        <section className="sec">
          <div className="sec-h">
            <h2>By language</h2>
            <span className="meta">Verified of runs, per model and job</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Model, job</th>
                  {langs.map((l) => (
                    <th key={l} className="n">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={`${m.model}:${m.job}`}>
                    <td>
                      <span className="mono">{m.model}</span> {jobLabel(m.job)}
                    </td>
                    {langs.map((l) => (
                      <td key={l} className="n num">
                        {m.byLang[l] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section className="sec">
        <div className="sec-h">
          <h2>Blind A/B</h2>
          <span className="meta num">
            {data.ratings.length ? data.ratings.map((t) => `${t.model}: ${t.wins} won, ${t.losses} lost, ${t.ties} tied`).join(' · ') : 'No votes yet'}
          </span>
        </div>
        {pair === undefined ? (
          <p className="meta thinking">Loading a pair</p>
        ) : pair === null ? (
          <p className="meta">No pair to vote on. Pairs appear once two models have verified answers to the same question.</p>
        ) : (
          <>
            <p>
              <b>{pair.question}</b> <span className="meta">{jobLabel(pair.job)}</span>
            </p>
            <div className="ab">
              {(['a', 'b'] as const).map((side, i) => (
                <div key={side}>
                  <h3>{i === 0 ? 'Answer 1' : 'Answer 2'}</h3>
                  <p>{pair[side].text}</p>
                </div>
              ))}
            </div>
            <div className="ab-vote">
              <button type="button" className="btn" disabled={!!voted} onClick={() => void vote('a')}>
                Answer 1 is better
              </button>
              <button type="button" className="btn" disabled={!!voted} onClick={() => void vote('b')}>
                Answer 2 is better
              </button>
              <button type="button" className="btn" disabled={!!voted} onClick={() => void vote('tie')}>
                About the same
              </button>
              {voted ? (
                <button type="button" className="btn btn-default" onClick={() => setN((x) => x + 1)}>
                  Next pair
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function DatasetTab() {
  // Writing the fine-tuning files is the admin's; a labeller reviews examples only
  const { isAdmin } = useAuth();
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [exported, setExported] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    api
      .getDataset({ pending: true, limit: 1 })
      .then((p) => {
        setPage(p);
        setEditing(false);
        setText(p.items[0]?.output ?? '');
      })
      .catch((e) => setError(errorText(e)));
  }, [n]);

  const r = page?.items[0];

  async function decide(kind: 'accept' | 'edit' | 'reject') {
    if (!r) return;
    try {
      await api.reviewExample(r.id, kind, kind === 'edit' ? text : undefined);
      setN((x) => x + 1);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function doExport() {
    try {
      const out = await api.exportDataset();
      setExported(`Wrote ${Object.entries(out.counts).map(([k, v]) => `${v} ${k}`).join(', ')} to ${out.folder}.`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (error) return <p className="err">{error}</p>;
  if (!page) return <p className="meta thinking">Loading</p>;

  return (
    <>
      <p className="meta num">
        {Object.entries(page.counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ') || 'Nothing kept yet'}{' '}
        · {page.reviewed} reviewed · {page.total} left to review{' '}
        {isAdmin ? (
          <button type="button" className="link small" onClick={() => void doExport()}>
            Export
          </button>
        ) : null}
      </p>
      {exported ? <p className="meta">{exported}</p> : null}
      {!r ? (
        <p className="empty">Nothing left to review. New runs arrive as the coach model answers.</p>
      ) : (
        <section className="sec">
          <div className="sec-h">
            <h2>
              {jobLabel(r.job)} <span className="meta">{r.lang ?? ''}</span>
            </h2>
            <span className="mono meta">
              {r.split} · {r.id}
            </span>
          </div>
          <h3 className="round-h">What the model was given</h3>
          <pre className="out">{r.prompt}</pre>
          <h3 className="round-h">Its answer</h3>
          {editing ? <textarea className="field" rows={5} value={text} onChange={(e) => setText(e.target.value)} /> : <pre className="out">{text}</pre>}
          <div className="ds-actions">
            <button type="button" className="btn btn-default" onClick={() => void decide(editing ? 'edit' : 'accept')}>
              {editing ? 'Save edit' : 'Accept'}
            </button>
            {!editing ? (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => void decide('reject')}>
              Reject
            </button>
          </div>
        </section>
      )}
    </>
  );
}
