"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readStartRate } from "@/lib/prefs";

export type PlaybackRate = 0.5 | 1 | 2 | 4;
export type ClockMaster = "raf" | "video";

export type PlaybackClock = {
  t: number;
  playing: boolean;
  rate: PlaybackRate;
  duration: number;
  master: ClockMaster;
  setMaster: (m: ClockMaster) => void;
  bindVideo: (el: HTMLVideoElement | null) => void;
  setT: (t: number) => void;
  seek: (t: number) => void;
  seekBy: (delta: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setRate: (r: PlaybackRate) => void;
  setDuration: (d: number) => void;
  reset: (duration: number) => void;
};

/**
 * Shared playback clock for Radar, Gameplay, timeline and inspector.
 * - `raf` master: requestAnimationFrame advances `t`; bound video is scrubbed to match.
 * - `video` master: HTML5 video drives `t` via timeupdate / requestVideoFrameCallback.
 */
export function usePlaybackClock(initialDuration = 0): PlaybackClock {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [duration, setDuration] = useState(initialDuration);
  const [master, setMasterState] = useState<ClockMaster>("raf");
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef<PlaybackRate>(1);
  const durationRef = useRef(initialDuration);
  const masterRef = useRef<ClockMaster>("raf");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const rvfcRef = useRef<number | null>(null);

  const setT = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current, next));
    tRef.current = clamped;
    setTState(clamped);
  }, []);

  const syncVideoTime = useCallback((next: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    if (Math.abs(v.currentTime - next) > 0.05) {
      try {
        v.currentTime = next;
      } catch {
        /* ignore seek before metadata */
      }
    }
  }, []);

  const seek = useCallback(
    (next: number) => {
      setT(next);
      syncVideoTime(Math.max(0, Math.min(durationRef.current, next)));
    },
    [setT, syncVideoTime],
  );

  const seekBy = useCallback(
    (delta: number) => {
      seek(tRef.current + delta);
    },
    [seek],
  );

  const play = useCallback(() => {
    playingRef.current = true;
    setPlaying(true);
    const v = videoRef.current;
    if (v && masterRef.current === "video") {
      void v.play().catch(() => {
        /* autoplay / decode failures surface in GameplayView */
      });
    }
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    lastTsRef.current = null;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const setMaster = useCallback(
    (m: ClockMaster) => {
      masterRef.current = m;
      setMasterState(m);
      const v = videoRef.current;
      if (!v) return;
      if (m === "video") {
        syncVideoTime(tRef.current);
        v.playbackRate = rateRef.current;
        if (playingRef.current) void v.play().catch(() => undefined);
        else v.pause();
      } else {
        syncVideoTime(tRef.current);
        if (!playingRef.current) v.pause();
      }
    },
    [syncVideoTime],
  );

  const bindVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el) return;
      el.playbackRate = rateRef.current;
      syncVideoTime(tRef.current);
      if (masterRef.current === "video" && playingRef.current) {
        void el.play().catch(() => undefined);
      } else if (masterRef.current === "video") {
        el.pause();
      }
    },
    [syncVideoTime],
  );

  const reset = useCallback(
    (d: number) => {
      durationRef.current = d;
      setDuration(d);
      setT(0);
      pause();
      syncVideoTime(0);
    },
    [pause, setT, syncVideoTime],
  );

  // The starting speed from Settings (A07); read after mount so the server render matches
  useEffect(() => {
    setRate(readStartRate());
  }, []);

  useEffect(() => {
    rateRef.current = rate;
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // RAF master loop
  useEffect(() => {
    if (master !== "raf" || !playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const next = tRef.current + dt * rateRef.current;
      if (next >= durationRef.current) {
        tRef.current = durationRef.current;
        setTState(durationRef.current);
        playingRef.current = false;
        setPlaying(false);
        lastTsRef.current = null;
        syncVideoTime(durationRef.current);
        return;
      }
      tRef.current = next;
      setTState(next);
      syncVideoTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, master, syncVideoTime]);

  // Video master: pull time from the element
  useEffect(() => {
    const v = videoRef.current;
    if (master !== "video" || !v) {
      if (rvfcRef.current != null && videoRef.current && "cancelVideoFrameCallback" in videoRef.current) {
        try {
          videoRef.current.cancelVideoFrameCallback(rvfcRef.current);
        } catch {
          /* ignore */
        }
      }
      rvfcRef.current = null;
      return;
    }

    const pull = () => {
      const el = videoRef.current;
      if (!el || masterRef.current !== "video") return;
      const next = Math.max(0, Math.min(durationRef.current, el.currentTime || 0));
      tRef.current = next;
      setTState(next);
      if (el.ended || next >= durationRef.current - 0.02) {
        playingRef.current = false;
        setPlaying(false);
      }
    };

    const onTimeUpdate = () => pull();
    const onEnded = () => {
      setT(durationRef.current);
      pause();
    };
    const onPlay = () => {
      if (!playingRef.current) {
        playingRef.current = true;
        setPlaying(true);
      }
    };
    const onPause = () => {
      if (playingRef.current && masterRef.current === "video") {
        // External pause (buffering end / user) — keep clock state if we initiated pause
      }
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);

    let cancelled = false;
    const scheduleRvfc = () => {
      const el = videoRef.current;
      if (!el || cancelled || masterRef.current !== "video") return;
      if ("requestVideoFrameCallback" in el) {
        rvfcRef.current = el.requestVideoFrameCallback(() => {
          pull();
          scheduleRvfc();
        });
      }
    };
    scheduleRvfc();

    return () => {
      cancelled = true;
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      if (rvfcRef.current != null && "cancelVideoFrameCallback" in v) {
        try {
          v.cancelVideoFrameCallback(rvfcRef.current);
        } catch {
          /* ignore */
        }
      }
      rvfcRef.current = null;
    };
  }, [master, pause, setT]);

  // Keep video play/pause aligned when playing flag changes under video master
  useEffect(() => {
    const v = videoRef.current;
    if (!v || master !== "video") return;
    if (playing) {
      if (v.paused) void v.play().catch(() => undefined);
    } else if (!v.paused) {
      v.pause();
    }
  }, [playing, master]);

  return {
    t,
    playing,
    rate,
    duration,
    master,
    setMaster,
    bindVideo,
    setT,
    seek,
    seekBy,
    play,
    pause,
    toggle,
    setRate,
    setDuration: (d: number) => {
      durationRef.current = d;
      setDuration(d);
    },
    reset,
  };
}
