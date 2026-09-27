"use client";

import { useEffect, useState } from "react";
import { LABELS } from "@/components/SystemNotice";
import { api } from "@/lib/api/client";
import type { SystemStatus } from "@/lib/contracts";

const STATE_LABEL = { ok: "Working", off: "Off", problem: "Not working" } as const;

/** Settings, System: what the local setup is doing (doc 29 §4.1, R01). Profile, coach and data sections come with accounts (A07). */
export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const s = await api.getSystem();
      setStatus(s);
      try {
        const bad = s.checks.filter((c) => c.state === "problem").map((c) => LABELS[c.name]);
        window.sessionStorage.setItem(
          "rr.system",
          JSON.stringify({ at: Date.now(), problem: bad.length ? `${bad.join(" and ")} not working` : null }),
        );
      } catch {
        /* storage blocked */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The API did not answer.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void check();
  }, []);

  return (
    <main className="main" id="content">
      <header className="page-h">
        <div>
          <h1>Settings</h1>
        </div>
      </header>

      <section id="system" className="settings-sec" aria-labelledby="system-h">
        <div className="sec-h">
          <h2 id="system-h">System</h2>
          <button type="button" className="btn btn-line" onClick={() => void check()} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </button>
        </div>
        <p className="meta">
          The API reads <code>apps/api/.env</code> only when it starts, so restart it after changing a setting.
        </p>
        {error ? (
          <p className="err" role="alert">
            The API is not reachable ({error}). Start it on port 8000 and check again.
          </p>
        ) : status === null ? (
          <p className="meta">Checking…</p>
        ) : (
          <>
            <ul className="checks">
              {status.checks.map((c) => (
                <li key={c.name} data-state={c.state}>
                  <span className="check-name">{LABELS[c.name]}</span>
                  <span className="check-state">{STATE_LABEL[c.state]}</span>
                  <span className="check-detail">{c.detail}</span>
                </li>
              ))}
            </ul>
            <dl className="facts">
              <div>
                <dt>RR_LLM_MODEL</dt>
                <dd className="mono">{status.llmModel}</dd>
              </div>
              <div>
                <dt>Served on the port</dt>
                <dd className="mono">{status.servedModels.length ? status.servedModels.join(", ") : "nothing"}</dd>
              </div>
              <div>
                <dt>Coach tools over MCP</dt>
                <dd className="mono">{status.mcpTools.length ? status.mcpTools.join(", ") : "none"}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
