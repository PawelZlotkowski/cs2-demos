"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { CoachText } from "@/components/coach/CoachText";
import { api } from "@/lib/api/client";
import { when } from "@/lib/format";
import { formatClock } from "@/lib/replay/time";

/**
 * Earlier reviews of one match (AD09): each re-run keeps the review it replaced, so a player can
 * read what another model, or the same model before a change, said about the same demo.
 */
export default function VersionsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad(() => api.getVersions(id));
  const versions = data ? [...data].reverse() : null;

  return (
    <main className="main wide" id="content">
      <PageHead title="Earlier reviews" lede="Reviews this match had before a re-run replaced them, newest first. The current one is in the Studio.">
        <Link className="btn btn-line" href={`/studio/${id}`}>
          Open the current review
        </Link>
      </PageHead>
      <LoadState error={error} loading={versions === null} />
      {versions && versions.length === 0 ? (
        <div className="empty">
          <p>No earlier reviews. Re-running the coach from Matches keeps the review it replaces here.</p>
        </div>
      ) : null}
      {versions?.map((v) => {
        const text = new Map(v.explanations.map((e) => [e.target, e.text]));
        const label = (mid: string) => {
          const i = v.moments.findIndex((m) => m.id === mid);
          return i >= 0 ? `moment ${i + 1}` : undefined;
        };
        return (
          <section key={v.id} className="settings-sec version" aria-labelledby={`${v.id}-h`}>
            <div className="sec-h">
              <h2 id={`${v.id}-h`}>
                <span className="mono">{v.model}</span>
              </h2>
              <span className="meta">{when(v.createdAt)}</span>
            </div>
            {text.get("summary") ? (
              <p className="coach-voice">
                <CoachText text={text.get("summary") ?? ""} momentLabel={label} />
              </p>
            ) : null}
            <ol className="shared-moments">
              {v.moments.map((m, i) => (
                <li key={m.id}>
                  <h3>
                    <span className="num">{String(i + 1).padStart(2, "0")}</span> Round {m.round}, {formatClock(m.t0)}
                    <span className="tag">{m.kind === "good" ? "Good play" : "Mistake"}</span>
                  </h3>
                  <p className="coach-voice">
                    <CoachText text={text.get(m.id) ?? m.pickedBecause} momentLabel={label} />
                  </p>
                </li>
              ))}
            </ol>
            {text.get("wrapup") ? (
              <p className="coach-voice">
                <CoachText text={text.get("wrapup") ?? ""} momentLabel={label} />
              </p>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}
