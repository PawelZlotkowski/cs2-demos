import { useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { ago, bytes, errorText } from '@/lib/format';
import { mapName } from '../data/maps';
import { useStore } from '../state/store';
import { ConfirmButton, LoadState, PaneHead, Status, useLoad } from '../ui/kit';

type Msg = { ok: boolean; text: string } | null;

const MATCH_STATE: Record<string, string> = {
  complete: 'Reviewed',
  awaiting_player: 'Waiting for a player',
  failed: 'Failed',
};

/** Admin, Matches (doc 30 AD05): every match on the computer, whoever uploaded it. */
export function Matches() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.matches());
  const users = useLoad(() => api.admin.users().catch(() => []));
  const [owner, setOwner] = useState('');
  const [msg, setMsg] = useState<Msg>(null);

  const rows = (data ?? []).filter((m) => !owner || m.ownerId === owner);
  const total = rows.reduce((n, m) => n + m.bytes, 0);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      await reload();
      await s.refreshMatches();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  const name = (m: { title: string | null; map: string | null; score: string | null }) => m.title || `${m.map ? mapName(m.map) : '…'} ${m.score ?? ''}`.trim();

  return (
    <div className="pane">
      <PaneHead title="Matches" lede="Every uploaded match with its owner, state and size. Deleting removes the demo, clips, review, notes and runs." />
      <div className="filters">
        {users.data && users.data.length ? (
          <select className="select" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Everyone</option>
            {users.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        ) : null}
        {data ? (
          <span className="meta">
            {rows.length} {rows.length === 1 ? 'match' : 'matches'}, {bytes(total)}
          </span>
        ) : null}
      </div>
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {data && rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Match</th>
                <th>Owner</th>
                <th>Coached</th>
                <th>State</th>
                <th>Model</th>
                <th className="n">Size</th>
                <th>Added</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <button
                      type="button"
                      className="row-open"
                      onClick={() => (m.status === 'complete' ? s.openStudio(m.id) : s.openInstaller(m.id))}
                      title={m.status === 'complete' ? 'Open in the Studio' : 'Show its progress'}
                    >
                      {name(m)}
                    </button>
                    {m.shared ? <span className="tag">Shared</span> : null}
                  </td>
                  <td>
                    {users.data && users.data.length ? (
                      <select
                        className="select"
                        aria-label={`Owner of ${name(m)}`}
                        value={m.ownerId}
                        onChange={(e) => void act(() => api.admin.setOwner(m.id, e.target.value), 'Owner changed.')}
                      >
                        {users.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (m.ownerName ?? '–')
                    )}
                  </td>
                  <td>{m.playerName ?? '–'}</td>
                  <td title={m.error ?? undefined}>{MATCH_STATE[m.status] ?? m.status.replace(/_/g, ' ')}</td>
                  <td className="mono small">{m.model ?? 'templates'}</td>
                  <td className="n num">{bytes(m.bytes)}</td>
                  <td className="meta">{ago(m.createdAt)}</td>
                  <td className="row-actions">
                    {m.status === 'failed' ? (
                      <button type="button" className="link" onClick={() => void act(() => api.admin.reprocess(m.id), 'Processing again.')}>
                        Process again
                      </button>
                    ) : null}
                    {m.status === 'complete' ? (
                      <button type="button" className="link" onClick={() => void act(() => api.rerunCoach(m.id, s.language), 'Review started again with the served model.')}>
                        Re-run review
                      </button>
                    ) : null}
                    <ConfirmButton label="Delete" question={`Delete ${name(m)} and its files?`} onConfirm={() => act(() => api.admin.deleteMatch(m.id), 'Match deleted.')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className="meta">No matches.</p>
      ) : null}
    </div>
  );
}

/** Admin, Knowledge (doc 30 AD10): own map notes, players' flags, the index. */
export function Knowledge() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.knowledge());
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<Msg>(null);

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

  return (
    <div className="pane">
      <PaneHead title="Knowledge" lede={data ? `${data.passages} passages the coach can cite. Add notes in the Coach window, Knowledge tab.` : undefined}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void act(async () => {
              const r = await api.admin.rebuildKnowledge();
              setMsg({ ok: true, text: `Index rebuilt: ${r.passages} passages.` });
            }, 'Index rebuilt.')
          }
        >
          Rebuild the Index
        </button>
      </PaneHead>
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <section className="sec">
            <div className="sec-h">
              <h2>Flagged as wrong</h2>
            </div>
            {data.flags.length ? (
              <ul className="rows">
                {data.flags.map((f) => (
                  <li key={f.id}>
                    <span>
                      <b className="mono">{f.passageId}</b> {f.title ? <span>{f.title}</span> : null}
                      <span className="meta block">
                        &ldquo;{f.note || 'No note'}&rdquo; · {ago(f.createdAt)}
                      </span>
                    </span>
                    <button type="button" className="link" onClick={() => void act(() => api.admin.resolveFlag(f.id), 'Flag resolved.')}>
                      Resolve
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No flags.</p>
            )}
          </section>
          <section className="sec">
            <div className="sec-h">
              <h2>Own notes</h2>
              <button type="button" className="link" onClick={() => s.open('coach')}>
                Add a note
              </button>
            </div>
            <p className="meta">Editing keeps a note&rsquo;s citation id. Deleting one gives the notes after it on that map new ids.</p>
            {data.notes.length ? (
              <ul className="rows">
                {data.notes.map((n) => {
                  const key = `${n.map}/${n.index}`;
                  return (
                    <li key={key} className={editing === key ? 'editing' : undefined}>
                      {editing === key ? (
                        <form
                          className="note-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act(async () => {
                              await api.admin.editNote(n.map, n.index, title, text);
                              setEditing(null);
                            }, 'Note saved.');
                          }}
                        >
                          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
                          <textarea className="field" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Text" />
                          <span className="row-btns">
                            <button type="button" className="btn" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn btn-default">
                              Save
                            </button>
                          </span>
                        </form>
                      ) : (
                        <>
                          <span>
                            <b>{n.title}</b> <span className="meta">{mapName(n.map)}</span>
                            <span className="meta block clamp">{n.text}</span>
                          </span>
                          <span className="row-actions">
                            <button
                              type="button"
                              className="link"
                              onClick={() => {
                                setEditing(key);
                                setTitle(n.title);
                                setText(n.text);
                              }}
                            >
                              Edit
                            </button>{' '}
                            <ConfirmButton label="Delete" question={`Delete "${n.title}"?`} onConfirm={() => act(() => api.admin.deleteNote(n.map, n.index), 'Note deleted.')} />
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="meta">No own notes yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

const FOLDER: Record<string, string> = {
  uploads: 'Uploaded demos',
  work: 'Unpacked demos (work)',
  matches: 'Replays and clips',
  traces: 'Coach runs',
  dataset: 'Fine-tuning set',
  database: 'Database',
};

/** Admin, Storage and backup (doc 30 AD11, AD15). */
export function Storage() {
  const { data, error, reload } = useLoad(() => api.admin.storage());
  const [msg, setMsg] = useState<Msg>(null);
  const [days, setDays] = useState(30);
  const [restoring, setRestoring] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function clean(body: { work?: boolean; tracesOlderThanDays?: number; failed?: boolean }) {
    const r = await api.admin.cleanup(body);
    setMsg({ ok: true, text: `Freed ${bytes(r.freedBytes)}.` });
    await reload();
  }

  async function restore(file: File) {
    setRestoring(null);
    try {
      const r = await api.admin.restore(file);
      setMsg({ ok: true, text: `Restored the database, ${r.labels} label files and ${r.notes} note files. Restart the API now.` });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  const used = data?.folders.reduce((n, f) => n + f.bytes, 0) ?? 0;
  const free = data?.disk ? data.disk.free / data.disk.total : null;
  return (
    <div className="pane">
      <PaneHead title="Storage and backup" lede="What the app keeps on disk, how to free space, and a backup of everything that cannot be made again." />
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          {data.disk && free != null ? (
            <div className="disk">
              <div className="disk-bar" role="img" aria-label={`${bytes(data.disk.free)} free of ${bytes(data.disk.total)}`}>
                <span style={{ width: `${Math.max(1, (used / data.disk.total) * 100)}%` }} className="disk-app" />
                <span style={{ width: `${Math.max(0, (1 - free) * 100 - (used / data.disk.total) * 100)}%` }} className="disk-other" />
              </div>
              <p className="meta">
                Round Reviewer uses <b>{bytes(used)}</b>. {bytes(data.disk.free)} free of {bytes(data.disk.total)}.
              </p>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Folder</th>
                  <th>Path</th>
                  <th className="n">Size</th>
                </tr>
              </thead>
              <tbody>
                {data.folders.map((f) => (
                  <tr key={f.name}>
                    <td>{FOLDER[f.name] ?? f.name}</td>
                    <td className="mono small">{f.path}</td>
                    <td className="n num">{bytes(f.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="sec">
            <div className="sec-h">
              <h2>Free space</h2>
            </div>
            <ul className="rows">
              <li>
                <span>
                  <b>Unpacked demos.</b> <span className="meta">Replays and clips stay; only parsing again would need them.</span>
                </span>
                <ConfirmButton label="Delete" danger={false} question="Delete the unpacked .dem files?" onConfirm={() => clean({ work: true })} />
              </li>
              <li>
                <span>
                  <b>Old coach runs.</b>{' '}
                  <label className="meta">
                    Older than <input className="field tiny" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} /> days. The Lab and the
                    fine-tuning set read these.
                  </label>
                </span>
                <ConfirmButton label="Delete" question={`Delete coach runs older than ${days} days?`} onConfirm={() => clean({ tracesOlderThanDays: days })} />
              </li>
              <li>
                <span>
                  <b>Failed uploads.</b> <span className="meta">Matches that could not be processed.</span>
                </span>
                <ConfirmButton label="Delete" question="Delete every failed match?" onConfirm={() => clean({ failed: true })} />
              </li>
            </ul>
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Backup</h2>
            </div>
            <p className="meta">
              The database (accounts, reviews, notes, feedback), hand labels and own map notes. Demos and clips are left out: keep the demo files and upload them again if needed.
            </p>
            <div className="row-btns start">
              <a className="btn" href={api.admin.backupUrl()} download>
                Download Backup
              </a>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="sr-only"
                id="restore-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) setRestoring(file);
                }}
              />
              <label htmlFor="restore-file" className="btn">
                Restore from a Backup…
              </label>
            </div>
            {restoring ? (
              <div className="callout warn">
                <p>
                  Restore <b>{restoring.name}</b>? It replaces the accounts, reviews and notes on this computer.
                </p>
                <div className="row-btns start">
                  <button type="button" className="btn" onClick={() => setRestoring(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void restore(restoring)}>
                    Restore
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
