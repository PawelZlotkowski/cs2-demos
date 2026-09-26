"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlaybackRate = 0.5 | 1 | 2 | 4;

export type PlaybackClock = {
  t: number;
  playing: boolean;
  rate: PlaybackRate;
  duration: number;
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

/** Shared playback clock for Radar, timeline and inspector. */
export function usePlaybackClock(initialDuration = 0): PlaybackClock {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [duration, setDuration] = useState(initialDuration);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef<PlaybackRate>(1);
  const durationRef = useRef(initialDuration);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const setT = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current, next));
    tRef.current = clamped;
    setTState(clamped);
  }, []);

  const seek = useCallback(
    (next: number) => {
      setT(next);
    },
    [setT],
  );

  const seekBy = useCallback(
    (delta: number) => {
      setT(tRef.current + delta);
    },
    [setT],
  );

  const play = useCallback(() => {
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    lastTsRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const reset = useCallback(
    (d: number) => {
      durationRef.current = d;
      setDuration(d);
      setT(0);
      pause();
    },
    [pause, setT],
  );

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!playing) {
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
        return;
      }
      tRef.current = next;
      setTState(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  return {
    t,
    playing,
    rate,
    duration,
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
