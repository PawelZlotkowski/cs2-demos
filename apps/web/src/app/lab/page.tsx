"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DatasetTab } from "@/components/lab/DatasetTab";
import { EvalTab } from "@/components/lab/EvalTab";
import { LabelsTab } from "@/components/lab/LabelsTab";
import { api } from "@/lib/api/client";
import type { TraceDetail, TracePage } from "@/lib/contracts";
import { useHashTab } from "@/lib/useHashTab";

const TABS = [
  { id: "runs", label: "Runs" },
  { id: "labels", label: "Labels" },
  { id: "evaluation", label: "Evaluation" },
  { id: "dataset", label: "Dataset" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

const LEDES: Record<Tab, string> = {
  runs: "Every coach run on this computer: which tools the model called, which passages it read, and whether its text passed the verifier.",
  labels:
    "Mark each finding right or wrong, add what the detectors missed, and pick your own six moments without seeing the coach's. Saved in the data/labels format.",
  evaluation:
    "Each model's runs from the traces, the compare_models results, and a blind vote between two models' answers to the same question.",
  dataset:
    "Coach runs that passed the verifier on the first try, one at a time. Accepted and edited ones become the fine-tuning set.",
};

const JOBS: { id: string; label: string }[] = [
  { id: "", label: "All jobs" },
  { id: "select_moments", label: "Moment selection" },
  { id: "explain", label: "Explanations" },
  { id: "summary", label: "Match summary" },
  { id: "wrapup", label: "Wrap-up" },
  { id: "ask", label: "Ask tab" },
  { id: "ask_across", label: "Coach page" },
  { id: "practice_plan", label: "Practice plan" },
];

const SOURCES: { id: string; label: string }[] = [
  { id: "", label: "Any result" },
  { id: "agent", label: "Model, verified" },
  { id: "template", label: "Fell back to templates" },
  { id: "ranker", label: "Fell back to the ranker" },
];

const PAGE = 50;

function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function jobLabel(job: string): string {
  return JOBS.find((j) => j.id === job)?.label ?? job;
}

/** Lab: Runs (R03), Labels (R07), Evaluation (R10), Dataset (R11); doc 29 §2.2. */
export default function LabPage() {
  const [tab, setTab] = useHashTab<Tab>(TAB_IDS, "runs");
  const [off, setOff] = useState(false);

  useEffect(() => {
    api
      .features()
      .then((f) => setOff(!f.lab))
      .catch(() => undefined);
  }, []);

  return (
    <main className="main wide" id="content">
      <header className="page-h">
        <div>
          <h1>Lab</h1>
          <p className="lede">{LEDES[tab]}</p>
        </div>
      </header>
      <nav className="subtabs" aria-label="Lab">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setTab(t.id);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {off ? (
        <p className="empty">
          The Lab is off. Add <code>RR_LAB_ENABLED=1</code> to <code>apps/api/.env</code> and restart the API.
        </p>
      ) : tab === "runs" ? (
        <RunsTab />
      ) : tab === "labels" ? (
        <LabelsTab />
      ) : tab === "evaluation" ? (
        <EvalTab />
      ) : (
        <DatasetTab />
      )}
    </main>
  );
}

/** Runs: every coach job with its tool calls, passages and verifier verdict (R03). */
function RunsTab() {
  const [job, setJob] = useState("");
  const [matchId, setMatchId] = useState("");
  const [source, setSource] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<TracePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);

  useEffect(() => {
    setJob(initialParam("job"));
    setMatchId(initialParam("matchId"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getTraces({ job, source, matchId, limit: PAGE, offset })
      .then((p) => !cancelled && setPage(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "The API did not answer."));
    return () => {
      cancelled = true;
    };
  }, [job, source, matchId, offset]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api
      .getTrace(openId)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const labOff = error?.includes("RR_LAB_ENABLED");

  return labOff ? (
        <p className="empty">
          The Lab is off. Add <code>RR_LAB_ENABLED=1</code> to <code>apps/api/.env</code> and restart the API.
        </p>
      ) : error ? (
        <p className="err" role="alert">
          Could not load the runs: {error}
        </p>
      ) : (
        <section id="runs" className="runs">
          <div className="filters">
            <label>
              <span className="sr-only">Job</span>
              <select
                value={job}
                onChange={(e) => {
                  setJob(e.target.value);
                  setOffset(0);
                }}
              >
                {JOBS.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Result</span>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setOffset(0);
                }}
              >
                {SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {page ? (
              <span className="meta">
                {page.total} {page.total === 1 ? "run" : "runs"}
              </span>
            ) : null}
          </div>

          {page === null ? (
            <p className="meta">Loading runs…</p>
          ) : page.items.length === 0 ? (
            <p className="empty">
              No runs yet. Runs appear once the coach model is on and a match has been reviewed or asked about.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Job</th>
                    <th scope="col">Model</th>
                    <th scope="col" className="n">
                      Tools
                    </th>
                    <th scope="col" className="n">
                      Seconds
                    </th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r) => (
                    <tr key={r.id} aria-selected={openId === r.id}>
                      <td>
                        <button
                          type="button"
                          className="row-open"
                          aria-expanded={openId === r.id}
                          onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        >
                          {when(r.ts)}
                        </button>
                      </td>
                      <td>
                        {jobLabel(r.job)}
                        {r.lang ? <span className="meta"> {r.lang}</span> : null}
                      </td>
                      <td className="mono">{r.model ?? "none"}</td>
                      <td className="n num">{r.toolCalls}</td>
                      <td className="n num">{r.latencyS != null ? r.latencyS.toFixed(1) : ""}</td>
                      <td>
                        <Verdict ok={r.verifierOk} source={r.source} repaired={r.repaired} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {page && page.total > PAGE ? (
            <div className="pager">
              <button type="button" className="btn btn-line" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Newer
              </button>
              <span className="meta">
                {offset + 1} to {Math.min(offset + PAGE, page.total)}
              </span>
              <button
                type="button"
                className="btn btn-line"
                disabled={offset + PAGE >= page.total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Older
              </button>
            </div>
          ) : null}

          {matchId ? (
            <p className="meta">
              Showing one match&rsquo;s runs. <a href="/lab#runs">Show every run</a>
            </p>
          ) : null}
          {detail ? <RunDetail run={detail} onClose={() => setOpenId(null)} /> : null}
        </section>
      );
}

/** Filters a link can set, e.g. /lab?matchId=…&job=explain#runs from "How this was written". */
function initialParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function Verdict({ ok, source, repaired }: { ok: boolean | null; source: string | null; repaired: boolean }) {
  if (ok === null) return <span className="meta">No check</span>;
  if (ok) return <span>Passed{repaired ? " after one repair" : ""}</span>;
  return <span className="verdict-fail">Failed, used the {source === "ranker" ? "ranker" : "templates"}</span>;
}

function RunDetail({ run, onClose }: { run: TraceDetail; onClose: () => void }) {
  return (
    <article className="run-detail" aria-label="Run details">
      <header>
        <h2>
          {jobLabel(run.job)} <span className="meta">{when(run.ts)}</span>
        </h2>
        <button type="button" className="btn btn-line" onClick={onClose}>
          Close
        </button>
      </header>
      <dl className="facts">
        <div>
          <dt>Model</dt>
          <dd className="mono">{run.model ?? "none"}</dd>
        </div>
        {run.matchId ? (
          <div>
            <dt>Match</dt>
            <dd>
              <Link href={`/studio/${run.matchId}`}>Open in the Studio</Link>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Passages read</dt>
          <dd>{run.knowledgeIds.length ? run.knowledgeIds.join(", ") : "none"}</dd>
        </div>
      </dl>

      <h3>Tool calls</h3>
      {run.steps.length ? (
        <ol className="steps">
          {run.steps.map((s, i) => (
            <li key={i}>
              <b className="mono">{s.tool}</b>
              <span className="mono args">{JSON.stringify(s.args)}</span>
              <span className="meta num">
                {Math.round(s.ms)} ms, {s.resultBytes} bytes
              </span>
              {s.error ? <span className="verdict-fail">{s.error}</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">No tool calls in this run.</p>
      )}

      <h3>Verifier</h3>
      {run.verifierErrors.length ? (
        <ul className="v-errors">
          {run.verifierErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="meta">{run.verifierOk === false ? "Failed without a listed error." : "No errors."}</p>
      )}

      {run.output ? (
        <>
          <h3>Model output</h3>
          <pre className="out">{run.output}</pre>
        </>
      ) : null}
      {run.fallback ? (
        <>
          <h3>Shown instead</h3>
          <pre className="out">{run.fallback}</pre>
        </>
      ) : null}
    </article>
  );
}
