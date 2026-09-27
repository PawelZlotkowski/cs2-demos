"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LABELS } from "@/components/SystemNotice";
import { useAuth } from "@/components/auth/AuthProvider";
import { CoachPrefs, Profile, Sessions, YourData } from "@/components/settings/AccountSections";
import { api } from "@/lib/api/client";
import type { SystemStatus } from "@/lib/contracts";

const STATE_LABEL = { ok: "Working", off: "Off", problem: "Not working" } as const;

/**
 * Settings (A07): profile, coach and playback, sign-ins and your data for the account; System
 * and Connect another app for admins, or for this PC when accounts are off (doc 29 §4.1, R01).
 */
export default function SettingsPage() {
  const { state, isAdmin } = useAuth();
  const accounts = !!state?.authEnabled;
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
    if (isAdmin) void check();
  }, [isAdmin]);

  // The Steam link callback comes back here with ?error= when it could not link
  const [linkError, setLinkError] = useState<string | null>(null);
  useEffect(() => setLinkError(new URLSearchParams(window.location.search).get("error")), []);

  return (
    <main className="main page-settings" id="content">
      <header className="page-h">
        <div>
          <h1>Settings</h1>
        </div>
      </header>
      {linkError ? (
        <p className="err" role="alert">
          {linkError}
        </p>
      ) : null}

      {accounts ? <Profile /> : null}
      <CoachPrefs />
      {accounts ? <Sessions /> : null}
      {accounts ? <YourData /> : null}

      {isAdmin ? (
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
      ) : null}

      {isAdmin ? <ConnectApp tools={status?.mcpTools ?? []} accounts={accounts} /> : null}
    </main>
  );
}

const LM_STUDIO = `{
  "mcpServers": {
    "cs2-demo": {
      "command": "python",
      "args": ["-m", "cs2_demo_mcp"],
      "env": { "RR_DATA_DIR": "C:/path/to/cs2-demos/apps/api/data" }
    }
  }
}`;

/** Settings, Connect another app: the cs2-demo MCP server in a local chat app (doc 29 §4.2, R14). */
function ConnectApp({ tools, accounts }: { tools: string[]; accounts: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  const rows: { id: string; label: string; text: string; note: string }[] = [
    {
      id: "http",
      label: "Streamable HTTP",
      text: "python -m cs2_demo_mcp --transport http",
      note: "Serves http://127.0.0.1:8765/mcp. Add that URL as an MCP server in Open WebUI (External tools in recent versions).",
    },
    {
      id: "stdio",
      label: "Standard input and output",
      text: "python -m cs2_demo_mcp",
      note: "For apps that start the server themselves. LM Studio: put the block below in its mcp.json.",
    },
    {
      id: "inspector",
      label: "Check it first",
      text: "npx @modelcontextprotocol/inspector python -m cs2_demo_mcp",
      note: "Lists the tools and lets you call one by hand.",
    },
  ];

  return (
    <section id="connect" className="settings-sec" aria-labelledby="connect-h">
      <div className="sec-h">
        <h2 id="connect-h">Connect another app</h2>
      </div>
      <p className="meta">
        The coach&rsquo;s tools are an MCP server, so a local chat app can read your matches the same way the coach does. Run
        it from the repo with the API&rsquo;s Python environment, and set <code>RR_DATA_DIR</code> to{" "}
        <code>apps/api/data</code> when you start it from another folder. It listens on this computer only, and two
        tools write (<code>select_moments</code>, <code>request_clip</code>), so connect only apps you trust.
      </p>
      {accounts ? (
        <p className="meta">
          With accounts on, the HTTP server asks for an API token. Make one in the admin panel under{" "}
          <Link href="/admin/security">Security</Link> and give the app <code>Authorization: Bearer rr_…</code>. A
          read-only token cannot use the two writing tools.
        </p>
      ) : null}
      <ul className="checks connect">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="check-name">{r.label}</span>
            <code className="cmd">{r.text}</code>
            <button type="button" className="link small" onClick={() => void copy(r.id, r.text)}>
              {copied === r.id ? "Copied" : "Copy"}
            </button>
            <span className="check-detail">{r.note}</span>
          </li>
        ))}
      </ul>
      <pre className="out">{LM_STUDIO}</pre>
      {tools.length ? (
        <p className="meta">
          {tools.length} tools: {tools.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
