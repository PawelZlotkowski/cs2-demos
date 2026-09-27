"use client";

import { useEffect, useRef, useState } from "react";
import type { MomentClip } from "@/lib/contracts";
import { formatClock } from "@/lib/replay/time";

type PovClipProps = {
  clip: MomentClip;
  src: string | null;
  /** Fills the stage (Gameplay view) instead of sitting in the corner of the radar. */
  main: boolean;
  playerName: string;
  /** Shared playback clock, round seconds. */
  t: number;
  playing: boolean;
  rate: number;
  onSeek: (t: number) => void;
  onRetry: (clipId: string) => void;
  onEnlarge: () => void;
};

/** Seconds the video may drift from the clock while playing before it is re-seeked. */
const DRIFT = 0.25;

/**
 * First-person clip of the coached player: docked on the Radar stage, or filling it in the Gameplay view.
 * The clip covers round seconds t0..t1, so it follows the shared clock at `t - t0`:
 * it plays natively while the clock plays inside the window and holds its edge frame outside it.
 */
export function PovClip({ clip, src, main, playerName, t, playing, rate, onSeek, onRetry, onEnlarge }: PovClipProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const length = clip.t1 - clip.t0;
  const local = t - clip.t0;
  const inside = local >= 0 && t <= clip.t1;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src || v.readyState < 1) return;
    v.playbackRate = rate;
    if (playing && inside) {
      if (Math.abs(v.currentTime - local) > DRIFT) v.currentTime = local;
      if (v.paused) void v.play().catch(() => undefined);
      return;
    }
    if (!v.paused) v.pause();
    const hold = Math.max(0, Math.min(length, local));
    if (Math.abs(v.currentTime - hold) > 0.04) v.currentTime = hold;
  }, [src, local, inside, playing, rate, length]);

  const span = `${formatClock(clip.t0)} to ${formatClock(clip.t1)}`;

  if (!src) {
    const text =
      clip.status === "queued" || clip.status === "recording"
        ? `Recording ${playerName}'s view of ${span}…`
        : clip.status === "failed"
          ? (clip.error ?? "Recording failed.")
          : (clip.error ?? "Gameplay recording is off.");
    return (
      <div className={`pov pov-note${clip.status === "failed" ? " is-failed" : ""}`} role="status">
        <span>{text}</span>
        {clip.status === "failed" ? (
          <button type="button" onClick={() => onRetry(clip.id)}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <figure className={`pov${main ? " is-main" : ""}${inside ? "" : " is-outside"}`}>
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        playsInline
        preload="auto"
        aria-label={`${playerName}'s view, round ${clip.round}, ${span}`}
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = Math.max(0, Math.min(length, local));
        }}
      />
      {inside ? null : (
        <button type="button" className="pov-jump" onClick={() => onSeek(clip.t0)}>
          Clip covers {span}. Go to it
        </button>
      )}
      <figcaption>
        <span>
          <b>{playerName}</b>&rsquo;s view, {span}
        </span>
        <button type="button" aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>
          {muted ? "Sound off" : "Sound on"}
        </button>
        {main ? null : (
          <button type="button" onClick={onEnlarge} title="Show the clip large (V)">
            Enlarge
          </button>
        )}
      </figcaption>
    </figure>
  );
}
