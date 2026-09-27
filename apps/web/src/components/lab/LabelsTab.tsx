"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import type {
  Bookmark,
  Finding,
  LabelVerdict,
  LabelsSummary,
  MatchRow,
  MissedEvent,
  MomentPickRow,
  PickScore,
  RoundStats,
} from "@/lib/contracts";
import { formatClock } from "@/lib/replay/time";

const NAME_KEY = "rr.labeller";
const NAME_RE = /^[A-Za-z0-9_]{1,40}$/;

/** Detector ids (apps/api/app/analysis/detectors), for "Add missed event". */
export const DETECTORS = [
  "untraded_death",
  "shot_while_moving",
  "unused_utility",
  "dry_peek",
  "team_flash",
  "economy_mismatch",
  "late_rotation",
  "repeated_death_zone",
  "opening_duel",
  "good_plays",
];

const VERDICTS: LabelVerdict["verdict"][] = ["correct", "wrong", "unsure"];

function human(id: string): string {
  return id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Lab, Labels: finding labels in the T17 format, blind moment picks (T62) and agreement (doc 29 §2.2, R07). */
export function LabelsTab() {
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [matchId, setMatchId] = useState<string>("");
  const [mode, setMode] = useState<"findings" | "picks">("findings");
  const [summaryAt, setSummaryAt] = useState(0);

  useEffect(() => {
    try {
      setName(window.localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* storage blocked */
    }
    api
      .listMatches()
      .then((rows) => {
        const ready = rows.filter((r) => r.playerId && r.moments > 0);
        setMatches(ready);
        setMatchId((m) => m || ready[0]?.id || "");
      })
      .catch(() => setMatches([]));
  }, []);

  function rename(v: string) {
    setName(v);
    try {
      window.localStorage.setItem(NAME_KEY, v);
    } catch {
      /* storage blocked */
    }
  }

  const match = matches?.find((m) => m.id === matchId) ?? null;
  const validName = NAME_RE.test(name);

  return (
    <section className="lab-tab">
      <div className="filters">
        <label>
          <span className="sr-only">Your name</span>
          <input
            className="input"
            placeholder="Your name, for example pawel"
            value={name}
            maxLength={40}
            onChange={(e) => rename(e.target.value.trim())}
            aria-invalid={name !== "" && !validName}
          />
        </label>
        <label>
          <span className="sr-only">Match</span>
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            {(matches ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.map} {m.score} · {m.playerName ?? m.playerId} · {m.when}
              </option>
            ))}
          </select>
        </label>
        <div className="seg seg-plain" role="group" aria-label="What to label">
          <button type="button" aria-pressed={mode === "findings"} onClick={() => setMode("findings")}>
            Findings
          </button>
          <button type="button" aria-pressed={mode === "picks"} onClick={() => setMode("picks")}>
            Pick 6 moments
          </button>
        </div>
      </div>

      {matches === null ? (
        <p className="meta">Loading matches…</p>
      ) : !match || !match.playerId ? (
        <p className="empty">No analysed match yet. Pick a player in a match first.</p>
      ) : !validName ? (
        <p className="empty">Type your name first. Labels are saved per person, so two people can label the same rounds.</p>
      ) : mode === "findings" ? (
        <FindingLabels
          key={`${match.id}-${name}`}
          matchId={match.id}
          map={match.map}
          playerId={match.playerId}
          labeller={name}
          onSaved={() => setSummaryAt((n) => n + 1)}
        />
      ) : (
        <MomentPicker key={`${match.id}-${name}`} matchId={match.id} playerId={match.playerId} labeller={name} />
      )}

      <Agreement refresh={summaryAt} me={validName ? name : ""} />
    </section>
  );
}

function FindingLabels({
  matchId,
  map,
  playerId,
  labeller,
  onSaved,
}: {
  matchId: string;
  map: string;
  playerId: string;
  labeller: string;
  onSaved: () => void;
}) {
  const [stats, setStats] = useState<RoundStats[]>([]);
  const [labelled, setLabelled] = useState<Set<number>>(new Set());
  const [round, setRound] = useState<number | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, LabelVerdict["verdict"]>>({});
  const [missed, setMissed] = useState<MissedEvent[]>([]);
  const [newMiss, setNewMiss] = useState({ detector: DETECTORS[0], t: "" });
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getRoundStats(matchId, playerId), api.getRoundLabels(matchId, playerId, labeller)])
      .then(([s, labels]) => {
        setStats(s);
        const done = new Set(labels.map((l) => l.round));
        setLabelled(done);
        setRound(s.find((r) => !done.has(r.round))?.round ?? s[0]?.round ?? null);
      })
      .catch((e: unknown) => setState(e instanceof Error ? e.message : "Unable to load the match."));
  }, [matchId, playerId, labeller]);

  useEffect(() => {
    if (round == null) return;
    let live = true;
    setFindings(null);
    setState(null);
    Promise.all([api.getFindings(matchId, playerId, { round }), api.getRoundLabels(matchId, playerId, labeller)]).then(
      ([fs, labels]) => {
        if (!live) return;
        const saved = labels.find((l) => l.round === round);
        setFindings(fs);
        setVerdicts(Object.fromEntries((saved?.findings ?? []).map((v) => [v.findingId, v.verdict])));
        setMissed(saved?.missed ?? []);
      },
    );
    return () => {
      live = false;
    };
  }, [matchId, playerId, labeller, round]);

  async function save() {
    if (round == null || !findings) return;
    setState("Saving…");
    try {
      await api.saveRoundLabel({
        matchId,
        map: map.toLowerCase().startsWith("de_") ? map.toLowerCase() : `de_${map.toLowerCase()}`,
        playerId,
        round,
        labeller,
        findings: findings
          .filter((f) => verdicts[f.id])
          .map((f) => ({ findingId: f.id, detector: f.detector, t: f.t, verdict: verdicts[f.id] })),
        missed,
      });
      setLabelled((s) => new Set(s).add(round));
      setState("Saved.");
      onSaved();
      const next = stats.find((r) => r.round > round && !labelled.has(r.round));
      if (next) setRound(next.round);
    } catch (e) {
      setState(e instanceof Error ? e.message : "Unable to save.");
    }
  }

  const all = findings ? findings.every((f) => verdicts[f.id]) : false;

  return (
    <div className="label-grid">
      <ol className="round-pick" aria-label="Rounds">
        {stats.map((s) => (
          <li key={s.round}>
            <button type="button" aria-pressed={round === s.round} data-done={labelled.has(s.round) || undefined} onClick={() => setRound(s.round)}>
              <span className="num">{s.round}</span>
            </button>
          </li>
        ))}
      </ol>
      {round == null ? null : (
        <div>
          <div className="label-h">
            <h2>Round {round}</h2>
            <Link className="link small" href={findings?.[0] ? `/studio/${matchId}?f=${findings[0].id}` : `/studio/${matchId}`} target="_blank">
              Open the round in the Studio
            </Link>
          </div>
          {findings === null ? (
            <p className="meta">Loading findings…</p>
          ) : findings.length === 0 ? (
            <p className="meta">No findings in this round. Add anything the detectors missed below.</p>
          ) : (
            <ul className="label-list">
              {findings.map((f) => (
                <li key={f.id}>
                  <div>
                    <span className="mono">{f.id}</span> <b>{human(f.detector)}</b>{" "}
                    <span className="meta num">{formatClock(f.t)}</span>
                    {f.zone ? <span className="meta"> · {f.zone}</span> : null}
                    <p>{f.summary}</p>
                  </div>
                  <div className="seg seg-plain" role="group" aria-label={`Verdict for ${f.id}`}>
                    {VERDICTS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={verdicts[f.id] === v}
                        onClick={() => setVerdicts((x) => ({ ...x, [f.id]: v }))}
                      >
                        {human(v)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="round-h">Missed by the detectors</h3>
          {missed.length ? (
            <ul className="label-missed">
              {missed.map((m, i) => (
                <li key={i}>
                  {human(m.detector)} at <span className="num">{formatClock(m.t)}</span>{" "}
                  <button type="button" className="link small" onClick={() => setMissed((x) => x.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="filters">
            <select value={newMiss.detector} onChange={(e) => setNewMiss((n) => ({ ...n, detector: e.target.value }))}>
              {DETECTORS.map((d) => (
                <option key={d} value={d}>
                  {human(d)}
                </option>
              ))}
            </select>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Round clock, seconds"
              value={newMiss.t}
              onChange={(e) => setNewMiss((n) => ({ ...n, t: e.target.value }))}
            />
            <button
              type="button"
              className="btn btn-line"
              disabled={!(Number(newMiss.t) >= 0) || newMiss.t === ""}
              onClick={() => {
                setMissed((x) => [...x, { detector: newMiss.detector, t: Number(newMiss.t) }]);
                setNewMiss((n) => ({ ...n, t: "" }));
              }}
            >
              Add missed event
            </button>
          </div>

          <div className="plan-actions">
            <button type="button" className="btn btn-fill" onClick={() => void save()} disabled={!findings}>
              {all ? "Save round" : "Save round (unlabelled findings are left out)"}
            </button>
            {state ? <span className="meta">{state}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function MomentPicker({ matchId, playerId, labeller }: { matchId: string; playerId: string; labeller: string }) {
  const [rounds, setRounds] = useState<number[]>([]);
  const [picks, setPicks] = useState<MomentPickRow[]>([]);
  const [score, setScore] = useState<PickScore | null>(null);
  const [notes, setNotes] = useState<Bookmark[]>([]);
  const [row, setRow] = useState({ round: "", t0: "", t1: "", kind: "mistake" as MomentPickRow["kind"] });
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    api.getRoundStats(matchId, playerId).then((s) => setRounds(s.map((r) => r.round))).catch(() => undefined);
    api.getBookmarks(matchId).then(setNotes).catch(() => undefined);
    api
      .getPicks(matchId, playerId, labeller)
      .then((r) => {
        setPicks(r.picks?.picks ?? []);
        setScore(r.score);
      })
      .catch(() => undefined);
  }, [matchId, playerId, labeller]);

  const valid = row.round !== "" && Number(row.t1) > Number(row.t0) && row.t0 !== "";

  async function save() {
    setState("Saving…");
    try {
      const out = await api.savePicks({ matchId, playerId, labeller, picks });
      setScore(out.score);
      setState(null);
    } catch (e) {
      setState(e instanceof Error ? e.message : "Unable to save.");
    }
  }

  return (
    <div className="picks">
      <p className="meta">
        Pick up to six moments worth showing this player, in order of importance, before you open the coach&rsquo;s
        review. The coach&rsquo;s picks stay hidden until you save.
      </p>
      <ol className="pick-list">
        {picks.map((p, i) => (
          <li key={i}>
            <span className="num">R{p.round}</span> {formatClock(p.t0)} to {formatClock(p.t1)}, {p.kind === "good" ? "good play" : "mistake"}{" "}
            <button type="button" className="link small" onClick={() => setPicks((x) => x.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      {picks.length < 6 ? (
        <div className="filters">
          <select value={row.round} onChange={(e) => setRow((r) => ({ ...r, round: e.target.value }))} aria-label="Round">
            <option value="">Round</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
          <input className="input narrow" inputMode="decimal" placeholder="From, s" aria-label="From, round clock seconds" value={row.t0} onChange={(e) => setRow((r) => ({ ...r, t0: e.target.value }))} />
          <input className="input narrow" inputMode="decimal" placeholder="To, s" aria-label="To, round clock seconds" value={row.t1} onChange={(e) => setRow((r) => ({ ...r, t1: e.target.value }))} />
          <select value={row.kind} onChange={(e) => setRow((r) => ({ ...r, kind: e.target.value as MomentPickRow["kind"] }))} aria-label="Kind">
            <option value="mistake">Mistake</option>
            <option value="good">Good play</option>
          </select>
          <button
            type="button"
            className="btn btn-line"
            disabled={!valid}
            onClick={() => {
              setPicks((x) => [...x, { round: Number(row.round), t0: Number(row.t0), t1: Number(row.t1), kind: row.kind }]);
              setRow((r) => ({ ...r, t0: "", t1: "" }));
            }}
          >
            Add pick
          </button>
        </div>
      ) : null}
      <div className="plan-actions">
        <button type="button" className="btn btn-fill" disabled={!picks.length} onClick={() => void save()}>
          Save picks
        </button>
        {state ? <span className="meta">{state}</span> : null}
      </div>
      {score ? (
        <dl className="facts pick-score">
          <div>
            <dt>Coach picks you also picked</dt>
            <dd className="num">
              {score.overlap} of {score.coachPicks}
            </dd>
          </div>
          <div>
            <dt>Overlap@6</dt>
            <dd className="num">{score.overlapAt6 ?? "n/a"}</dd>
          </div>
          <div>
            <dt>NDCG@6 of the coach&rsquo;s order</dt>
            <dd className="num">{score.ndcgAt6 ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Coach picks by</dt>
            <dd>{score.coachSource === "agent" ? "the coach model" : "code (ranker)"}</dd>
          </div>
        </dl>
      ) : null}
      {score && notes.length ? (
        <>
          <h3 className="round-h">Notes players left on this match</h3>
          <ul className="label-missed">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="num">R{n.round}</span> {formatClock(n.t)}: {n.note}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Agreement({ refresh, me }: { refresh: number; me: string }) {
  const [summary, setSummary] = useState<LabelsSummary | null>(null);
  const [other, setOther] = useState("");

  const others = useMemo(() => Object.keys(summary?.labellers ?? {}).filter((n) => n !== me), [summary, me]);

  useEffect(() => {
    api
      .getLabelsSummary(me || undefined, other || undefined)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [refresh, me, other]);

  if (!summary) return null;
  const rows = Object.entries(summary.score ?? {});
  const agreement = summary.agreement as { sharedFindings?: number; rawAgreement?: number | null; kappa?: number | null } | undefined;

  return (
    <section className="settings-sec">
      <div className="sec-h">
        <h2>Detector quality</h2>
        <span className="meta">
          {summary.rounds} labelled {summary.rounds === 1 ? "round" : "rounds"} by{" "}
          {Object.entries(summary.labellers)
            .map(([n, c]) => `${n} (${c})`)
            .join(", ") || "nobody yet"}
        </span>
      </div>
      {!summary.tool ? (
        <p className="meta">eval/label_tool.py is not next to the API, so scores are off (the Docker image leaves eval/ out).</p>
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Detector</th>
                <th scope="col" className="n">Correct</th>
                <th scope="col" className="n">Wrong</th>
                <th scope="col" className="n">Missed</th>
                <th scope="col" className="n">Precision</th>
                <th scope="col" className="n">Recall</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([d, r]) => (
                <tr key={d}>
                  <td>{human(d)}</td>
                  <td className="n num">{r.correct}</td>
                  <td className="n num">{r.wrong}</td>
                  <td className="n num">{r.missed}</td>
                  <td className="n num">{r.precision ?? "n/a"}</td>
                  <td className="n num">{r.recall ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="meta">No labels yet.</p>
      )}
      {me && others.length ? (
        <div className="filters agree">
          <label>
            Agreement between <b>{me}</b> and{" "}
            <select value={other} onChange={(e) => setOther(e.target.value)}>
              <option value="">pick a labeller</option>
              {others.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {agreement && other ? (
            <span>
              Cohen&rsquo;s κ <b className="num">{agreement.kappa ?? "n/a"}</b> over{" "}
              <span className="num">{agreement.sharedFindings ?? 0}</span> shared findings, raw agreement{" "}
              <span className="num">{agreement.rawAgreement ?? "n/a"}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
