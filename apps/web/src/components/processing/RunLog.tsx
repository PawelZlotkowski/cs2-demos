import { LoadingState } from "@/components/LoadingState";
import type { MatchStatus, StatusResponse } from "@/lib/contracts";

export type StageObservations = Partial<Record<MatchStatus, Date>>;

const stateText = { done: "Done", pending: "Pending", active: "In progress", error: "Failed" };
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function RunLog({ status, observed }: { status: StatusResponse | null; observed: StageObservations }) {
  const clips = status?.clips;
  const showClips = clips && clips.total > 0 && clips.clips.some((c) => c.status !== "skipped");
  return <aside className="run-log glass" aria-labelledby="run-log-heading">
    <h2 id="run-log-heading">Run log</h2>
    {status?.stages.length ? <ol>
      {status.stages.map((stage) => {
        const seen = observed[stage.id];
        const state = stateText[stage.state];
        const detail = stage.detail && stage.detail !== state ? stage.detail : null;
        // The mark already shows done or in progress, so a detail takes the state's line; a failure keeps both.
        const inline = detail && stage.state !== "error";
        const mark = stage.state === "done" ? "M5 8.2l2 2 4-4.4" : stage.state === "error" ? "M8 4.8v3.6M8 11.2v.1" : null;
        return <li key={stage.id} data-stage={stage.id} data-state={stage.state} aria-current={stage.state === "active" ? "step" : undefined}>
          <span className="log-mark" aria-hidden="true">{mark && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={mark} /></svg>}</span>
          <div className="log-entry">
            <strong>{stage.label}</strong>
            <span className="log-state">{inline ? <><span className="sr-only">{state}: </span>{detail}</> : state}{seen && <>
              {", seen at "}<time dateTime={seen.toISOString()}>{timeFormat.format(seen)}</time>
            </>}</span>
            {detail && !inline && <p>{detail}</p>}
            {stage.progress && <p className="log-count">{stage.progress.done} of {stage.progress.total}</p>}
          </div>
        </li>;
      })}
    </ol> : status ? <p className="meta">No stages reported yet.</p> : <LoadingState label="Waiting for the first stage…" />}
    {showClips && <p className="round-clip-count">Round clips <strong>{clips.done} of {clips.total} ready</strong></p>}
  </aside>;
}
