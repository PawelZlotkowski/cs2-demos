"use client";

import { LoadingState } from "@/components/LoadingState";
import { useSystemStatus } from "@/components/SystemNotice";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmButton, Secret } from "@/components/admin/ui";
import { FolderShape, MatchFolder, RecurringFindings, UploadFolder } from "@/components/review/MatchFolders";
import { PillBubble } from "@/components/PillBubble";
import { modelLabel } from "@/components/coach/CoachExplanation";
import { api } from "@/lib/api/client";
import { useCoachLanguage } from "@/lib/coach/language";
import type { MatchRow } from "@/lib/contracts";
import { errorText } from "@/lib/format";

/**
 * Matches: the signed-in player's matches (every match on this PC with accounts off), who wrote
 * each review, re-run, rename, share and delete (A08, A12, A14; doc 29 §2.4, R13).
 */
export default function MatchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const system = useSystemStatus();
  const [attempt, setAttempt] = useState(0);
  const [listError, setListError] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [language] = useCoachLanguage();
  const [filter, setFilter] = useState("All");
  const optionsRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shareOn, setShareOn] = useState(false);

  useEffect(() => {
    let live = true;
    setListError(false);
    api.listMatches().then((data) => { if (live) setRows(data); })
      .catch(() => { if (live) setListError(true); });
    return () => { live = false; };
  }, [attempt]);
  useEffect(() => {
    api
      .features()
      .then((f) => setShareOn(!!f.shareLinks))
      .catch(() => undefined);
  }, []);

  const processingMatches = rows?.some((r) => !["complete", "failed", "awaiting_player", "awaiting_setup"].includes(r.status));
  useEffect(() => {
    if (!processingMatches) return;
    let live = true;
    const timer = window.setInterval(() => {
      api.listMatches().then((next) => { if (live) setRows(next); }).catch(() => undefined);
    }, 10000);
    return () => { live = false; window.clearInterval(timer); };
  }, [processingMatches]);

  const update = (id: string, patch: Partial<MatchRow>) =>
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? rs);

  const llm = system?.checks.find((c) => c.name === "llm");
  const served = system?.servedModels[0] ?? null;

  async function rerun(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.rerunCoach(id, language);
      router.push(`/processing/${id}`);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Unable to start the re-run.");
    }
  }

  const selected = rows?.find((m) => m.id === open);
  useEffect(() => {
    if (selected && !optionsRef.current?.open) optionsRef.current?.showModal();
  }, [selected]);

  const reviewed = rows?.filter((m) => m.status === "complete").length ?? 0;
  const processing = rows?.filter((m) => m.status !== "complete" && m.status !== "failed").length ?? 0;
  const failed = rows?.filter((m) => m.status === "failed").length ?? 0;
  const visible = rows?.filter((r) => filter === "All" || r.map.toLowerCase().replace(/^de_/, "") === filter.toLowerCase());

  return (
    <main id="content" className="main library">
      <FolderShape />
      <header className="library-heading">
        <h1>Your matches</h1>
        {!!rows?.length && <p>{[reviewed ? `${reviewed} reviewed` : "", processing ? `${processing} in progress` : "", failed ? `${failed} failed` : ""].filter(Boolean).join(", ")}</p>}
        <div className="library-filter seg" role="group" aria-label="Filter matches by map">
          <PillBubble value={filter} />
          {["All", "Anubis", "Ancient"].map((map) => <button key={map} type="button" aria-pressed={filter === map}
            onClick={() => setFilter(map)}>{map}</button>)}
        </div>
      </header>
      {listError ? <section className="sheet state-sheet">
        <p role="alert">Your match library could not be loaded.</p>
        <button type="button" className="btn btn-line" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </section> : !rows ? <LoadingState label="Loading matches…" shape="folder" /> : <>
        {rows.length > 0 && !visible?.length && <p className="library-empty" role="status">No matches on {filter} yet.</p>}
        <div className="folder-grid">
          {visible?.map((row) => <MatchFolder key={row.id} row={row} expanded={open === row.id}
            onMore={() => { setConfirm(null); setOpen(row.id); }} />)}
          <UploadFolder />{rows.length > 0 && <RecurringFindings />}
        </div>
      </>}
      <dialog ref={optionsRef} className="folder-dialog sheet" aria-labelledby="match-options-title"
        onClose={() => { setOpen(null); setConfirm(null); }}>
        {selected && <>
          <header><div><h2 id="match-options-title">{selected.title || selected.map}</h2>
            <p className="meta">{[selected.when, selected.playerName].filter(Boolean).join(", ")}</p></div>
            <button type="button" className="btn btn-line" onClick={() => optionsRef.current?.close()}>Close</button>
          </header>
          <div id="library-actions">
            {selected.playerId && <p>Review written by {selected.model ? modelLabel(selected.model) : "the finding templates"}.</p>}
            <MatchActions key={selected.id} row={selected} shareOn={shareOn && selected.status === "complete" && !!selected.playerId}
              onRenamed={(title) => update(selected.id, { title })}
              onDeleted={() => { optionsRef.current?.close(); setRows((rs) => rs?.filter((r) => r.id !== selected.id) ?? rs); }} />
            {selected.status === "complete" && selected.playerId && <div className="rerun-controls">
              {confirm === selected.id ? <>
                <p>Review again with {llm?.state === "off" ? "the finding templates" : served ? modelLabel(served) : "the currently configured coach"}? The earlier review will be kept.</p>
                <button className="btn btn-fill" disabled={busy === selected.id} onClick={() => void rerun(selected.id)}>{busy ? "Starting…" : "Re-run"}</button>
                <button className="btn btn-line" onClick={() => setConfirm(null)}>Cancel</button>
              </> : <button className="btn btn-line" onClick={() => setConfirm(selected.id)}>Re-run the coach</button>}
            </div>}
            {error && <p role="alert" className="err">{error}</p>}
          </div>
        </>}
      </dialog>
    </main>
  );
}

/** Rename, earlier reviews, share link and delete for one match, under its row. */
function MatchActions({
  row,
  shareOn,
  onRenamed,
  onDeleted,
}: {
  row: MatchRow;
  shareOn: boolean;
  onRenamed: (title: string | null) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(row.title ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [shared, setShared] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!shareOn) return;
    api
      .shareState(row.id)
      .then((s) => setShared(s.active))
      .catch(() => undefined);
  }, [row.id, shareOn]);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    try {
      const out = await api.renameMatch(row.id, title.trim() || null);
      onRenamed(out.title);
      setMsg("Saved.");
    } catch (err) {
      setMsg(errorText(err));
    }
  }

  return (
    <div className="match-actions">
      <form className="inline-form" onSubmit={rename}>
        <label>
          Name
          <input className="input small" value={title} placeholder={row.map} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-line small">
          Rename
        </button>
        {msg ? (
          <span className="meta" role="status">
            {msg}
          </span>
        ) : null}
      </form>
      <div className="match-actions-row">
        {row.versions ? (
          <Link className="link small" href={`/matches/${row.id}/versions`}>
            {row.versions} earlier {row.versions === 1 ? "review" : "reviews"}
          </Link>
        ) : null}
        {shareOn ? (
          shared ? (
            <ConfirmButton
              label="Stop sharing"
              question="Turn off the share link? Anyone holding it loses access."
              onConfirm={async () => {
                await api.unshare(row.id);
                setShared(false);
                setLink(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="link small"
              onClick={async () => {
                try {
                  const out = await api.share(row.id);
                  setLink(`${window.location.origin}${out.path}`);
                  setShared(true);
                } catch (err) {
                  setMsg(errorText(err));
                }
              }}
            >
              Make a share link
            </button>
          )
        ) : null}
        {!["complete", "awaiting_player", "awaiting_setup", "failed"].includes(row.status) ? (
          <span className="meta">Delete is available once processing stops.</span>
        ) : (
          <ConfirmButton
            label="Delete match"
            question={`Delete ${row.title || row.map}, its review, clips and notes?`}
            onConfirm={async () => {
              await api.deleteMatch(row.id);
              onDeleted();
            }}
          />
        )}
      </div>
      {link ? <Secret value={link} note="Read-only: moments, clips and explanations, no Ask. Shown once; stop sharing and make a new link to change it." /> : null}
    </div>
  );
}
