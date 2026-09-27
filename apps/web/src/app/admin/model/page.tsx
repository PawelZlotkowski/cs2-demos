"use client";

import Link from "next/link";
import { LoadState, PageHead, Secret, useLoad } from "@/components/admin/ui";
import { LABELS } from "@/components/SystemNotice";
import { api } from "@/lib/api/client";

const STATE_LABEL = { ok: "Working", off: "Off", problem: "Not working" } as const;

/** Admin, Model and services (doc 30 AD08): what is served and how well it does. */
export default function AdminModel() {
  const { data, error, reload } = useLoad(() => api.admin.model());

  return (
    <main className="main wide" id="content">
      <PageHead title="Model and services" lede="Which model llama-server serves, and how its latest runs went.">
        <button type="button" className="btn btn-line" onClick={() => void reload()}>
          Check again
        </button>
      </PageHead>
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <ul className="checks">
            {data.system.checks.map((c) => (
              <li key={c.name} data-state={c.state}>
                <span className="check-name">{LABELS[c.name]}</span>
                <span className="check-state">{STATE_LABEL[c.state]}</span>
                <span className="check-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
          <dl className="facts">
            <div>
              <dt>Model the API asks for</dt>
              <dd className="mono">{data.system.llmModel}</dd>
            </div>
            <div>
              <dt>Served on the port</dt>
              <dd className="mono">{data.system.servedModels.join(", ") || "nothing"}</dd>
            </div>
            <div>
              <dt>Sampling profile</dt>
              <dd className="mono">{data.sampling}</dd>
            </div>
            <div>
              <dt>Tool steps per answer</dt>
              <dd className="num">{data.maxSteps}</dd>
            </div>
          </dl>

          <section className="settings-sec" aria-labelledby="runs-h">
            <div className="sec-h">
              <h2 id="runs-h">Latest {data.stats.window} runs</h2>
              <Link href="/admin/lab#runs" className="link small">
                Every run in the Lab
              </Link>
            </div>
            {data.stats.models.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="n">Runs</th>
                      <th className="n">Passed the verifier</th>
                      <th className="n">Average time</th>
                      <th className="n">Tokens per second</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stats.models.map((m) => (
                      <tr key={m.model}>
                        <td className="mono">{m.model}</td>
                        <td className="n num">{m.runs}</td>
                        <td className="n num">{m.verifiedRate == null ? "–" : `${Math.round(m.verifiedRate * 100)}%`}</td>
                        <td className="n num">{m.avgLatencyS == null ? "–" : `${m.avgLatencyS} s`}</td>
                        <td className="n num">{m.tokensPerSecond ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">No coach runs yet.</p>
            )}
          </section>

          <section className="settings-sec" aria-labelledby="switch-h">
            <div className="sec-h">
              <h2 id="switch-h">Switch the model</h2>
            </div>
            <p className="meta">
              One model fits on the GPU, so switching means stopping llama-server and starting it with the other GGUF. Then
              change the model name under <Link href="/admin/settings#coach-model">Settings</Link>; it applies to the next job
              without restarting the API.
            </p>
            <Secret value={data.command} />
          </section>
        </>
      ) : null}
    </main>
  );
}
