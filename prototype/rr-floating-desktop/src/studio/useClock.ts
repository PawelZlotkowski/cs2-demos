import { useCallback, useEffect, useRef, useState } from 'react';

export const RATES = [0.5, 1, 2];

/** One playback clock in round seconds, shared by the radar, the clip and the timeline. */
export function useClock(duration: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const last = useRef<number | null>(null);
  const dur = useRef(duration);
  dur.current = duration;

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current == null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((x) => {
        const next = x + dt * rate;
        if (next >= dur.current) {
          setPlaying(false);
          return dur.current;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate]);

  const seek = useCallback((x: number) => setT(Math.max(0, Math.min(dur.current, x))), []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) setT((x) => (x >= dur.current - 0.05 ? 0 : x));
      return !p;
    });
  }, []);

  return { t, playing, rate, seek, toggle, pause: () => setPlaying(false), play: () => setPlaying(true), setRate };
}

export type Clock = ReturnType<typeof useClock>;
