import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { MapId } from '../data/maps';
import type { Finding, FindingKind, RoundData } from '../data/model';
import { clock } from '../ui/time';
import { ClipView, type ClipInfo } from './ClipView';
import { Radar } from './Radar';

export type View = 'gameplay' | 'radar';

type Props = {
  map: MapId | null;
  you: string;
  round: RoundData;
  t: number;
  playing: boolean;
  rate: number;
  main: View;
  onMain: (v: View) => void;
  clip: ClipInfo;
  focusFinding: Finding | null;
  selectedEventId: string | null;
  chip: { glyph: FindingKind | 'round'; n: string; label: string };
  onSeek: (t: number) => void;
  onDownload: () => void;
  onRetry?: () => void;
};

type Box = { left: number; top: number; width: number; height: number };

const GAP = 12;

/** Clip and radar share one stage: one fills it, the other peeks top right; a click on the peek swaps them. */
export function Stage({ map, you, round, t, playing, rate, main, onMain, clip, focusFinding, selectedEventId, chip, onSeek, onDownload, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [whole, setWhole] = useState(false);
  const [sound, setSound] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const full: Box = { left: 0, top: 0, width: size.w, height: size.h };
  const cw = Math.round(Math.min(size.w * 0.32, (size.h * 0.46 * 16) / 9));
  const clipPeek: Box = { width: cw, height: Math.round((cw * 9) / 16) + 30, left: size.w - cw - GAP, top: GAP };
  const rw = Math.round(Math.min(size.w * 0.28, size.h * 0.5));
  const radarPeek: Box = { width: rw, height: rw, left: size.w - rw - GAP, top: GAP };

  const clipMain = main === 'gameplay';
  const clipBox = clipMain ? full : clipPeek;
  const radarBox = clipMain ? radarPeek : full;
  const span = `${clock(clip.t0)} to ${clock(clip.t1)}`;

  const caption = (
    <figcaption className="pov-cap" onClick={(e) => e.stopPropagation()}>
      <span>
        <b>{you}</b>&rsquo;s view{clipMain ? `, ${span}` : ''}
      </span>
      {clipMain && clip.status === 'ready' ? (
        <button type="button" aria-pressed={sound} onClick={() => setSound((x) => !x)}>
          {sound ? 'Sound on' : 'Sound off'}
        </button>
      ) : null}
      <button type="button" onClick={onDownload} disabled={clip.status !== 'ready'}>
        Download
      </button>
      {clipMain ? null : (
        <button type="button" onClick={() => onMain('gameplay')} title="Show the clip large (V)">
          Enlarge
        </button>
      )}
    </figcaption>
  );

  return (
    <div className="stage" ref={ref}>
      <figure
        className={`surface s-clip${clipMain ? ' is-main' : ' is-peek'}`}
        style={clipBox as CSSProperties}
        onClick={clipMain ? undefined : () => onMain('gameplay')}
        title={clipMain ? undefined : 'Show the clip large (V)'}
      >
        <ClipView you={you} round={round} clip={clip} t={t} main={clipMain} sound={sound} playing={playing} rate={rate} onSeek={onSeek} onRetry={onRetry} />
        {caption}
      </figure>

      <div
        className={`surface s-radar${clipMain ? ' is-peek' : ' is-main'}`}
        style={radarBox as CSSProperties}
        onClick={clipMain ? () => onMain('radar') : undefined}
        title={clipMain ? 'Show the radar large (V)' : undefined}
      >
        <Radar map={map} round={round} t={t} whole={whole} small={clipMain} focusFinding={focusFinding} selectedEventId={selectedEventId} />
        {clipMain ? (
          <div className="peek-cap">
            <span>Radar</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMain('radar');
              }}
            >
              Enlarge
            </button>
          </div>
        ) : (
          <>
            <div className="legend" aria-hidden>
              <span>
                <i className="lg-you" />
                {you}
              </span>
              <span>
                <i className="lg-team" />
                Team
              </span>
              <span>
                <i className="lg-enemy" />
                Enemy
              </span>
            </div>
            <button type="button" className="zoom-btn" aria-pressed={whole} onClick={() => setWhole((w) => !w)}>
              {whole ? 'This round' : 'Whole map'}
            </button>
          </>
        )}
      </div>

      <div className={`chip chip-${chip.glyph}`}>
        <i className={`g g-${chip.glyph}`} aria-hidden />
        <b>{chip.n}</b>
        <span>{chip.label}</span>
      </div>
    </div>
  );
}
