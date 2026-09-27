import { useState } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { RUNS } from '../mock/lab';
import { PASSAGES, SERVED_MODEL } from '../mock/world';
import { useStore } from '../state/store';

const MCP_TOOLS = [
  'list_matches', 'list_rounds', 'list_findings', 'get_finding', 'get_round_stats', 'get_round_timeline', 'get_player_state',
  'get_match_totals', 'get_player_history', 'find_moments', 'search_knowledge', 'select_moments', 'request_clip',
];

const CHECKS = [
  { name: 'Coach model', state: 'ok', detail: `llama-server on 127.0.0.1:8080 serves ${SERVED_MODEL}.` },
  { name: 'Coach tools', state: 'ok', detail: `${MCP_TOOLS.length} tools over MCP.` },
  { name: 'Clip recording', state: 'off', detail: 'CS Demo Manager is not set up (RR_CSDM_ENABLED). The radar still covers every moment.' },
  { name: 'Knowledge base', state: 'ok', detail: `${PASSAGES.length} passages, hybrid index built 26 September.` },
  { name: 'Run log', state: 'ok', detail: `${RUNS.length} runs in data/traces.` },
] as const;

const STATE_LABEL = { ok: 'Working', off: 'Off', problem: 'Not working' } as const;

const LM_STUDIO = `{
  "mcpServers": {
    "cs2-demo": {
      "command": "python",
      "args": ["-m", "cs2_demo_mcp"],
      "env": { "RR_DATA_DIR": "C:/path/to/cs2-demos/apps/api/data" }
    }
  }
}`;

const CONNECT = [
  { id: 'http', label: 'Streamable HTTP', text: 'python -m cs2_demo_mcp --transport http', note: 'Serves http://127.0.0.1:8765/mcp. Add that URL as an MCP server in Open WebUI (External tools in recent versions).' },
  { id: 'stdio', label: 'Standard input and output', text: 'python -m cs2_demo_mcp', note: 'For apps that start the server themselves. LM Studio: put the block below in its mcp.json.' },
  { id: 'inspector', label: 'Check it first', text: 'npx @modelcontextprotocol/inspector python -m cs2_demo_mcp', note: 'Lists the tools and lets you call one by hand.' },
];

export function SettingsWindow() {
  const s = useStore();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  const [copied, setCopied] = useState<string | null>(null);

  function check() {
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      setCheckedAt(new Date());
    }, 900);
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <WindowFrame id="settings" subtitle="This computer" minW={520}>
      <div className="page">
        <section className="sec">
          <div className="sec-h">
            <h2>System</h2>
            <button type="button" className="btn" onClick={check} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          </div>
          <p className="meta">
            The API reads <code>apps/api/.env</code> only when it starts, so restart it after changing a setting. Checked at{' '}
            {checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
          </p>
          <ul className="group" style={{ opacity: checking ? 0.5 : 1 }}>
            {CHECKS.map((c) => (
              <li key={c.name} data-state={c.state}>
                <span className="check-name">{c.name}</span>
                <span className="check-state">{STATE_LABEL[c.state]}</span>
                <span className="check-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
          <dl className="facts">
            <div>
              <dt>RR_LLM_MODEL</dt>
              <dd className="mono">{SERVED_MODEL}</dd>
            </div>
            <div>
              <dt>Served on the port</dt>
              <dd className="mono">{SERVED_MODEL}</dd>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Coach tools over MCP</dt>
              <dd className="mono small">{MCP_TOOLS.join(', ')}</dd>
            </div>
          </dl>
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Connect another app</h2>
          </div>
          <p className="meta">
            The coach&rsquo;s tools are an MCP server, so a local chat app can read your matches the same way the coach does. It listens on this computer only and
            has no sign-in yet, and two tools write (<code>select_moments</code>, <code>request_clip</code>), so connect only apps you trust.
          </p>
          <ul className="group connect">
            {CONNECT.map((r) => (
              <li key={r.id}>
                <span className="check-name">{r.label}</span>
                <code className="cmd">{r.text}</code>
                <button type="button" className="link small" onClick={() => void copy(r.id, r.text)}>
                  {copied === r.id ? 'Copied' : 'Copy'}
                </button>
                <span className="check-detail">{r.note}</span>
              </li>
            ))}
          </ul>
          <pre className="out">{LM_STUDIO}</pre>
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Owner</h2>
          </div>
          <div className="group">
            <div className="toggle-row">
              <button type="button" role="switch" className="switch" aria-checked={s.lab} aria-label="Lab" onClick={() => s.setLab(!s.lab)} />
              <div>
                <b>Lab</b>
                <p className="meta">
                  Runs, labels, evaluation and the fine-tuning set, for the owner only. The app turns it on with <code>RR_LAB_ENABLED=1</code> in{' '}
                  <code>apps/api/.env</code>; in this prototype the switch or <code>?lab=1</code> does it. It never appears in the player&rsquo;s dock unless it is on.
                </p>
              </div>
            </div>
          </div>
          {s.lab ? (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => s.open('lab')}>
              Open the Lab
            </button>
          ) : null}
        </section>
      </div>
    </WindowFrame>
  );
}
