"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { DatasetExample, DatasetPage } from "@/lib/contracts";

const TARGET = 300; // reviewed examples the plan asks for (T51)

/** Lab, Dataset: review verifier-passed runs for fine-tuning, one at a time (doc 29 §2.2, R11). */
export function DatasetTab() {
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [pending, setPending] = useState(true);
  const [idx, setIdx] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    api
      .getDataset({ pending, limit: 100 })
      .then((p) => {
        setPage(p);
        setIdx(0);
        setEdit(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The API did not answer."));
  }, [pending, n]);

  const ex: DatasetExample | undefined = page?.items[idx];

  async function review(verdict: "accept" | "edit" | "reject") {
    if (!ex) return;
    await api.reviewExample(ex.id, verdict, verdict === "edit" ? (edit ?? ex.output) : undefined);
    setN((x) => x + 1);
  }

  async function doExport() {
    const out = await api.exportDataset();
    setExported(
      `Wrote ${Object.entries(out.counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")} to ${out.folder}.`,
    );
  }

  if (error) return <p className="err" role="alert">{error}</p>;
  if (!page) return <p className="meta">Loading…</p>;

  const kept = Object.values(page.counts).reduce((a, b) => a + b, 0);

  return (
    <section className="lab-tab">
      <div className="sec-h">
        <h2>
          <span className="num">{kept}</span> of <span className="num">{TARGET}</span> examples kept
        </h2>
        <span className="meta">
          {Object.entries(page.counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ") || "Nothing accepted yet."}
        </span>
      </div>
      <div className="filters">
        <div className="seg seg-plain" role="group" aria-label="Show">
          <button type="button" aria-pressed={pending} onClick={() => setPending(true)}>
            To review
          </button>
          <button type="button" aria-pressed={!pending} onClick={() => setPending(false)}>
            All
          </button>
        </div>
        <span className="meta">
          {page.total} {pending ? "waiting" : "examples"}, {page.reviewed} reviewed
        </span>
        <span className="sp" />
        <button type="button" className="btn btn-line" onClick={() => void doExport()} disabled={!kept}>
          Export the kept examples
        </button>
      </div>
      {exported ? <p className="meta">{exported}</p> : null}

      {!ex ? (
        <p className="empty">
          {pending
            ? "Nothing waiting. Examples arrive when the coach model passes the verifier on the first try."
            : "No examples yet."}
        </p>
      ) : (
        <article className="ds-ex">
          <header className="label-h">
            <h2>
              {ex.job}
              {ex.lang ? `, ${ex.lang}` : ""} <span className="meta">{ex.split} split</span>
            </h2>
            <span className="meta num">
              {idx + 1} of {page.items.length}
            </span>
          </header>
          <h3 className="round-h">What the model was given</h3>
          <pre className="out">{ex.prompt}</pre>
          <h3 className="round-h">What it wrote{ex.verdict ? `, marked ${ex.verdict}` : ""}</h3>
          {edit !== null ? (
            <textarea className="input ds-edit" rows={5} value={edit} onChange={(e) => setEdit(e.target.value)} />
          ) : (
            <p className="expl">{ex.edited ?? ex.output}</p>
          )}
          <div className="plan-actions">
            <button type="button" className="btn btn-fill" onClick={() => void review(edit !== null ? "edit" : "accept")}>
              {edit !== null ? "Save the edit" : "Accept"}
            </button>
            {edit === null ? (
              <button type="button" className="btn btn-line" onClick={() => setEdit(ex.edited ?? ex.output)}>
                Edit
              </button>
            ) : (
              <button type="button" className="btn btn-line" onClick={() => setEdit(null)}>
                Cancel the edit
              </button>
            )}
            <button type="button" className="btn btn-line" onClick={() => void review("reject")}>
              Reject
            </button>
            <span className="sp" />
            <button type="button" className="link small" disabled={idx === 0} onClick={() => { setIdx(idx - 1); setEdit(null); }}>
              Previous
            </button>
            <button
              type="button"
              className="link small"
              disabled={idx + 1 >= page.items.length}
              onClick={() => { setIdx(idx + 1); setEdit(null); }}
            >
              Skip
            </button>
          </div>
          <p className="meta">An edit must keep every citation and number, since the fine-tuned model learns to write like it.</p>
        </article>
      )}
    </section>
  );
}
