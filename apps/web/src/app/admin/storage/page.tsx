"use client";

import { useRef, useState } from "react";
import { ConfirmButton, LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { bytes, errorText } from "@/lib/format";

const NAMES: Record<string, string> = {
  uploads: "Uploaded demos",
  work: "Unpacked demos (work)",
  matches: "Replays and clips",
  traces: "Coach runs",
  dataset: "Fine-tuning set",
  database: "Database",
};

/** Admin, Storage and backup (doc 30 AD11, AD15). */
export default function AdminStorage() {
  const { data, error, reload } = useLoad(() => api.admin.storage());
  const [msg, setMsg] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const fileRef = useRef<HTMLInputElement>(null);

  async function clean(body: { work?: boolean; tracesOlderThanDays?: number; failed?: boolean }) {
    const r = await api.admin.cleanup(body);
    setMsg(`Freed ${bytes(r.freedBytes)}.`);
    await reload();
  }

  const used = data?.folders.reduce((n, f) => n + f.bytes, 0) ?? 0;
  return (
    <main className="main wide" id="content">
      <PageHead title="Storage and backup" lede="What the app keeps on disk, how to free space, and a backup of everything that cannot be made again." />
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
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
                    <td>{NAMES[f.name] ?? f.name}</td>
                    <td className="mono">{f.path}</td>
                    <td className="n">{bytes(f.bytes)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>All</b>
                  </td>
                  <td className="meta">{data.disk ? `${bytes(data.disk.free)} free of ${bytes(data.disk.total)}` : null}</td>
                  <td className="n">
                    <b>{bytes(used)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <section className="settings-sec" aria-labelledby="free-h">
            <div className="sec-h">
              <h2 id="free-h">Free space</h2>
            </div>
            <ul className="plain-list">
              <li>
                <b>Unpacked demos.</b> <span className="meta">Replays and clips stay; only a re-run of parsing would need them.</span>{" "}
                <ConfirmButton label="Delete" danger={false} question="Delete the unpacked .dem files?" onConfirm={() => clean({ work: true })} />
              </li>
              <li>
                <b>Old coach runs.</b>{" "}
                <label>
                  <span className="meta">Older than </span>
                  <input className="input small tiny" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
                  <span className="meta"> days. The Lab and the fine-tuning set read these.</span>
                </label>{" "}
                <ConfirmButton label="Delete" question={`Delete coach runs older than ${days} days?`} onConfirm={() => clean({ tracesOlderThanDays: days })} />
              </li>
              <li>
                <b>Failed uploads.</b> <span className="meta">Matches that could not be processed.</span>{" "}
                <ConfirmButton label="Delete" question="Delete every failed match?" onConfirm={() => clean({ failed: true })} />
              </li>
            </ul>
          </section>

          <section className="settings-sec" aria-labelledby="backup-h">
            <div className="sec-h">
              <h2 id="backup-h">Backup</h2>
            </div>
            <p className="meta">
              The database (accounts, reviews, notes, feedback), hand labels and own map notes. Demos and clips are left out: keep
              the demo files and upload them again if needed.
            </p>
            <p className="row-actions">
              <a className="btn btn-line" href={api.admin.backupUrl()} download>
                Download backup
              </a>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="sr-only"
                id="restore"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (!window.confirm(`Restore ${file.name}? It replaces the accounts, reviews and notes on this PC.`)) return;
                  try {
                    const r = await api.admin.restore(file);
                    setMsg(`Restored the database, ${r.labels} label files and ${r.notes} note files. Restart the API now.`);
                  } catch (err) {
                    setMsg(errorText(err));
                  }
                }}
              />
              <label htmlFor="restore" className="btn btn-line">
                Restore from a backup…
              </label>
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
