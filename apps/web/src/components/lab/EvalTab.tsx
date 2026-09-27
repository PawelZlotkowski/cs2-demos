"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { ABPair, EvalSummary } from "@/lib/contracts";

const JOB_LABELS: Record<string, string> = {
  select_moments: "Moment selection",
  explain: "Explanations",
  summary: "Match summary",
  wrapup: "Wrap-up",
  ask: "Ask tab",
  ask_across: "Coach page",
  practice_plan: "Practice plan",
};

const RESULT_ROWS: [string, string][] = [
  ["selectionVerified", "Moment selection verified"],
  ["explanationsVerified", "Explanations verified"],
  ["askVerified", "Ask answers verified"],
  ["repaired", "Needed a repair"],
  ["toolCallSuccess", "Tool calls without error"],
  ["explainMedianS", "Explanation median, s"],
  ["askMedianS", "Ask median, s"],
];

/** Lab, Evaluation: per-model tables from the traces, compare_models results, blind A/B (doc 29 §2.2, R10). */
export function EvalTab() {
  const [data, setData] = useState<EvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api
      .getEval()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The API did not answer."));
  }, [refresh]);

  if (error) return <p className="err" role="alert">{error}</p>;
  if (!data) return <p className="meta">Loading…</p>;

  const models = [...new Set(data.rows.map((r) => r.model))];

  return (
    <section className="lab-tab">
      <div className="sec-h">
        <h2>Models on this computer</h2>
        <span className="meta">
          From every coach run in the traces. To compare models, use the app (or <code>python -m eval.compare_models run</code>) with one
          model, restart llama-server with the other, and use it again.
        </span>
      </div>
      {data.rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Model</th>
                <th scope="col" className="n">Runs</th>
                <th scope="col" className="n">Verified</th>
                <th scope="col" className="n">Fell back</th>
                <th scope="col" className="n">Repaired</th>
                <th scope="col" className="n">Tool calls, failed</th>
                <th scope="col" className="n">Median s</th>
                <th scope="col">By language</th>
              </tr>
            </thead>
            <tbody>
              {data.rows
                .slice()
                .sort((a, b) => a.job.localeCompare(b.job) || a.model.localeCompare(b.model))
                .map((r) => (
                  <tr key={`${r.job}-${r.model}`}>
                    <td>{JOB_LABELS[r.job] ?? r.job}</td>
                    <td className="mono">{r.model}</td>
                    <td className="n num">{r.runs}</td>
                    <td className="n num">
                      {r.verified} <span className="meta">({Math.round((100 * r.verified) / r.runs)}%)</span>
                    </td>
                    <td className="n num">{r.fallbacks}</td>
                    <td className="n num">{r.repaired}</td>
                    <td className="n num">
                      {r.toolCalls}, {r.toolErrors}
                    </td>
                    <td className="n num">{r.medianS ?? ""}</td>
                    <td>
                      {Object.entries(r.byLang)
                        .map(([l, v]) => `${l} ${v}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No model runs yet. Turn the coach model on and review a match.</p>
      )}

      {data.results.length ? (
        <>
          <div className="sec-h">
            <h2>compare_models results</h2>
            <span className="meta">eval/results/*.json, same match, languages and questions for each model</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col"> </th>
                  {data.results.map((r) => (
                    <th scope="col" key={r.file}>
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESULT_ROWS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {data.results.map((r) => (
                      <td key={r.file} className="num">
                        {String(r.summary[key] ?? "n/a")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="sec-h">
        <h2>Blind A/B</h2>
        <span className="meta">
          {data.ratings.length
            ? data.ratings.map((t) => `${t.model}: ${t.wins} won, ${t.losses} lost, ${t.ties} tied`).join(" · ")
            : models.length > 1
              ? "No votes yet."
              : "Needs verified answers from two models to the same question."}
        </span>
      </div>
      {models.length > 1 ? <Blind onVoted={() => setRefresh((n) => n + 1)} /> : null}
    </section>
  );
}

function Blind({ onVoted }: { onVoted: () => void }) {
  const [pair, setPair] = useState<ABPair | null | undefined>(undefined);
  const [n, setN] = useState(0);

  useEffect(() => {
    api
      .getPair()
      .then(setPair)
      .catch(() => setPair(null));
  }, [n]);

  async function vote(winner: "a" | "b" | "tie") {
    if (!pair) return;
    await api.ratePair(pair.a.traceId, pair.b.traceId, winner).catch(() => undefined);
    onVoted();
    setN((x) => x + 1);
  }

  if (pair === undefined) return <p className="meta">Loading a pair…</p>;
  if (pair === null) return <p className="meta">Every pair has a vote. New pairs appear as both models answer more.</p>;

  return (
    <div className="ab">
      <p className="ab-q">
        <span className="meta">{JOB_LABELS[pair.job] ?? pair.job}{pair.lang ? `, ${pair.lang}` : ""}</span>
        {pair.question}
      </p>
      <div className="ab-sides">
        {(["a", "b"] as const).map((side) => (
          <figure key={side}>
            <figcaption>Answer {side.toUpperCase()}</figcaption>
            <p className="expl">{pair[side].text}</p>
            <button type="button" className="btn btn-line" onClick={() => void vote(side)}>
              {side.toUpperCase()} is better
            </button>
          </figure>
        ))}
      </div>
      <button type="button" className="link small" onClick={() => void vote("tie")}>
        About the same
      </button>
    </div>
  );
}
