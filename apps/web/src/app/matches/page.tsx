"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { ConfirmButton, Secret } from "@/components/admin/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { useCoachLanguage } from "@/lib/coach/language";
import type { MatchRow, SystemStatus } from "@/lib/contracts";
import { errorText } from "@/lib/format";

const STATUS_LABEL: Partial<Record<string, string>> = {
  complete: "Reviewed",
  awaiting_player: "Pick a player",
  failed: "Failed",
};

/**
 * Matches: the signed-in player's matches (every match on this PC with accounts off), who wrote
 * each review, re-run, rename, share and delete (A08, A12, A14; doc 29 §2.4, R13).
 */
export default function MatchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [language] = useCoachLanguage();
  const { state } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [shareOn, setShareOn] = useState(false);

  useEffect(() => {
    api
      .listMatches()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The API did not answer."));
    api.getSystem().then(setSystem).catch(() => undefined);
    api
      .features()
      .then((f) => setShareOn(!!f.shareLinks))
      .catch(() => undefined);
  }, []);

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

  return (
    <main className="main wide page-list" id="content">
      <header className="page-h">
        <div>
          <h1>Matches</h1>
          <p className="lede">
            {state?.authEnabled ? "Your matches" : "Every match on this computer"}, newest first, with the model that wrote its review.
          </p>
        </div>
        <Link className="btn btn-fill" href="/upload">
          Add match
        </Link>
      </header>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {rows === null ? (
        <p className="meta">Loading matches…</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>No matches yet. Add a demo to start.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Map</th>
                <th scope="col" className="n">Score</th>
                <th scope="col">Played</th>
                <th scope="col">Player</th>
                <th scope="col" className="n">Moments</th>
                <th scope="col">Review written by</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const ready = m.status === "complete" && m.playerId;
                return (
                  <Fragment key={m.id}>
                  <tr>
                    <td>
                      <Link className="row-open" href={ready || m.status === "awaiting_player" ? `/studio/${m.id}` : `/processing/${m.id}`}>
                        {m.title || m.map}
                      </Link>
                      {m.title ? <span className="meta"> {m.map}</span> : null}
                    </td>
                    <td className="n num">{m.score}</td>
                    <td>{m.when}</td>
                    <td>{m.playerName ?? <span className="meta">{STATUS_LABEL[m.status] ?? m.status}</span>}</td>
                    <td className="n num">{m.moments || ""}</td>
                    <td>
                      {m.playerId ? (
                        <>
                          <span className="mono">{m.model ?? "templates"}</span>
                          {m.versions ? (
                            <span className="meta">
                              {" "}
                              · {m.versions} earlier {m.versions === 1 ? "review" : "reviews"} kept
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </td>
                    <td className="row-actions">
                      {ready ? (
                        confirm === m.id ? (
                          <span className="confirm">
                            Review again with <span className="mono">{served ?? "templates"}</span>?{" "}
                            <button type="button" className="link" disabled={busy === m.id} onClick={() => void rerun(m.id)}>
                              {busy === m.id ? "Starting…" : "Re-run"}
                            </button>{" "}
                            <button type="button" className="link" onClick={() => setConfirm(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="link" onClick={() => setConfirm(m.id)}>
                            Re-run the coach
                          </button>
                        )
                      ) : null}{" "}
                      <button
                        type="button"
                        className="link"
                        aria-expanded={open === m.id}
                        aria-controls={`more-${m.id}`}
                        onClick={() => setOpen(open === m.id ? null : m.id)}
                      >
                        More
                      </button>
                    </td>
                  </tr>
                  {open === m.id ? (
                    <tr className="row-more" id={`more-${m.id}`}>
                      <td colSpan={7}>
                        <MatchActions
                          row={m}
                          shareOn={shareOn && !!ready}
                          onRenamed={(title) => update(m.id, { title })}
                          onDeleted={() => setRows((rs) => rs?.filter((r) => r.id !== m.id) ?? rs)}
                        />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="meta note-below">
        A re-run uses the model llama-server is serving now
        {llm ? (llm.state === "ok" ? `, ${served ?? "unknown"}` : llm.state === "off" ? " (the coach model is off, so templates)" : ", which is not reachable") : ""}
        . To review with another model, start llama-server with it and check{" "}
        <Link href="/settings#system">Settings, System</Link>. The earlier review is kept.
      </p>
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
        {!["complete", "awaiting_player", "failed"].includes(row.status) ? (
          <span className="meta">Delete is available once processing stops.</span>
        ) : (
          <ConfirmButton
            label="Delete match"
            question={`Delete ${row.title || row.map} ${row.score}, its review, clips and notes?`}
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
