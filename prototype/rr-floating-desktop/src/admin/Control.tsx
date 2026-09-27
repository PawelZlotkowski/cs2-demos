import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { auditLabel } from '@/lib/audit';
import type { GpuJob, RuntimeSetting, SystemCheckName } from '@/lib/contracts';
import { ago, bytes, errorText, when } from '@/lib/format';
import { useStore } from '../state/store';
import { LoadState, PaneHead, Secret, Stat, Status, useLoad } from '../ui/kit';

export const CHECK_NAME: Record<SystemCheckName, string> = {
  llm: 'Coach model',
  mcp: 'Coach tools',
  csdm: 'Clip recording',
  knowledge: 'Knowledge base',
  traces: 'Run log',
};

export const STATE_LABEL = { ok: 'Working', off: 'Off', problem: 'Not working' } as const;

/** Admin, Overview (doc 30 AD01): services, work in flight, disk, and what changed last. */
export function Overview() {
  const s = useStore();
  const { data, error } = useLoad(() => api.admin.overview(), 10000);
  const c = data?.counts;
  const used = data?.storage.folders.reduce((n, f) => n + f.bytes, 0) ?? 0;

  return (
    <div className="pane">
      <PaneHead title="Overview" lede="Everything the app is doing on this computer. Refreshes every 10 seconds." />
      <LoadState error={error} loading={!data} />
      {data && c ? (
        <>
          <div className="stats">
            <Stat label="Users" value={data.authEnabled ? c.users : '–'} onOpen={() => s.openAdmin('users')} />
            <Stat label="Matches" value={c.matches} onOpen={() => s.openAdmin('matches')} />
            <Stat label="Reviewed" value={c.reviewed} onOpen={() => s.openAdmin('matches')} />
            <Stat label="Processing" value={c.processing} onOpen={() => s.openAdmin('jobs')} />
            <Stat label="GPU running / waiting" value={`${c.gpuRunning} / ${c.gpuWaiting}`} onOpen={() => s.openAdmin('jobs')} />
            <Stat label="Failed matches" value={c.failed} onOpen={() => s.openAdmin('matches')} />
            <Stat label="Failed clips" value={c.clipsFailed} onOpen={() => s.openAdmin('jobs')} />
            <Stat label="Data on disk" value={bytes(used)} onOpen={() => s.openAdmin('storage')} />
          </div>

          <section className="sec">
            <div className="sec-h">
              <h2>Services</h2>
              <button type="button" className="link" onClick={() => s.openAdmin('model')}>
                Model and services
              </button>
            </div>
            <ul className="group">
              {data.system.checks.map((x) => (
                <li key={x.name} data-state={x.state}>
                  <span className="check-name">{CHECK_NAME[x.name] ?? x.name}</span>
                  <span className="check-state">{STATE_LABEL[x.state]}</span>
                  <span className="check-detail">{x.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Latest changes</h2>
              <button type="button" className="link" onClick={() => s.openAdmin('audit')}>
                Audit log
              </button>
            </div>
            {data.recent.length ? (
              <ul className="rows">
                {data.recent.map((a) => (
                  <li key={a.id}>
                    <span>
                      <b>{a.actorName ?? 'Someone'}</b> {auditLabel(a.action)}
                      {a.targetName ? (a.targetName === a.actorName ? null : ` (${a.targetName})`) : a.target ? <span className="mono meta"> {a.target}</span> : null}
                    </span>
                    <span className="meta">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Nothing yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

const KIND: Record<string, string> = {
  select: 'Pick moments',
  explain: 'Write explanations',
  review: 'Summary and wrap-up',
  ask: 'Ask tab',
  ask_across: 'Coach window',
};

const JOB_STATE: Record<GpuJob['state'], string> = {
  queued: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function secs(a: number | null, b: number | null): string {
  if (!a) return '–';
  const s = Math.max(0, (b ?? Date.now() / 1000) - a);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function GpuRows({ jobs, onCancel }: { jobs: GpuJob[]; onCancel?: (id: string) => void }) {
  return (
    <>
      {jobs.map((j) => (
        <tr key={j.id}>
          <td>{KIND[j.kind] ?? j.kind}</td>
          <td className="mono small">{j.matchId ?? j.playerId ?? '–'}</td>
          <td>
            <span className="pill" data-state={j.state}>
              {JOB_STATE[j.state]}
            </span>
          </td>
          <td className="meta">{when(j.createdAt)}</td>
          <td className="n num">{j.state === 'queued' ? secs(j.createdAt, null) : secs(j.startedAt, j.endedAt)}</td>
          <td className="row-actions">
            {j.error ? (
              <span className="meta" title={j.error}>
                {j.error.slice(0, 60)}
              </span>
            ) : null}
            {onCancel && j.state === 'queued' ? (
              <button type="button" className="link" onClick={() => onCancel(j.id)}>
                Cancel
              </button>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

/** Admin, Jobs (doc 30 AD06): the one GPU queue, matches being processed and clip recordings. */
export function Jobs() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.jobs(), 3000);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  const gpu = data?.gpu;
  return (
    <div className="pane">
      <PaneHead title="Jobs" lede="The model runs one job at a time, first come first served; each person can have one question waiting. Refreshes every 3 seconds." />
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {gpu && data ? (
        <>
          <section className="sec">
            <div className="sec-h">
              <h2>GPU queue</h2>
              <span className="meta">
                {gpu.running.length} running, {gpu.waiting.length} waiting
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Match or player</th>
                    <th>State</th>
                    <th>Queued</th>
                    <th className="n">Time</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <GpuRows jobs={gpu.running} />
                  <GpuRows jobs={gpu.waiting} onCancel={(id) => void act(() => api.admin.cancelJob(id), 'Cancelled.')} />
                  <GpuRows jobs={gpu.finished.slice(0, 20)} />
                  {!gpu.running.length && !gpu.waiting.length && !gpu.finished.length ? (
                    <tr>
                      <td colSpan={6} className="meta">
                        Nothing has used the model since the API started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Processing and failed matches</h2>
            </div>
            {data.pipeline.length ? (
              <ul className="rows">
                {data.pipeline.map((p) => (
                  <li key={p.matchId}>
                    <span>
                      <button type="button" className="link mono" onClick={() => s.openInstaller(p.matchId)}>
                        {p.matchId.slice(0, 8)}
                      </button>{' '}
                      {p.status.replace(/_/g, ' ')} {p.since ? <span className="meta">since {ago(p.since)}</span> : null}
                      {p.error ? <span className="meta"> · {p.error}</span> : null}
                    </span>
                    {p.status === 'failed' ? (
                      <button type="button" className="link" onClick={() => void act(() => api.admin.reprocess(p.matchId), 'Processing again.')}>
                        Process again
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No match is being processed.</p>
            )}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Clip recordings</h2>
            </div>
            {data.clips.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Clip</th>
                      <th>Match</th>
                      <th className="n">Round</th>
                      <th>Window</th>
                      <th>State</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clips.slice(0, 50).map((c) => (
                      <tr key={c.id}>
                        <td className="mono small">{c.id}</td>
                        <td className="mono small">{c.matchId.slice(0, 8)}</td>
                        <td className="n num">{c.round}</td>
                        <td className="meta num">
                          {c.t0.toFixed(1)}–{c.t1.toFixed(1)} s
                        </td>
                        <td title={c.error ?? undefined}>{c.status}</td>
                        <td className="row-actions">
                          {c.status === 'failed' ? (
                            <button type="button" className="link" onClick={() => void act(() => api.admin.retryClip(c.id), 'Clip queued again.')}>
                              Record again
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">No clips recorded yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Admin, Model and services (doc 30 AD08): what is served and how well it does. */
export function Model() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.model());

  return (
    <div className="pane">
      <PaneHead title="Model and services" lede="Which model llama-server serves, and how its latest runs went.">
        <button type="button" className="btn" onClick={() => void reload()}>
          Check Again
        </button>
      </PaneHead>
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <ul className="group">
            {data.system.checks.map((c) => (
              <li key={c.name} data-state={c.state}>
                <span className="check-name">{CHECK_NAME[c.name] ?? c.name}</span>
                <span className="check-state">{STATE_LABEL[c.state]}</span>
                <span className="check-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
          <dl className="facts">
            <div>
              <dt>Model the API asks for</dt>
              <dd className="mono">{data.system.llmModel}</dd>
            </div>
            <div>
              <dt>Served on the port</dt>
              <dd className="mono">{data.system.servedModels.join(', ') || 'nothing'}</dd>
            </div>
            <div>
              <dt>Sampling profile</dt>
              <dd className="mono">{data.sampling}</dd>
            </div>
            <div>
              <dt>Tool steps per answer</dt>
              <dd className="num">{data.maxSteps}</dd>
            </div>
          </dl>

          <section className="sec">
            <div className="sec-h">
              <h2>Latest {data.stats.window} runs</h2>
              <button type="button" className="link" onClick={() => s.openAdmin('lab')}>
                Every run in the Lab
              </button>
            </div>
            {data.stats.models.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="n">Runs</th>
                      <th className="n">Passed the verifier</th>
                      <th className="n">Average time</th>
                      <th className="n">Tokens per second</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stats.models.map((m) => (
                      <tr key={m.model}>
                        <td className="mono">{m.model}</td>
                        <td className="n num">{m.runs}</td>
                        <td className="n num">{m.verifiedRate == null ? '–' : `${Math.round(m.verifiedRate * 100)}%`}</td>
                        <td className="n num">{m.avgLatencyS == null ? '–' : `${m.avgLatencyS} s`}</td>
                        <td className="n num">{m.tokensPerSecond ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">No coach runs yet.</p>
            )}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Switch the model</h2>
            </div>
            <p className="meta">
              One model fits on the GPU, so switching means stopping llama-server and starting it with the other GGUF. Then change the model name under{' '}
              <button type="button" className="link" onClick={() => s.openAdmin('settings')}>
                Settings
              </button>
              ; it applies to the next job without restarting the API.
            </p>
            <Secret value={data.command} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function SettingRow({ s, onSaved }: { s: RuntimeSetting; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState(s.value == null ? '' : String(s.value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(s.value == null ? '' : String(s.value)), [s.value]);

  async function save(value: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api.admin.setSetting(s.key, value);
      onSaved(`${s.label} saved. It applies to the next job.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const id = `set-${s.key}`;
  const changed = draft !== (s.value == null ? '' : String(s.value));
  return (
    <li className="setting">
      <label htmlFor={id} className="setting-l">
        {s.label}
        <span className="mono meta">
          {s.env}
          {s.source === 'admin' ? ' · changed here' : ''}
        </span>
      </label>
      <span className="setting-v">
        {s.kind === 'bool' ? (
          <button
            id={id}
            type="button"
            role="switch"
            className="switch"
            aria-checked={Boolean(s.value)}
            aria-label={s.label}
            disabled={busy}
            onClick={() => void save(!s.value)}
          />
        ) : s.choices ? (
          <select id={id} className="select" value={String(s.value ?? '')} disabled={busy} onChange={(e) => void save(e.target.value)}>
            {s.choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <form
            className="setting-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(s.kind === 'number' ? (draft === '' ? null : Number(draft)) : draft);
            }}
          >
            <input
              id={id}
              className={`field${s.kind === 'number' ? ' short' : ''}`}
              inputMode={s.kind === 'number' ? 'decimal' : undefined}
              value={draft}
              placeholder={s.value == null ? 'not set' : undefined}
              onChange={(e) => setDraft(e.target.value)}
            />
            {changed ? (
              <button type="submit" className="btn small" disabled={busy}>
                Save
              </button>
            ) : null}
          </form>
        )}
        {s.source === 'admin' ? (
          <button
            type="button"
            className="link small"
            title={`The .env value is ${s.envValue == null ? 'not set' : String(s.envValue)}`}
            onClick={async () => {
              try {
                await api.admin.resetSetting(s.key);
                onSaved(`${s.label} is back to the .env value.`);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Use .env value
          </button>
        ) : null}
      </span>
      {error ? <span className="err setting-err">{error}</span> : null}
    </li>
  );
}

/** Admin, Settings (doc 30 AD07): values that apply without restarting the API; the rest read-only. */
export function RuntimeSettings() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.settings());
  const [msg, setMsg] = useState<string | null>(null);
  const groups = [...new Set((data?.runtime ?? []).map((x) => x.group))];

  return (
    <div className="pane">
      <PaneHead title="Settings" lede="Changes here win over apps/api/.env and apply to the next job without a restart. The ones at the bottom need the .env file and a restart." />
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {data
        ? groups.map((g) => (
            <section key={g} className="sec">
              <div className="sec-h">
                <h2>{g}</h2>
              </div>
              <ul className="group settings-list">
                {data.runtime
                  .filter((x) => x.group === g)
                  .map((x) => (
                    <SettingRow
                      key={x.key}
                      s={x}
                      onSaved={(m) => {
                        setMsg(m);
                        void reload();
                        // The Lab switch and share links show in other windows
                        void s.refreshFeatures();
                      }}
                    />
                  ))}
              </ul>
            </section>
          ))
        : null}
      {data ? (
        <section className="sec">
          <div className="sec-h">
            <h2>Needs a restart</h2>
          </div>
          <dl className="facts">
            {data.restart.map((r) => (
              <div key={r.key}>
                <dt className="mono">{r.env}</dt>
                <dd className="mono">{r.value == null ? 'not set' : Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
