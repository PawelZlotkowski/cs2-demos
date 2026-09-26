"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  merged,
  phases,
  STATUSES,
  type Edits,
  type MergedTask,
  type Status,
  type TaskEdit,
} from "@/lib/tasks";

type Mode = "loading" | "shared" | "local" | "error";

const LOCAL_EDITS = "coach-tracker:edits";
const LOCAL_NAME = "coach-tracker:name";
const LOCAL_PASSCODE = "coach-tracker:passcode";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage; the board still works for this visit.
  }
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  doing: "Doing",
  review: "Review",
  done: "Done",
};

export default function Board() {
  const [mode, setMode] = useState<Mode>("loading");
  const [edits, setEdits] = useState<Edits>({});
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [error, setError] = useState("");

  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | Status>("all");
  const [readyOnly, setReadyOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      if (body.mode === "shared") {
        setMode("shared");
        setEdits(body.edits);
        setPasscodeRequired(body.passcodeRequired);
      } else {
        setMode("local");
        setEdits(readLocal<Edits>(LOCAL_EDITS, {}));
      }
      setError("");
    } catch (err) {
      setMode("error");
      setError(`Could not load shared state: ${String(err)}`);
      setEdits(readLocal<Edits>(LOCAL_EDITS, {}));
    }
  }, []);

  useEffect(() => {
    setName(readLocal(LOCAL_NAME, ""));
    setPasscode(readLocal(LOCAL_PASSCODE, ""));
    load();
  }, [load]);

  // Keep both partners in sync without a socket: refetch when the tab regains focus
  // and every 30 s while it is visible.
  useEffect(() => {
    if (mode !== "shared") return;
    const onFocus = () => document.visibilityState === "visible" && load();
    const timer = setInterval(onFocus, 30_000);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mode, load]);

  const tasks = useMemo(
    () => phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => merged(t, edits)) })),
    [edits],
  );
  const byId = useMemo(() => {
    const map = new Map<string, MergedTask>();
    tasks.forEach((p) => p.tasks.forEach((t) => map.set(t.id, t)));
    return map;
  }, [tasks]);
  const all = [...byId.values()];
  const owners = [...new Set(all.map((t) => t.owner).filter(Boolean))].sort();
  const isReady = (t: MergedTask) =>
    t.status === "todo" && t.depends.every((d) => byId.get(d)?.status === "done");

  const counts = STATUSES.map((s) => [s, all.filter((t) => t.status === s).length] as const);
  const done = counts.find(([s]) => s === "done")![1];

  async function save(task: MergedTask, patch: Partial<TaskEdit> | "reset") {
    const next: TaskEdit | null =
      patch === "reset"
        ? null
        : {
            owner: task.owner,
            status: task.status,
            note: task.note,
            ...patch,
            updatedAt: new Date().toISOString(),
            updatedBy: name || undefined,
          };
    const previous = edits;
    const updated = { ...edits };
    if (next) updated[task.id] = next;
    else delete updated[task.id];
    setEdits(updated);

    if (mode !== "shared") {
      writeLocal(LOCAL_EDITS, updated);
      return;
    }
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tracker-passcode": passcode },
      body: JSON.stringify(next ? { id: task.id, ...next } : { id: task.id, reset: true }),
    });
    if (!res.ok) {
      setEdits(previous);
      const body = await res.json().catch(() => ({}));
      setError(
        res.status === 401
          ? "Wrong or missing passcode. Enter the team passcode at the top and try again."
          : `Save failed: ${body.error ?? res.statusText}`,
      );
      return;
    }
    setError("");
  }

  function copyTable() {
    const rows = all.map((t) => `| ${t.id} | ${t.owner} | ${t.status} |`);
    const text = ["| ID | Owner | Status |", "|---|---|---|", ...rows].join("\n");
    navigator.clipboard.writeText(text).catch(() => setError("Clipboard is blocked here."));
  }

  const q = query.trim().toLowerCase();
  const visible = (t: MergedTask) =>
    (ownerFilter === "all" ||
      (ownerFilter === "none" ? !t.owner : t.owner === ownerFilter)) &&
    (statusFilter === "all" ||
      (statusFilter === "open" ? t.status !== "done" : t.status === statusFilter)) &&
    (!readyOnly || isReady(t)) &&
    (!q || `${t.id} ${t.title} ${t.paths}`.toLowerCase().includes(q));

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">Round Reviewer · AI Coach</p>
          <h1>Task board</h1>
          <p className="muted">
            Seeded from <code>docs/coach/TASKS.md</code>.{" "}
            {mode === "shared" && "Changes are shared with your partner."}
            {mode === "local" && "Shared storage is not set up, so changes stay in this browser."}
            {mode === "loading" && "Loading…"}
          </p>
        </div>
        <div className="identity">
          <label>
            <span>Your name</span>
            <input
              value={name}
              placeholder="e.g. Pawel"
              onChange={(e) => {
                setName(e.target.value);
                writeLocal(LOCAL_NAME, e.target.value);
              }}
            />
          </label>
          {passcodeRequired && (
            <label>
              <span>Passcode</span>
              <input
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  writeLocal(LOCAL_PASSCODE, e.target.value);
                }}
              />
            </label>
          )}
        </div>
      </header>

      <section className="progress" aria-label="Progress">
        <div className="bar" role="img" aria-label={`${done} of ${all.length} done`}>
          {counts.map(([s, n]) =>
            n ? <span key={s} className={`seg ${s}`} style={{ flexGrow: n }} /> : null,
          )}
        </div>
        <ul className="legend">
          {counts.map(([s, n]) => (
            <li key={s}>
              <i className={`dot ${s}`} /> {STATUS_LABEL[s]} <b>{n}</b>
            </li>
          ))}
          <li className="ready-count">
            Ready to start <b>{all.filter(isReady).length}</b>
          </li>
        </ul>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="filters" aria-label="Filters">
        <input
          type="search"
          placeholder="Search tasks or paths"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="none">Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Any status</option>
          <option value="open">Not done</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} />
          Ready to start
        </label>
        <button type="button" className="ghost" onClick={copyTable}>
          Copy owner/status table
        </button>
      </section>

      <datalist id="owners">
        {owners.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      {tasks.map((phase) => {
        const rows = phase.tasks.filter(visible);
        if (!rows.length) return null;
        const phaseDone = phase.tasks.filter((t) => t.status === "done").length;
        return (
          <section key={phase.id} className="phase">
            <h2>
              <span className="phase-no">Phase {phase.id}</span> {phase.name}
              <span className="phase-count">
                {phaseDone}/{phase.tasks.length}
              </span>
            </h2>
            <ol className="tasks">
              {rows.map((t) => {
                const blocked = t.depends.filter((d) => byId.get(d)?.status !== "done");
                const expanded = open === t.id;
                return (
                  <li key={t.id} className={`task ${t.status}`}>
                    <div className="row">
                      <button
                        type="button"
                        className="title"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : t.id)}
                      >
                        <span className="id">{t.id}</span>
                        <span className="name">{t.title}</span>
                      </button>
                      <span className="meta">
                        <span className="size" title="S ≈ half a day, M ≈ 1–2 days, L ≈ 3–5 days">
                          {t.size}
                        </span>
                        {t.status !== "done" &&
                          (blocked.length ? (
                            <span className="waits" title="Waiting on these tasks">
                              waits on {blocked.join(" ")}
                            </span>
                          ) : (
                            t.status === "todo" && <span className="ready">ready</span>
                          ))}
                      </span>
                      <input
                        className="owner"
                        list="owners"
                        aria-label={`Owner of ${t.id}`}
                        placeholder="Unassigned"
                        defaultValue={t.owner}
                        key={`${t.id}-${t.owner}`}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== t.owner) save(t, { owner: value });
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                      <select
                        className={`status ${t.status}`}
                        aria-label={`Status of ${t.id}`}
                        value={t.status}
                        onChange={(e) => save(t, { status: e.target.value as Status })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {expanded && (
                      <div className="details">
                        <dl>
                          <dt>Depends on</dt>
                          <dd>
                            {t.depends.length
                              ? t.depends.map((d) => (
                                  <span
                                    key={d}
                                    className={`dep ${byId.get(d)?.status === "done" ? "met" : ""}`}
                                  >
                                    {d}
                                  </span>
                                ))
                              : "Nothing"}
                            {t.dependsNote && <em> ({t.dependsNote})</em>}
                          </dd>
                          <dt>Paths</dt>
                          <dd>
                            <code>{t.paths}</code>
                          </dd>
                          <dt>Done when</dt>
                          <dd>{t.doneWhen}</dd>
                          <dt>Note</dt>
                          <dd>
                            <textarea
                              rows={2}
                              placeholder="Branch, PR link, blockers…"
                              defaultValue={t.note}
                              key={`${t.id}-note-${t.note}`}
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                if (value !== t.note) save(t, { note: value });
                              }}
                            />
                          </dd>
                        </dl>
                        <p className="stamp">
                          {t.updatedAt
                            ? `Last changed ${new Date(t.updatedAt).toLocaleString("en-GB")}${
                                t.updatedBy ? ` by ${t.updatedBy}` : ""
                              }`
                            : "Unchanged since the markdown seed"}
                          {t.updatedAt && (
                            <button type="button" className="link" onClick={() => save(t, "reset")}>
                              Reset to seed
                            </button>
                          )}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </main>
  );
}
