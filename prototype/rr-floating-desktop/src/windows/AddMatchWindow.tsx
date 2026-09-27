import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { CoachLanguage, Match as ApiMatch, ProcessingStage, ReplayEvent, StatusResponse } from '@/lib/contracts';
import { makeRosterLookup } from '@/lib/replay/roster';
import { WindowFrame } from '../desktop/WindowFrame';
import { BUSY, errorText, type MatchStatus } from '../data/model';
import { mapName } from '../data/maps';
import { COACH_LANGUAGES } from '../data/languages';
import { useStore } from '../state/store';

/**
 * Add Match as a macOS installer: a fixed panel with the steps down the side, one step at a time on the
 * right, a progress bar while the API reads the demo and again while the coach reviews it, and a summary.
 * Closing it never stops the work; Matches reopens it on the same step.
 */

type Step = 'intro' | 'demo' | 'read' | 'player' | 'review' | 'summary';

const STEPS: { id: Step; label: string }[] = [
  { id: 'intro', label: 'Introduction' },
  { id: 'demo', label: 'Demo file' },
  { id: 'read', label: 'Reading the demo' },
  { id: 'player', label: 'Player' },
  { id: 'review', label: 'Coach review' },
  { id: 'summary', label: 'Summary' },
];

const READ_STAGES: MatchStatus[] = ['uploaded', 'decompressing', 'decompressed', 'parsing', 'normalizing'];
const REVIEW_STAGES: MatchStatus[] = ['detecting', 'selecting', 'recording', 'explaining'];
const POLL_MS = 1000;
/** The upload's share of the first progress bar; the API's reading stages fill the rest. */
const UPLOAD_SHARE = 0.4;

function stepFor(status: MatchStatus): Step {
  if (status === 'awaiting_player') return 'player';
  if (status === 'complete' || status === 'failed') return 'summary';
  if (REVIEW_STAGES.includes(status)) return 'review';
  return 'read';
}

/** Share of a phase done: finished stages count whole, the running one by its own progress when it has one. */
function phaseDone(stages: ProcessingStage[], ids: MatchStatus[]): number {
  const list = stages.filter((s) => ids.includes(s.id));
  if (!list.length) return 0;
  let v = 0;
  for (const s of list) {
    if (s.state === 'done') v += 1;
    else if (s.state === 'active') v += s.progress?.total ? s.progress.done / s.progress.total : 0.4;
  }
  return v / list.length;
}

function activeLine(stages: ProcessingStage[], ids: MatchStatus[]): string {
  const now = stages.find((s) => s.state === 'active' && ids.includes(s.id));
  if (!now) return 'Starting…';
  if (now.progress?.total) return `${now.label}: ${now.progress.done} of ${now.progress.total}`;
  return now.detail && now.detail !== 'Done' ? `${now.label}: ${now.detail}` : `${now.label}…`;
}

function fileSize(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

type PickRow = { id: string; name: string; team: 'CT' | 'T'; kills: number; deaths: number };

/** Every kill in the match, paged, for the K and D columns of the player list (as the web app's picker does). */
async function killCounts(matchId: string, match: ApiMatch): Promise<PickRow[]> {
  const kills: ReplayEvent[] = [];
  for (let offset = 0; ; offset += 2000) {
    const page = await api.getEvents(matchId, { offset, limit: 2000 });
    kills.push(...page.events.filter((e) => e.type === 'kill'));
    if (offset + page.events.length >= page.total || page.events.length === 0) break;
  }
  const roster = match.players ?? [];
  const lookup = makeRosterLookup(roster);
  const k = new Map<string, number>();
  const d = new Map<string, number>();
  for (const e of kills) {
    const killer = lookup(e.actorId);
    const victim = lookup(e.victimId);
    if (victim) d.set(victim.id, (d.get(victim.id) ?? 0) + 1);
    if (killer && killer.id !== victim?.id && killer.team !== victim?.team) k.set(killer.id, (k.get(killer.id) ?? 0) + 1);
  }
  return roster.map((p) => ({ id: p.id, name: p.name, team: p.team, kills: k.get(p.id) ?? 0, deaths: d.get(p.id) ?? 0 }));
}

export function AddMatchWindow() {
  const s = useStore();
  const [pre, setPre] = useState<'intro' | 'demo'>(s.installFor ? 'demo' : 'intro');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [workId, setWorkId] = useState<string | null>(s.installFor);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiMatch | null>(null);
  const [rows, setRows] = useState<PickRow[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [language, setLanguage] = useState<CoachLanguage>(s.language);
  const [picking, setPicking] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [log, setLog] = useState(false);
  const [clips, setClips] = useState<{ ready: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Matches opened the installer on another match: follow that one from its current step
  useEffect(() => {
    if (!s.installFor || s.installFor === workId) return;
    setWorkId(s.installFor);
    setStatus(null);
    setFile(null);
    setError(null);
  }, [s.installFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tell the store which match this follows, so it does not also raise a notification for it
  useEffect(() => {
    s.followInstall(workId);
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the pipeline until it rests: a player to pick, complete or failed
  useEffect(() => {
    if (!workId) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      try {
        const st = await api.getStatus(workId);
        if (stop) return;
        setStatus(st);
        if (BUSY.has(st.status)) timer = window.setTimeout(poll, POLL_MS);
        else void s.refreshMatches();
      } catch (e) {
        if (!stop) setError(errorText(e));
      }
    };
    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [workId, pollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploading = sent != null;
  const step: Step = uploading ? 'read' : workId ? (status ? stepFor(status.status) : 'read') : pre;
  const work = workId ? s.matches.find((m) => m.id === workId) : undefined;

  // The roster, with kills and deaths, once the demo has been read
  useEffect(() => {
    if (step !== 'player' || !workId) return;
    let stop = false;
    setRows(null);
    setChosen(null);
    api
      .getMatch(workId)
      .then(async (m) => {
        if (stop) return;
        setDetail(m);
        const base = (m.players ?? []).map((p) => ({ id: p.id, name: p.name, team: p.team, kills: 0, deaths: 0 }));
        setRows(base);
        const counted = await killCounts(workId, m).catch(() => base);
        if (!stop) setRows(counted);
      })
      .catch((e) => !stop && setError(errorText(e)));
    return () => {
      stop = true;
    };
  }, [step, workId]);

  // The summary's clip count
  useEffect(() => {
    setClips(null);
    if (step !== 'summary' || status?.status !== 'complete' || !workId || !work?.playerId) return;
    api
      .getPlayerClips(workId, work.playerId)
      .then((cs) => setClips({ ready: cs.filter((c) => c.status === 'ready').length, total: cs.length }))
      .catch(() => undefined);
  }, [step, status?.status, workId, work?.playerId]);

  function choose(f: File) {
    setError(null);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setError(null);
    setStatus(null);
    setSent(0);
    try {
      const res = await api.upload(file, (n, total) => setSent(total ? n / total : 0));
      setWorkId(res.id);
      void s.refreshMatches();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSent(null);
    }
  }

  async function review(playerId = chosen) {
    if (!workId || !playerId || picking) return;
    setPicking(true);
    setError(null);
    try {
      s.setLanguage(language);
      const st = await api.selectPlayer(workId, playerId, language);
      setStatus(st);
      setPollKey((k) => k + 1);
      void s.refreshMatches();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPicking(false);
    }
  }

  function startOver() {
    setWorkId(null);
    setStatus(null);
    setFile(null);
    setError(null);
    setPre('demo');
    s.followInstall(null);
  }

  const stages = status?.stages ?? [];
  const readShare = uploading ? (sent ?? 0) * UPLOAD_SHARE : UPLOAD_SHARE + (1 - UPLOAD_SHARE) * phaseDone(stages, READ_STAGES);
  const failed = status?.status === 'failed';
  const stepIdx = STEPS.findIndex((x) => x.id === step);
  const matchLine = work ? `${work.mapLabel} ${work.score}` : detail ? `${mapName(detail.mapName ?? detail.map)} ${detail.score}` : null;

  const heading: Record<Step, string> = {
    intro: 'Welcome to Add Match',
    demo: 'Choose the demo to review',
    read: 'Reading the demo',
    player: 'Who should the coach review?',
    review: `Reviewing ${work?.playerName ?? 'the player'}`,
    summary: failed ? 'The demo could not be processed' : 'The review is ready',
  };

  let back: ReactNode = null;
  let next: ReactNode = null;
  if (step === 'intro') {
    next = (
      <button type="button" className="btn btn-default btn-wide" onClick={() => setPre('demo')}>
        Continue
      </button>
    );
  } else if (step === 'demo') {
    back = (
      <button type="button" className="btn btn-wide" onClick={() => setPre('intro')}>
        Go Back
      </button>
    );
    next = (
      <button type="button" className="btn btn-default btn-wide" disabled={!file} onClick={() => void upload()}>
        Upload
      </button>
    );
  } else if (step === 'read' || step === 'review') {
    back = (
      <button type="button" className="btn btn-wide" disabled>
        Go Back
      </button>
    );
    next = (
      <button type="button" className="btn btn-default btn-wide" disabled>
        Continue
      </button>
    );
  } else if (step === 'player') {
    back = (
      <button type="button" className="btn btn-wide" onClick={startOver} title="Choose another demo; this one stays in Matches">
        Go Back
      </button>
    );
    next = (
      <button type="button" className="btn btn-default btn-wide" disabled={!chosen || picking} onClick={() => void review()}>
        Review
      </button>
    );
  } else {
    back = (
      <button type="button" className="btn btn-wide" onClick={startOver}>
        {failed ? 'Try Another Demo' : 'Add Another'}
      </button>
    );
    next = failed ? (
      <button type="button" className="btn btn-default btn-wide" onClick={() => s.close('addMatch')}>
        Close
      </button>
    ) : (
      <button
        type="button"
        className="btn btn-default btn-wide"
        onClick={() => {
          if (workId) s.openStudio(workId);
          s.close('addMatch');
        }}
      >
        Open in Studio
      </button>
    );
  }

  const coachCheck = s.system?.checks.find((c) => c.name === 'llm');
  const clipCheck = s.system?.checks.find((c) => c.name === 'csdm');

  return (
    <WindowFrame id="addMatch" fixed className="installer" minW={640} minH={440} flush>
      <div className="inst">
        <aside className="inst-side" aria-label="Steps">
          <ol>
            {STEPS.map((x, i) => (
              <li key={x.id} data-s={i < stepIdx ? 'done' : i === stepIdx ? 'now' : 'todo'} aria-current={i === stepIdx ? 'step' : undefined}>
                <span className="inst-dot" aria-hidden />
                {x.label}
              </li>
            ))}
          </ol>
          <DemoGlyph />
        </aside>

        <section className="inst-main">
          <h2 className="inst-h">{heading[step]}</h2>
          <div className="inst-box" data-step={step}>
            {step === 'intro' ? (
              <>
                <p>You will be guided through adding a CS2 demo and having the coach review one player&apos;s game.</p>
                <ol className="inst-list">
                  <li>Choose a .dem or .dem.zst file.</li>
                  <li>The API reads every round. The radar works as soon as this is done.</li>
                  <li>Pick whose game to review.</li>
                  <li>The coach finds the mistakes and good plays, picks the moments, records a clip of each and writes the review.</li>
                </ol>
                <table className="inst-sys">
                  <tbody>
                    <tr>
                      <th scope="row">Coach model</th>
                      <td data-state={coachCheck?.state}>
                        {coachCheck?.state === 'ok' ? s.system?.llmModel : coachCheck?.state === 'off' ? 'Off, so the review comes from the finding templates' : (coachCheck?.detail ?? 'Unknown, the API is not answering')}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Clip recording</th>
                      <td data-state={clipCheck?.state}>{clipCheck?.state === 'off' ? 'Off, so moments show on the radar only' : (clipCheck?.detail ?? 'Unknown')}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}

            {step === 'demo' ? (
              <div
                className={`inst-drop${dragOver ? ' over' : ''}${file ? ' has-file' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) choose(f);
                }}
              >
                <DemoGlyph small />
                {file ? (
                  <>
                    <b>{file.name}</b>
                    <span className="num">{fileSize(file.size)}</span>
                  </>
                ) : (
                  <>
                    <b>Drop a demo here</b>
                    <span>A .dem, or a .dem.zst from FACEIT. The file goes to the API on this computer.</span>
                  </>
                )}
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  {file ? 'Choose Another…' : 'Choose File…'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".dem,.zst"
                  hidden
                  data-testid="demo-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) choose(f);
                    e.target.value = '';
                  }}
                />
              </div>
            ) : null}

            {step === 'read' ? (
              <Progress
                value={readShare}
                line={uploading ? `Uploading ${file?.name ?? 'the demo'}: ${Math.round((sent ?? 0) * 100)}%` : status ? activeLine(stages, READ_STAGES) : 'Waiting for the API…'}
                note="Parsing a full match takes about a minute. You can close this window; Matches keeps the progress."
                stages={stages}
                log={log}
                setLog={setLog}
              />
            ) : null}

            {step === 'player' ? (
              <div className="inst-pick">
                {matchLine ? (
                  <p className="meta">
                    {matchLine}
                    {detail ? `, ${detail.rounds} rounds` : ''}. Sides are where each player started.
                  </p>
                ) : null}
                {rows == null ? (
                  <p className="meta thinking">Loading the players</p>
                ) : rows.length ? (
                  <div className="inst-table" role="radiogroup" aria-label="Player to review">
                    <div className="inst-tr head" aria-hidden>
                      <span />
                      <span>Player</span>
                      <span>Side</span>
                      <span className="n">K</span>
                      <span className="n">D</span>
                    </div>
                    {[...rows]
                      .sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === 'CT' ? -1 : 1))
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={chosen === p.id}
                          className="inst-tr pick-row"
                          onClick={() => setChosen(p.id)}
                          onDoubleClick={() => {
                            setChosen(p.id);
                            void review(p.id);
                          }}
                        >
                          <span className="radio" aria-hidden />
                          <span>
                            {p.name}
                            {s.players.some((c) => c.id === p.id) ? <span className="meta"> · reviewed before</span> : null}
                          </span>
                          <span className="meta">{p.team}</span>
                          <span className="n num">{p.kills}</span>
                          <span className="n num">{p.deaths}</span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="meta">The demo has no player list.</p>
                )}
                <label className="inst-lang">
                  Coach language
                  <select value={language} onChange={(e) => setLanguage(e.target.value as CoachLanguage)}>
                    {COACH_LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {step === 'review' ? (
              <Progress
                value={phaseDone(stages, REVIEW_STAGES)}
                line={activeLine(stages, REVIEW_STAGES)}
                note={
                  coachCheck?.state === 'ok'
                    ? `${s.system?.llmModel} is writing the review. With the local model this takes a few minutes; you can close this window.`
                    : 'The coach model is off, so the review is written from the finding templates.'
                }
                stages={stages}
                log={log}
                setLog={setLog}
              />
            ) : null}

            {step === 'summary' ? (
              <div className="inst-done">
                <span className={`inst-badge${failed ? ' bad' : ''}`} aria-hidden>
                  {failed ? '!' : <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                {failed ? (
                  <>
                    <b>The API stopped while reading this demo.</b>
                    <p className="err">{status?.error ?? 'Processing failed.'}</p>
                  </>
                ) : (
                  <>
                    <b>{matchLine ?? 'The match'} has been reviewed.</b>
                    <p>
                      {work?.playerName ?? 'The player'}: {work?.moments ?? 0} {work?.moments === 1 ? 'moment' : 'moments'} picked
                      {clips ? `, ${clips.ready} of ${clips.total} clips recorded` : ''}. {work?.model ? (
                        <>
                          Written by <span className="mono">{work.model}</span>.
                        </>
                      ) : (
                        'Written from the finding templates, since the coach model is off.'
                      )}
                    </p>
                    {clips && clips.ready < clips.total ? <p className="meta">Clips that are still recording fill in while you watch.</p> : null}
                  </>
                )}
              </div>
            ) : null}

            {error ? (
              <p className="err inst-err" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <footer className="inst-foot">
            <span />
            {back}
            {next}
          </footer>
        </section>
      </div>
    </WindowFrame>
  );
}

function Progress({
  value,
  line,
  note,
  stages,
  log,
  setLog,
}: {
  value: number;
  line: string;
  note: string;
  stages: ProcessingStage[];
  log: boolean;
  setLog: (v: boolean) => void;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="inst-progress">
      <p className="inst-line">{line}</p>
      <div className="inst-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={line}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="meta">{note}</p>
      <button type="button" className="link inst-log-toggle" aria-expanded={log} onClick={() => setLog(!log)}>
        {log ? 'Hide details' : 'Show details'}
      </button>
      {log ? (
        <ol className="pipeline inst-log">
          {stages.map((st) => (
            <li key={st.id} data-s={st.state === 'done' ? 'done' : st.state === 'active' ? 'now' : st.state === 'error' ? 'error' : 'todo'}>
              <span className="pip" aria-hidden />
              <span>{st.label}</span>
              {st.progress ? (
                <span className="meta num">
                  {st.progress.done}/{st.progress.total}
                </span>
              ) : st.detail && st.state !== 'pending' ? (
                <span className="meta">{st.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** The installer's artwork: a demo file with a radar sweep, drawn rather than an image so it stays sharp. */
function DemoGlyph({ small }: { small?: boolean }) {
  return (
    <svg className={small ? 'inst-glyph small' : 'inst-glyph'} viewBox="0 0 96 112" aria-hidden>
      <defs>
        <linearGradient id="inst-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9e9ee" />
        </linearGradient>
      </defs>
      <path d="M10 4h52l24 24v76a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="url(#inst-paper)" stroke="rgba(0,0,0,0.18)" />
      <path d="M62 4v20a4 4 0 0 0 4 4h20" fill="#dcdce2" stroke="rgba(0,0,0,0.18)" />
      <circle cx="46" cy="62" r="24" fill="#1c1c1e" />
      <circle cx="46" cy="62" r="16" fill="none" stroke="rgba(255,255,255,0.14)" />
      <circle cx="46" cy="62" r="8" fill="none" stroke="rgba(255,255,255,0.14)" />
      <path d="M46 62L46 38A24 24 0 0 1 67 50z" fill="rgba(0,122,255,0.55)" />
      <circle cx="56" cy="54" r="2.4" fill="#e8850c" />
      <circle cx="38" cy="70" r="2.4" fill="#fff" />
      <text x="46" y="100" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(0,0,0,0.5)" fontFamily="-apple-system, Segoe UI, sans-serif">
        .dem
      </text>
    </svg>
  );
}
