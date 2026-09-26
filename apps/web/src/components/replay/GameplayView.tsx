"use client";

import { useEffect, useRef } from "react";

type GameplayViewProps = {
  src: string | null;
  active: boolean;
  disabledReason?: string | null;
  onBind: (el: HTMLVideoElement | null) => void;
};

/** First-person round clip on the dark stage. Plain HTML5 video — no world overlays. */
export function GameplayView({ src, active, disabledReason, onBind }: GameplayViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    onBind(videoRef.current);
    return () => onBind(null);
  }, [onBind, src]);

  if (!src) {
    return (
      <div className="stage-msg gameplay-msg">
        <p>
          <strong>Gameplay unavailable</strong>
          {disabledReason ? ` — ${disabledReason}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className={`gameplay-surface${active ? " is-active" : ""}`}>
      <video
        ref={videoRef}
        className="gameplay-video"
        src={src}
        playsInline
        preload="auto"
        aria-label="Gameplay clip for this round"
      />
    </div>
  );
}
