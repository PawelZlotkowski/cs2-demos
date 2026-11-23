"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { MatchStatus, StatusResponse } from "@/lib/contracts";
import { reducedMotion } from "@/lib/motion";

// Some intermediate states have no row in the server's run log.
const interim: Partial<Record<MatchStatus, string>> = {
  uploaded: "Upload received",
  decompressed: "Demo unpacked",
  ready_to_parse: "Review confirmed",
  awaiting_player: "Choose a player",
  awaiting_setup: "Set up your review",
};

type Props = { status: StatusResponse | null; disconnected: boolean };

const glyphs = {
  check: "M3.5 8.5l3 3 6-7",
  alert: "M8 3.5v5.5M8 12.4v.1",
  info: "M8 7.5v4M8 4.6v.1",
  pause: "M6 4.5v7M10 4.5v7",
  working: "M4 6.5v3M8 4v8M12 5.5v5",
  upload: "M8 12.5V4M4.5 7.5 8 4l3.5 3.5",
};

function Glyph({ d }: { d: string }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function StatusIsland({ status, disconnected }: Props) {
  const stages = status?.stages ?? [];
  const index = stages.findIndex((stage) => stage.id === status?.status);
  const waiting = status?.status === "awaiting_setup" || status?.status === "awaiting_player";
  const state = disconnected ? "offline" : status?.status === "failed" ? "failed" :
    status?.status === "complete" ? "ready" : waiting ? "waiting" : "working";
  let label = stages[index]?.label ?? (status && interim[status.status]);
  if (state === "offline") label = "Reconnecting to the review";
  if (state === "ready") label = "Review ready";
  if (state === "failed") label = "Processing failed";
  const position = !disconnected && index >= 0 && state !== "failed" && state !== "ready"
    ? `Stage ${index + 1} of ${stages.length}` : null;

  return <Island state={state} label={label ?? "Checking review status"} position={position}
    symbol={<Glyph d={state === "ready" ? glyphs.check : state === "failed" || state === "offline" ? glyphs.alert :
      waiting ? glyphs.pause : glyphs.working} />} />;
}

export function UploadStatusIsland({ filename, percent }: { filename: string; percent: number | null }) {
  const sent = percent === 100;
  return <Island state="upload" label={sent ? "Sent " + filename : "Uploading " + filename}
    position={percent === null ? null : percent + "%"} percent={percent}
    symbol={percent === null ? <Glyph d={glyphs.upload} /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="3" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--stage-line)" />
      <circle cx="12" cy="12" r="9" pathLength="100" stroke="currentColor" strokeDasharray="100"
        strokeDashoffset={100 - percent} transform="rotate(-90 12 12)" />
    </svg>} />;
}

export function ServiceIsland({ label, detail }: { label: string; detail: string }) {
  return <Island state="service" label={label} detail={detail} position={null} symbol={<Glyph d={glyphs.info} />} />;
}

type IslandProps = {
  detail?: string;
  state: string;
  label: string;
  position: string | null;
  symbol: ReactNode;
  percent?: number | null;
};

function Island({ state, label, position, symbol, percent, detail }: IslandProps) {
  const plate = useRef<HTMLSpanElement>(null);
  const previousWidth = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = plate.current;
    if (!el) return;
    const width = el.offsetWidth;
    const first = previousWidth.current;
    previousWidth.current = width;
    if (!first || !width || width === first || reducedMotion()) return;
    const css = getComputedStyle(el);
    const animation = el.animate([{ transform: `scaleX(${first / width})` }, { transform: "none" }], {
      duration: parseFloat(css.getPropertyValue("--dur-spring-quick")),
      easing: css.getPropertyValue("--ease-spring").trim(),
    });
    return () => animation.cancel();
  }, [label, position]);

  return <div className="status-island" data-state={state}
    role={state === "upload" ? "progressbar" : "status"}
    aria-label={state === "upload" ? label : undefined}
    aria-valuenow={percent ?? undefined} aria-atomic={state === "upload" ? undefined : true}>
    <span className="status-island-plate" ref={plate} aria-hidden="true" />
    <span className="island-symbol" aria-hidden="true">{symbol}</span>
    {detail ? <div><strong>{label}</strong><small className="island-detail">{detail}</small></div> : <strong title={label}>{label}</strong>}
    {position && <span className="island-position">{position}</span>}
  </div>;
}
