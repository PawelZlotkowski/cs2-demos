"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, ApiError } from "./api";

export interface PlayerHandle {
  togglePlay(): void;
  replay(): void;
  goToMoment(): void;
  changeSpeed(step: number): void;
}

const SPEEDS = [0.5, 0.75, 1, 1.5];

/**
 * Plays a private R2 object through a five-minute signed URL. The browser fetches byte ranges
 * straight from R2. When a URL expires (or playback fails) it asks the server for a new one,
 * which the server issues only while the session and assignment are still valid, and restores
 * the playback position, speed and play state.
 */
export const ClipPlayer = forwardRef<PlayerHandle, { clipId: string; admin?: boolean; momentAt?: number | null; label: string }>(
  function ClipPlayer({ clipId, admin = false, momentAt = null, label }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const expiresAt = useRef(0);
    const renewing = useRef<Promise<void> | null>(null);
    const failures = useRef(0);
    const [src, setSrc] = useState<string | null>(null);
    const [speed, setSpeed] = useState(1);
    const [problem, setProblem] = useState<string | null>(null);
    const restore = useRef<{ time: number; playing: boolean } | null>(null);

    const fetchUrl = useCallback(async () => {
      const path = admin ? `/admin/clips/${clipId}/playback` : `/clips/${clipId}/playback`;
      const result = await api<{ url: string; expiresAt: string }>(path);
      expiresAt.current = Date.parse(result.expiresAt);
      return result.url;
    }, [admin, clipId]);

    const renew = useCallback(
      (keepPosition: boolean) => {
        if (renewing.current) return renewing.current;
        const element = video.current;
        if (keepPosition && element) restore.current = { time: element.currentTime, playing: !element.paused };
        renewing.current = (async () => {
          try {
            const url = await fetchUrl();
            setProblem(null);
            setSrc(url);
          } catch (error) {
            if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
              setProblem("You no longer have access to this clip.");
            } else {
              setProblem(error instanceof Error ? error.message : "The clip could not load.");
            }
          } finally {
            renewing.current = null;
          }
        })();
        return renewing.current;
      },
      [fetchUrl],
    );

    useEffect(() => {
      void renew(false);
    }, [renew]);

    // A URL close to expiry is replaced before the next play or seek needs new byte ranges.
    const ensureFresh = useCallback(() => {
      if (expiresAt.current && Date.now() > expiresAt.current - 15_000) void renew(true);
    }, [renew]);

    function onLoadedMetadata() {
      const element = video.current;
      if (!element) return;
      element.playbackRate = speed;
      const saved = restore.current;
      restore.current = null;
      failures.current = 0;
      if (saved) {
        element.currentTime = Math.min(saved.time, element.duration || saved.time);
        if (saved.playing) void element.play().catch(() => undefined);
      }
    }

    function onError() {
      failures.current += 1;
      if (failures.current <= 3) void renew(true);
      else setProblem("The clip could not load. Check your connection, then retry.");
    }

    function setRate(value: number) {
      setSpeed(value);
      if (video.current) video.current.playbackRate = value;
    }

    const controls: PlayerHandle = {
      togglePlay() {
        const element = video.current;
        if (!element) return;
        if (element.paused) {
          ensureFresh();
          void element.play().catch(() => undefined);
        } else element.pause();
      },
      replay() {
        const element = video.current;
        if (!element) return;
        ensureFresh();
        element.currentTime = 0;
        void element.play().catch(() => undefined);
      },
      goToMoment() {
        const element = video.current;
        if (!element || momentAt === null) return;
        ensureFresh();
        element.currentTime = Math.max(0, momentAt - 3);
        void element.play().catch(() => undefined);
      },
      changeSpeed(step: number) {
        const index = SPEEDS.indexOf(speed);
        const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (index < 0 ? 2 : index) + step))];
        setRate(next);
      },
    };
    useImperativeHandle(ref, () => controls);

    return (
      <div className="lb-player">
        <div className="lb-stage">
          {src ? (
            <video
              ref={video}
              className="lb-video"
              src={src}
              controls
              playsInline
              preload="metadata"
              aria-label={label}
              onLoadedMetadata={onLoadedMetadata}
              onError={onError}
              onPlay={ensureFresh}
              onSeeking={ensureFresh}
            />
          ) : (
            <p className="lb-stage-note" role="status">
              {problem ?? "Loading the clip…"}
            </p>
          )}
          {src && problem ? (
            <p className="lb-stage-note lb-stage-overlay" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
        <div className="lb-player-bar">
          <button type="button" className="lb-btn lb-btn-secondary" onClick={controls.replay}>
            Replay
          </button>
          {momentAt !== null ? (
            <button type="button" className="lb-btn lb-btn-secondary" onClick={controls.goToMoment}>
              Go to the moment
            </button>
          ) : null}
          <div className="lb-segmented" role="group" aria-label="Playback speed">
            {SPEEDS.map((value) => (
              <button key={value} type="button" aria-pressed={speed === value} onClick={() => setRate(value)}>
                {value}×
              </button>
            ))}
          </div>
          {problem ? (
            <button type="button" className="lb-btn lb-btn-secondary" onClick={() => void renew(true)}>
              Retry loading
            </button>
          ) : null}
        </div>
      </div>
    );
  },
);
