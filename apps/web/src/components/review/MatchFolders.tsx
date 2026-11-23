"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { findingLabel } from "@/lib/coach/findings";
import { useCoachedPlayer } from "@/lib/coach/players";
import type { MatchRow, MatchStatus, ProgressResponse, StatusResponse } from "@/lib/contracts";
import { playerRoundScore } from "@/lib/replay/roster";
import { getMapMeta } from "@/lib/replay/maps";

const stages: Record<MatchStatus, string> = {
  uploaded: "Received demo", decompressing: "Unpacking demo", decompressed: "Demo unpacked",
  inspecting: "Reading players", awaiting_setup: "Set up review", ready_to_parse: "Starting review",
  parsing: "Reading every tick", normalizing: "Preparing the replay", awaiting_player: "Pick a player",
  detecting: "Finding key plays", selecting: "Choosing moments", recording: "Recording clips",
  explaining: "Writing explanations", complete: "Review ready", failed: "Processing failed",
};

const outline = "M0 .32 Q0 .25 .045 .25 H.365 C.432 .25 .415 .37 .49 .37 H.956 Q1 .37 1 .435 V1 H0 Z";

export function FolderShape() {
  return <svg width="0" height="0" className="folder-shape" aria-hidden="true">
    <defs><clipPath id="library-folder-front" clipPathUnits="objectBoundingBox"><path d={outline} /></clipPath></defs>
  </svg>;
}

export function FolderFront() {
  return <>
    <span className="folder-front" aria-hidden="true" />
    <svg className="folder-edge" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <path d={outline} fill="none" stroke="var(--surface-raised)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  </>;
}

const icon = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function PlusIcon() {
  return <svg {...icon}><path d="M8 3v10M3 8h10" /></svg>;
}

export type ReviewPath = {
  seen: boolean[];
  next?: { id: string; round: number; number: number; findingId?: string };
};

/** Only IDs on the current selection count. A re-run may have replaced older moments. */
export async function readReviewPath(matchId: string, playerId: string): Promise<ReviewPath> {
  const [moments, progress] = await Promise.all([
    api.getPlayerMoments(matchId, playerId),
    api.getReviewProgress(matchId),
  ]);
  const seenIds = new Set(progress.map((p) => p.momentId));
  const seen = moments.map((m) => seenIds.has(m.id));
  const index = seen.indexOf(false);
  const moment = moments[index];
  return { seen, next: moment && { id: moment.id, round: moment.round, number: index + 1, findingId: moment.findingIds[0] } };
}

function useReviewDetails(row: MatchRow, knownPath?: ReviewPath) {
  const [loadedPath, setLoadedPath] = useState<ReviewPath>();
  const [score, setScore] = useState<[number, number] | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>();
  useEffect(() => {
    if (!row.playerId || row.status !== "complete") return;
    let live = true;
    api.getRoundStats(row.id, row.playerId).then((stats) => {
      if (live) setScore(playerRoundScore(stats));
    }).catch(() => undefined);
    api.getFindings(row.id, row.playerId).then((findings) => {
      if (live) setTitles(new Map(findings.map((f) => [f.id, findingLabel(f) + (f.zone ? " in " + f.zone : "")])));
    }).catch(() => undefined);
    if (!knownPath) {
      readReviewPath(row.id, row.playerId).then((path) => { if (live) setLoadedPath(path); }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [row.id, row.playerId, row.status, knownPath]);
  const path = knownPath ?? loadedPath;
  const next = path?.next;
  return { score, seen: path?.seen, next, title: next?.findingId && titles?.get(next.findingId) };
}

type FolderProps = { row: MatchRow; expanded?: boolean; onMore?: () => void; featured?: boolean; path?: ReviewPath };

export function MatchFolder({ row, expanded, onMore, featured = false, path }: FolderProps) {
  const { score, next, seen, title } = useReviewDetails(row, path);
  const map = getMapMeta(row.map) ?? getMapMeta("de_" + row.map.toLowerCase());
  const ready = row.status === "complete";
  const failed = row.status === "failed";
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await api.retryProcessing(row.id);
      router.push(`/processing/${row.id}`);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Unable to start processing again. Try again.");
      setRetrying(false);
    }
  }
  const [status, setStatus] = useState<StatusResponse | null>(null);
  useEffect(() => {
    if (ready || row.status === "failed") return;
    let live = true;
    api.getStatus(row.id).then((data) => { if (live) setStatus(data); }).catch(() => undefined);
    return () => { live = false; };
  }, [row.id, row.status, ready]);
  const activeIndex = status?.stages.findIndex((s) => s.state === "active") ?? -1;
  const activeStage = status?.stages[activeIndex];
  const openStudio = (ready && row.playerId) || (!featured && row.status === "awaiting_player");
  const href = openStudio ? `/studio/${row.id}${next ? "?m=" + encodeURIComponent(next.id) : ""}` : `/processing/${row.id}`;
  const result = score && (score[0] === score[1] ? "Draw" : score[0] > score[1] ? "Won" : "Lost");
  const fullySeen = !!seen?.length && seen.every(Boolean);
  const parts = score ?? row.score?.match(/^(\d+)\s*[-–:]\s*(\d+)$/)?.slice(1);
  const mapTitle = map?.displayName ?? (row.map && row.map !== "…" ? row.map : "Demo");
  const label = row.title || mapTitle;
  const nextLabel = retryError ?? (failed ? "Processing stopped" : null) ?? (next ? `Next: ${String(next.number).padStart(2, "0")} ${title ?? "Round " + next.round}` :
    fullySeen ? "All moments seen" : ready ? `${row.moments} ${row.moments === 1 ? "moment" : "moments"}` : activeStage?.label ?? "Open processing");
  const action = ready ? "Open moment" : row.status === "awaiting_setup" || row.status === "awaiting_player" ? "Set up review" : "View processing";
  const seenCount = seen?.filter(Boolean).length ?? 0;
  // The link's name replaces its content for screen readers, so it carries everything the folder shows.
  const summary = [label, ready && parts ? `${parts[0]}–${parts[1]}${result ? " " + result.toLowerCase() : ""}` : stages[row.status],
    row.when, row.playerName, seen?.length && !fullySeen ? `${seenCount} of ${seen.length} moments seen` : "", nextLabel].filter(Boolean).join(", ");
  return <article className="match-folder" data-featured={featured || undefined} data-failed={failed || undefined} data-map={map?.mapName}>
    <Link className="folder-link" href={href} aria-label={featured ? `${action}: ${summary}` : `Open ${summary}`}>
      {map?.radarImage && <span className="folder-map" aria-hidden="true" style={{ backgroundImage: `url(${map.radarImage})` }} />}
      <FolderFront />
      <span className="folder-tab">{mapTitle}</span>
      <div className="folder-content">
        {ready && parts ? <div className="folder-score">
          <strong className="num"><span data-behind={Number(parts[0]) < Number(parts[1])}>{parts[0]}</span><i>–</i><span data-behind={Number(parts[1]) < Number(parts[0])}>{parts[1]}</span></strong>
          {result && <span className="folder-result" data-win={result === "Won"}>{result}</span>}
        </div> : <h2>{stages[row.status] ?? row.status}</h2>}
        {row.title && <strong className="folder-title">{row.title}</strong>}
        <p>{[row.when, row.playerName].filter(Boolean).join(", ")}</p>
      </div>
      {seen && seen.length > 0 && <span className="folder-dots" aria-hidden="true">
        {seen.map((v, i) => <i key={i} data-seen={v} />)}
      </span>}
      <span className={ready || featured || failed ? "folder-foot" : "folder-foot folder-status"}>
        <span>{nextLabel}{featured && activeStage && status && <small className="home-stage-count">Stage {activeIndex + 1} of {status.stages.length}</small>}</span>
        {failed ? null : featured ? <b className="folder-action">{action}</b> : !ready && status && activeIndex >= 0
          ? <small>Stage {activeIndex + 1} of {status.stages.length}</small>
          : <b className="folder-bead" aria-hidden="true" data-seen={fullySeen}>
            <svg {...icon}><path d={fullySeen ? "M3.5 8.5l3 3 6-7" : "M6 3.5 10.5 8 6 12.5"} /></svg>
          </b>}
      </span>
    </Link>
    {failed && <button type="button" className="btn btn-fill folder-retry" disabled={retrying}
      aria-label={`Retry processing ${label}`} onClick={() => void retry()}>{retrying ? "Retrying…" : "Retry processing"}</button>}
    {failed && <span className="sr-only" role="alert">{retryError}</span>}
    {onMore && <button className="folder-more" type="button" title="Match options" aria-label={`Options for ${[label, ready && parts ? `${parts[0]}–${parts[1]}` : "", row.when].filter(Boolean).join(", ")}`}
      aria-expanded={expanded} aria-controls={expanded ? "library-actions" : undefined} onClick={onMore}>
      <svg {...icon} fill="currentColor" stroke="none"><circle cx="3.5" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="12.5" cy="8" r="1.4" /></svg>
    </button>}
  </article>;
}

export function UploadFolder() {
  return <Link className="match-folder upload-folder" href="/upload">
    <FolderFront /><span className="folder-tab">New</span>
    <div className="folder-content"><h2>Add a demo to review</h2>
      <p>.dem from CS Demo Manager or .dem.zst from FACEIT, on Ancient or Anubis</p></div>
    <span className="folder-bead add-bead" aria-hidden="true"><PlusIcon /></span>
  </Link>;
}

export function RecurringFindings() {
  const { playerId, player, players, error } = useCoachedPlayer();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!playerId) return;
    let live = true;
    setFailed(false);
    api.getProgress(playerId).then((data) => { if (live) setProgress(data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [playerId]);
  const items = progress?.detectors.map((d) => ({ ...d, matches: d.counts.filter((count) => count > 0).length }))
    .filter((d) => d.matches > 1).sort((a,b) => b.matches - a.matches).slice(0,3);
  return <section className="library-patterns">
    <h2>What keeps coming back</h2>
    {items?.length ? <ul>{items.map((d) => <li key={d.detector} data-good={d.kind === "good"}>
      <i className={d.kind === "good" ? "g g-strength" : d.kind === "mistake" ? "g g-mistake" : "g g-note"} aria-hidden="true" />
      <strong>{d.label}</strong><span>{d.matches} of {progress?.matches.length} matches</span>
    </li>)}</ul> : <p>{error || failed ? "Player progress is unavailable." : !players || (playerId && !progress) ? "Looking for recurring findings…" : "No repeated findings across reviewed matches yet."}</p>}
    {player && <Link href="/progress">View progress for {player.name}</Link>}
  </section>;
}
