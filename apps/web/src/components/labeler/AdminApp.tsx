"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatBytes, HANDLE, mapName } from "@/lib/labeler/manifest";
import { api, ApiError } from "./api";
import { assessmentText, issueText, when, type AdminAccount, type AdminNote, type Overview } from "./adminTypes";
import { CodeReveal } from "./CodeReveal";

type Tab = "reviewers" | "collections" | "notes" | "storage";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "reviewers", label: "Reviewers" },
  { id: "collections", label: "Collections" },
  { id: "notes", label: "Notes" },
  { id: "storage", label: "Storage" },
];

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("reviewers");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/admin/overview"));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The overview could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    const fromHash = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, [load]);

  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  }

  return (
    <main className="lb-main lb-admin" id="content">
      <div className="lb-admin-head">
        <h1>Clip labeller</h1>
        <div className="lb-segmented lb-tabs" role="tablist" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => choose(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="lb-notice lb-notice-problem" role="alert">
          {error}{" "}
          <button type="button" className="lb-btn lb-btn-quiet" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}
      {!overview && !error ? <p className="lb-notice" role="status">Loading…</p> : null}
      {reveal && overview ? <CodeReveal name={reveal.name} code={reveal.code} site={overview.siteOrigin} onClose={() => setReveal(null)} /> : null}
      {overview ? (
        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "reviewers" ? <Reviewers overview={overview} reload={load} onCode={setReveal} /> : null}
          {tab === "collections" ? <Collections overview={overview} reload={load} /> : null}
          {tab === "notes" ? <Notes overview={overview} /> : null}
          {tab === "storage" ? <Storage overview={overview} /> : null}
        </section>
      ) : null}
    </main>
  );
}

function Reviewers({ overview, reload, onCode }: { overview: Overview; reload: () => Promise<void>; onCode: (value: { name: string; code: string }) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!HANDLE.test(handle)) {
      setMessage("The export handle needs 1–40 letters, digits or underscores.");
      return;
    }
    setBusy("add");
    setMessage(null);
    try {
      const result = await api<{ code: string; account: { displayName: string } }>("/admin/accounts", { body: { displayName, handle } });
      setDisplayName("");
      setHandle("");
      onCode({ name: result.account.displayName, code: result.code });
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The reviewer could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function act(account: AdminAccount, action: "deactivate" | "activate" | "regenerate" | "revoke") {
    const questions: Record<string, string> = {
      deactivate: `Deactivate ${account.displayName}? Their code stops working and every session ends now. Their notes are kept.`,
      regenerate: `Issue a new code for ${account.displayName}? The old code and every current session stop working.`,
      revoke: `Sign ${account.displayName} out on every device? Their code keeps working.`,
      activate: `Reactivate ${account.displayName} with a new code?`,
    };
    if (!window.confirm(questions[action])) return;
    setBusy(`${account.id}:${action}`);
    setMessage(null);
    try {
      const result = await api<{ code?: string; self?: boolean; revokedSessions?: number }>(`/admin/accounts/${account.id}`, { body: { action } });
      if (result.self && action !== "activate") {
        window.location.assign("/label/login?ended=1");
        return;
      }
      if (result.code) onCode({ name: account.displayName, code: result.code });
      else setMessage(action === "revoke" ? `Ended ${result.revokedSessions ?? 0} session(s) for ${account.displayName}.` : `${account.displayName} is deactivated.`);
      await reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "That change failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="lb-stack">
      <form className="lb-panel sheet lb-form-row" onSubmit={add}>
        <h2>Add a reviewer</h2>
        <label className="lb-field" htmlFor="new-display-name">
          <span className="lb-label">Display name</span>
          <input id="new-display-name" className="lb-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} required />
        </label>
        <label className="lb-field" htmlFor="new-handle">
          <span className="lb-label">Export handle</span>
          <input
            id="new-handle"
            className="lb-input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={40}
            pattern="[A-Za-z0-9_]{1,40}"
            aria-describedby="handle-help"
            required
          />
        </label>
        <p className="lb-hint" id="handle-help">
          Letters, digits and underscores. It names this person in exported notes and cannot change later. If they also label locally, give them a different handle here, for example alex_web.
        </p>
        <button type="submit" className="lb-btn lb-btn-primary" disabled={busy === "add" || !displayName.trim() || !handle}>
          {busy === "add" ? "Adding…" : "Add reviewer and create code"}
        </button>
      </form>
      {message ? (
        <p className="lb-notice" role="status">
          {message}
        </p>
      ) : null}
      <div className="lb-panel sheet">
        <h2>People</h2>
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Status</th>
                <th scope="col">Progress</th>
                <th scope="col">Last seen</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overview.accounts.map((account) => (
                <tr key={account.id}>
                  <th scope="row">
                    <span className="lb-strong">{account.displayName}</span>
                    <span className="lb-meta">
                      {account.handle}
                      {account.role === "admin" ? ", administrator" : ""}
                    </span>
                  </th>
                  <td>
                    <span className={`lb-pill lb-pill-${account.status}`}>{account.status === "active" ? "Active" : "Inactive"}</span>
                    <span className="lb-meta">{account.activeSessions} signed-in device(s)</span>
                  </td>
                  <td>
                    {account.complete} of {account.assignedClips} reviewed
                    <span className="lb-meta">
                      {account.drafts} draft(s), {account.skipped} skipped{account.issues ? `, ${account.issues} problem(s) reported` : ""}
                    </span>
                  </td>
                  <td>{when(account.lastSeenAt)}</td>
                  <td className="lb-row-actions">
                    {account.status === "active" ? (
                      <>
                        <button type="button" className="lb-btn lb-btn-small" disabled={busy !== null} onClick={() => void act(account, "regenerate")}>
                          New code
                        </button>
                        <button type="button" className="lb-btn lb-btn-small" disabled={busy !== null} onClick={() => void act(account, "revoke")}>
                          Sign out everywhere
                        </button>
                        <button type="button" className="lb-btn lb-btn-small lb-btn-danger" disabled={busy !== null} onClick={() => void act(account, "deactivate")}>
                          Deactivate
                        </button>
                      </>
                    ) : (
                      <button type="button" className="lb-btn lb-btn-small" disabled={busy !== null} onClick={() => void act(account, "activate")}>
                        Reactivate with new code
                      </button>
                    )}
                    <a className="lb-btn lb-btn-small" href={`/api/labeler/admin/export/${account.id}`} download>
                      Download notes
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Collections({ overview, reload }: { overview: Overview; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState("");
  const names = useMemo(() => new Map(overview.accounts.map((a) => [a.id, a.displayName])), [overview.accounts]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const created = await api<{ id: string }>("/admin/collections", { body: { name } });
      window.location.assign(`/label/admin/collections/${created.id}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The collection could not be created.");
      setBusy(false);
    }
    void reload;
  }

  const shown = overview.collections.filter((c) => !mapFilter || c.maps.includes(mapFilter));
  return (
    <div className="lb-stack">
      <form className="lb-panel sheet lb-form-row" onSubmit={create}>
        <h2>New collection</h2>
        <label className="lb-field" htmlFor="new-collection">
          <span className="lb-label">Name</span>
          <input id="new-collection" className="lb-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ancient pilot, ten clips" required />
        </label>
        <button type="submit" className="lb-btn lb-btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create collection"}
        </button>
        {message ? <p className="lb-error" role="alert">{message}</p> : null}
      </form>
      <div className="lb-panel sheet">
        <div className="lb-panel-head">
          <h2>Collections</h2>
          <label className="lb-field lb-field-inline">
            <span className="lb-label">Map</span>
            <select className="lb-input" value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
              <option value="">All maps</option>
              <option value="de_ancient">Ancient</option>
              <option value="de_anubis">Anubis</option>
            </select>
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="lb-meta">No collections yet. Create one, then import an exported folder into it.</p>
        ) : (
          <ul className="lb-cards">
            {shown.map((c) => (
              <li key={c.id} className="lb-card lb-card-flat">
                <div className="lb-card-head">
                  <h3>
                    <Link href={`/label/admin/collections/${c.id}`}>{c.name}</Link>
                  </h3>
                  <span className={`lb-pill lb-pill-${c.status}`}>{c.status === "draft" ? "Draft" : c.status === "published" ? "Published" : "Archived"}</span>
                </div>
                <p className="lb-meta">
                  {c.maps.length ? c.maps.map(mapName).join(" and ") : "No clips yet"}. {c.published} published, {c.ready} of {c.clips} uploaded, {formatBytes(c.bytes)}.
                </p>
                <p className="lb-meta">{c.assignees.length ? `Assigned to ${c.assignees.map((id) => names.get(id) ?? "unknown").join(", ")}` : "Not assigned yet"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Notes({ overview }: { overview: Overview }) {
  const [collectionId, setCollectionId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState<AdminNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (collectionId) query.set("collectionId", collectionId);
    if (accountId) query.set("accountId", accountId);
    if (status) query.set("status", status);
    let cancelled = false;
    setNotes(null);
    api<{ notes: AdminNote[] }>(`/admin/notes?${query}`)
      .then((result) => !cancelled && setNotes(result.notes))
      .catch((caught) => !cancelled && setError(caught instanceof ApiError ? caught.message : "Notes could not load."));
    return () => {
      cancelled = true;
    };
  }, [collectionId, accountId, status]);

  return (
    <div className="lb-panel sheet">
      <div className="lb-panel-head">
        <h2>Notes</h2>
        <div className="lb-filters">
          <label className="lb-field lb-field-inline">
            <span className="lb-label">Collection</span>
            <select className="lb-input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">All</option>
              {overview.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="lb-field lb-field-inline">
            <span className="lb-label">Reviewer</span>
            <select className="lb-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Everyone</option>
              {overview.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="lb-field lb-field-inline">
            <span className="lb-label">State</span>
            <select className="lb-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              <option value="complete">Reviewed</option>
              <option value="draft">Draft</option>
              <option value="skipped">Skipped</option>
              <option value="issue">Problem reported</option>
            </select>
          </label>
          {accountId ? (
            <a className="lb-btn lb-btn-small" href={`/api/labeler/admin/export/${accountId}`} download>
              Download this reviewer&apos;s notes
            </a>
          ) : null}
        </div>
      </div>
      {error ? <p className="lb-error" role="alert">{error}</p> : null}
      {notes === null && !error ? <p className="lb-meta" role="status">Loading notes…</p> : null}
      {notes && notes.length === 0 ? <p className="lb-meta">No saved notes match these filters.</p> : null}
      {notes && notes.length ? (
        <ul className="lb-notes">
          {notes.map((note) => (
            <li key={`${note.accountId}:${note.clipId}`} className="lb-note-item">
              <p className="lb-meta">
                <span className="lb-strong">{note.displayName}</span> on {note.playerName}, {mapName(note.map)} round {note.round}, {note.demoFile}
              </p>
              <p className="lb-meta">
                {note.status === "complete" ? "Reviewed" : note.status === "draft" ? "Draft" : "Skipped"}
                {note.assessment ? `, ${assessmentText(note.assessment)}` : ""}
                {note.issue ? `, ${issueText(note.issue)}` : ""}
                {note.detector ? `, detector ${note.detector} ${note.findingId}` : ""}, {note.language === "pl" ? "Polish" : "English"}, revision {note.revision}, {when(note.savedAt)}
              </p>
              {note.notes ? <p className="lb-quote">{note.notes}</p> : <p className="lb-meta">No text</p>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Storage({ overview }: { overview: Overview }) {
  const { storage, limits } = overview;
  const used = storage.readyBytes + storage.reservedBytes;
  return (
    <div className="lb-stack">
      <div className="lb-panel sheet">
        <h2>Stored clips</h2>
        <dl className="lb-stats">
          <div>
            <dt>Stored in {overview.bucket}</dt>
            <dd className="num">{formatBytes(storage.readyBytes)}</dd>
            <dd className="lb-meta">{storage.readyClips} ready clips of {storage.totalClips} registered</dd>
          </div>
          <div>
            <dt>Reserved by unfinished uploads</dt>
            <dd className="num">{formatBytes(storage.reservedBytes)}</dd>
            <dd className="lb-meta">{storage.openUploads} open upload(s)</dd>
          </div>
          <div>
            <dt>Upload limit</dt>
            <dd className="num">{formatBytes(limits.maxTotalBytes)}</dd>
            <dd className="lb-meta">{formatBytes(Math.max(0, limits.maxTotalBytes - used))} left</dd>
          </div>
        </dl>
        <div className="lb-progress" role="img" aria-label={`${formatBytes(used)} of ${formatBytes(limits.maxTotalBytes)} used`}>
          <span style={{ width: `${Math.min(100, (used / limits.maxTotalBytes) * 100)}%` }} />
        </div>
      </div>
      <div className="lb-panel sheet">
        <h2>Limits on this site</h2>
        <ul className="lb-list">
          <li>Each clip may be up to {formatBytes(limits.maxClipBytes)}. Files upload directly to private storage in parts of {formatBytes(limits.partSize)}.</li>
          <li>At most {limits.maxClips} clips and {limits.maxOpenUploads} unfinished uploads at once.</li>
          <li>Cloud storage discards unfinished uploads after seven days. This site restarts an older upload instead of resuming it.</li>
          <li>Your original recordings stay on your PC. Deleting cloud clips is not offered here, so published media and review history are never lost by accident.</li>
        </ul>
      </div>
      <div className="lb-panel sheet">
        <h2>Costs</h2>
        <p>
          These totals cover only this site&apos;s bucket. The free R2 allowance is shared by every bucket in your Cloudflare account, so check the account total before a large upload. Usage beyond the allowance is billed.
        </p>
        <div className="lb-actions">
          <a className="lb-btn lb-btn-secondary" href="https://dash.cloudflare.com/?to=/:account/r2/overview" target="_blank" rel="noreferrer">
            Open Cloudflare R2 usage
          </a>
          <a className="lb-btn lb-btn-quiet" href="https://developers.cloudflare.com/r2/pricing/" target="_blank" rel="noreferrer">
            R2 pricing
          </a>
        </div>
        <p className="lb-meta">Cloud workspace ID for exported notes: {overview.originId}</p>
      </div>
    </div>
  );
}
