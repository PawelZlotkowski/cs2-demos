"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useCoachLanguage } from "@/lib/coach/language";
import type { MatchRow, SystemStatus } from "@/lib/contracts";

const STATUS_LABEL: Partial<Record<string, string>> = {
  complete: "Reviewed",
  awaiting_player: "Pick a player",
  failed: "Failed",
};

/** Matches: every match on this computer, who wrote its review, and a re-run (A08 without accounts; doc 29 §2.4, R13). */
export default function MatchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [language] = useCoachLanguage();

  useEffect(() => {
    api
      .listMatches()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The API did not answer."));
    api.getSystem().then(setSystem).catch(() => undefined);
  }, []);

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
          <p className="lede">Every match on this computer, newest first, with the model that wrote its review.</p>
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
                  <tr key={m.id}>
                    <td>
                      <Link className="row-open" href={ready || m.status === "awaiting_player" ? `/studio/${m.id}` : `/processing/${m.id}`}>
                        {m.map}
                      </Link>
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
                      ) : null}
                    </td>
                  </tr>
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
