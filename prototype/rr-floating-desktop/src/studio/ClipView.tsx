import { useEffect, useRef } from 'react';
import type { ClipState, RoundData } from '../data/model';
import { clock } from '../ui/time';

export type ClipInfo = ClipState & { label: string };

type Props = {
  you: string;
  round: RoundData;
  clip: ClipInfo;
  t: number;
  main: boolean;
  sound: boolean;
  playing: boolean;
  rate: number;
  onSeek: (t: number) => void;
};

/** The recorded first-person clip, driven by the shared clock: video time is round time minus the clip's start. */
export function ClipView({ you, round, clip, t, main, sound, playing, rate, onSeek }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const inside = t >= clip.t0 && t <= clip.t1;
  const local = Math.min(Math.max(t, clip.t0), clip.t1) - clip.t0;

  useEffect(() => {
    const v = ref.current;
    if (!v || clip.status !== 'ready') return;
    v.playbackRate = rate;
    if (playing && inside) {
      if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local;
      if (v.paused) void v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - local) > 0.05) v.currentTime = local;
    }
  }, [clip.status, playing, inside, local, rate]);

  if (clip.status === 'recording') {
    return (
      <div className="clip-note" role="status">
        <span className="thinking">
          Recording {you}&rsquo;s view of {clock(clip.t0)} to {clock(clip.t1)}
        </span>
      </div>
    );
  }

  if (clip.status !== 'ready' || !clip.url) {
    return (
      <div className="clip-note" role="status">
        <span>
          {clip.status === 'failed'
            ? `The clip could not be recorded${clip.error ? `: ${clip.error}` : ''}.`
            : `No clip of ${clip.label}. Clips need CS Demo Manager on this computer (RR_CSDM_ENABLED=1); the radar covers it.`}
        </span>
      </div>
    );
  }

  const dead = round.deaths[you] != null && t >= round.deaths[you];

  return (
    <div className={`clip${dead ? ' is-dead' : ''}`}>
      <video ref={ref} src={clip.url} muted={!sound} playsInline preload="auto" />
      {!inside && main ? (
        <button type="button" className="clip-jump btn" onClick={() => onSeek(clip.t0)}>
          Clip covers {clock(clip.t0)} to {clock(clip.t1)}. Go to it
        </button>
      ) : null}
    </div>
  );
}
