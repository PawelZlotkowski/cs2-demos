import type { WinId } from '../state/store';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Monochrome line glyphs for the dock and menus. */
export function AppIcon({ id, size = 28 }: { id: WinId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      {id === 'matches' ? (
        <g {...P}>
          <rect x="4.5" y="5.5" width="19" height="17" rx="2.5" />
          <path d="M4.5 10.5h19M9 14.5h10M9 18h7" />
        </g>
      ) : id === 'studio' ? (
        <g {...P}>
          <rect x="3.5" y="6" width="21" height="14" rx="2.5" />
          <rect x="14.5" y="8.5" width="7.5" height="5.5" rx="1" />
          <path d="M9 23h10" />
        </g>
      ) : id === 'progress' ? (
        <g {...P}>
          <path d="M5 22.5h18" />
          <path d="M6.5 18l5-5 4 3 6-7.5" />
          <circle cx="21.5" cy="8.5" r="1.3" />
        </g>
      ) : id === 'coach' ? (
        <g {...P}>
          <path d="M5.5 7.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4.5 3.5V18.5h-.5a2 2 0 0 1-2-2z" />
          <path d="M10 11h8M10 14.5h5" />
        </g>
      ) : id === 'settings' ? (
        <g {...P}>
          <circle cx="14" cy="14" r="3.2" />
          <path d="M14 4.5v3M14 20.5v3M4.5 14h3M20.5 14h3M7.3 7.3l2.1 2.1M18.6 18.6l2.1 2.1M7.3 20.7l2.1-2.1M18.6 9.4l2.1-2.1" />
        </g>
      ) : id === 'admin' ? (
        <g {...P}>
          <path d="M14 4.5l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6z" />
          <path d="M10.5 14l2.5 2.5 4.5-5" />
        </g>
      ) : id === 'reviews' ? (
        <g {...P}>
          <path d="M8 5.5h10.5l3 3v14h-13.5z" />
          <path d="M5.5 8.5v14.5h11" />
          <path d="M11.5 12h7M11.5 15.5h7M11.5 19h4" />
        </g>
      ) : (
        <g {...P}>
          <path d="M14 5.5v12M9 13l5 5 5-5" />
          <path d="M5.5 20v2.5h17V20" />
        </g>
      )}
    </svg>
  );
}
