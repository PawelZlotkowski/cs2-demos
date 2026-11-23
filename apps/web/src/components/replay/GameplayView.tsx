"use client";

import { useEffect, useRef } from "react";

type GameplayViewProps = {
  src: string | null;
  onMediaError: () => void;
  active: boolean;
  disabledReason?: string | null;
  onRadar: () => void;
  onRetry?: () => void;
  onBind: (el: HTMLVideoElement | null) => void;
};

/** First-person round clip on the dark stage. Plain HTML5 video — no world overlays. */
export function GameplayView({ src, onMediaError, active, disabledReason, onRadar, onRetry, onBind }: GameplayViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    onBind(videoRef.current);
    return () => onBind(null);
  }, [onBind, src]);

  if (!src) {
    return (
      <div className="stage-msg gameplay-msg">
        <p>
          {disabledReason || "No gameplay clip is available for this round."}
        </p>
        <div className="row-actions">
          <button type="button" className="btn btn-line" onClick={onRadar}>Show radar</button>
          {onRetry && <button className="btn btn-line" onClick={onRetry}>Retry clip</button>}
        </div>
      </div>
    );
  }

  return (
    <div className={`gameplay-surface${active ? " is-active" : ""}`}>
      <video
        ref={videoRef}
        className="gameplay-video"
        src={src}
        onError={onMediaError}
        playsInline
        preload="auto"
        aria-label="Gameplay clip for this round"
      />
    </div>
  );
}
