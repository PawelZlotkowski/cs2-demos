"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import type { SharedReview } from "@/lib/contracts";
import { errorText } from "@/lib/format";

/** A shared review (A14): the coached player's moments, clips and explanations, read-only. */
export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.shared(token).then(setData).catch((e) => setError(errorText(e)));
  }, [token]);

  if (error)
    return (
      <main className="main narrow" id="content">
        <h1>Shared review</h1>
        <p className="empty">{error}</p>
      </main>
    );
  if (!data) return <main className="main narrow" id="content" aria-busy="true" />;

  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <main className="main" id="content">
      <header className="page-h">
        <div>
          <h1>
            {data.playerName ?? "Player"} on {data.map} <span className="num">{data.score}</span>
          </h1>
          <p className="lede">A review from Round Reviewer, shared read-only.</p>
        </div>
      </header>
      {data.explanations.summary ? <p className="coach-voice">{data.explanations.summary}</p> : null}
      <ol className="shared-moments">
        {data.moments.map((m, i) => (
          <li key={m.id} data-kind={m.kind}>
            <h2>
              <span className="num">{String(i + 1).padStart(2, "0")}</span> Round {m.round}, {clock(m.t0)}
              <span className="tag">{m.kind === "good" ? "Good play" : "Mistake"}</span>
            </h2>
            {m.clip ? <video src={api.mediaUrl(m.clip)} controls preload="metadata" /> : null}
            <p className="coach-voice">{data.explanations[m.id] ?? m.pickedBecause}</p>
          </li>
        ))}
      </ol>
      {data.explanations.wrapup ? (
        <section className="settings-sec">
          <h2>Wrap-up</h2>
          <p className="coach-voice">{data.explanations.wrapup}</p>
        </section>
      ) : null}
    </main>
  );
}
