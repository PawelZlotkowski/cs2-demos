"use client";

import { LoadingState } from "@/components/LoadingState";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderShape, MatchFolder, RecurringFindings, UploadFolder, readReviewPath, type ReviewPath } from "@/components/review/MatchFolders";
import { api } from "@/lib/api/client";
import type { MatchRow } from "@/lib/contracts";

type Resume = { row: MatchRow; path?: ReviewPath };

async function newestUnfinished(rows: MatchRow[]): Promise<Resume | null> {
  // Use the library's newest-first order. Its display dates are relative.
  for (const row of rows) {
    if (row.status === "failed") continue;
    if (row.status !== "complete") return { row };
    if (row.playerId && row.moments > 0) {
      const path = await readReviewPath(row.id, row.playerId);
      if (path.next) return { row, path };
    }
  }
  return null;
}

export default function HomePage() {
  const [resume, setResume] = useState<Resume | null>();
  const [hasReviews, setHasReviews] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let pending = false;
    let timer: number;
    async function refresh() {
      if (pending) return;
      pending = true;
      window.clearTimeout(timer);
      try {
        const rows = await api.listMatches();
        const result = await newestUnfinished(rows);
        if (!live) return;
        setResume(result);
        setHasReviews(rows.some((row) => row.status === "complete" && row.playerId));
        setFailed(false);
        if (result && result.row.status !== "complete") timer = window.setTimeout(refresh, 10000);
      } catch {
        if (live) setFailed(true);
      } finally {
        pending = false;
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [attempt]);

  return <main id="content" className="main review-home">
    <FolderShape />
    <header className="home-heading">
      {/* Hidden, not swapped, until the list loads, so the title does not flip from one to the other */}
      <h1 data-pending={(resume === undefined && !failed) || undefined}>{resume === null && !failed ? "Start a review" : "Continue review"}</h1>
      <Link href="/matches">View all matches</Link>
    </header>
    {failed ? <div className="home-notice">
      <p role="alert">Your latest review could not be loaded.</p>
      <button className="btn btn-line" onClick={() => { setFailed(false); setResume(undefined); setAttempt((n) => n + 1); }}>Try again</button>
    </div> : resume === undefined ? <LoadingState shape="folder" label="Finding your latest review…" />
      : resume ? <MatchFolder key={resume.row.id} row={resume.row} path={resume.path} featured />
      : <UploadFolder />}
    {hasReviews && <><RecurringFindings />
    <Link className="home-ask" href="/coach#ask">Ask across matches
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 9.5a2 2 0 0 1-2 2H6l-3 2.5V4.5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2z" />
        <path d="M6 6h4.5M6 8.5h3" />
      </svg>
    </Link></>}
  </main>;
}
