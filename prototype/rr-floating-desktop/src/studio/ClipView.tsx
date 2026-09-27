import type { MapId } from '../mock/maps';
import type { RoundData } from '../mock/replay';
import { YOU } from '../mock/world';
import { clock } from '../ui/time';

export type ClipInfo = { t0: number; t1: number; status: 'ready' | 'recording'; label: string };

type Props = {
  map: MapId;
  round: RoundData;
  clip: ClipInfo;
  t: number;
  main: boolean;
  zone: string;
  onSeek: (t: number) => void;
};

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Placeholder for the recorded first-person clip: a quiet corridor that moves with the shared clock. */
export function ClipView({ map, round, clip, t, main, zone, onSeek }: Props) {
  if (clip.status === 'recording') {
    return (
      <div className="clip-note" role="status">
        <span className="thinking">
          Recording {YOU}&rsquo;s view of {clock(clip.t0)} to {clock(clip.t1)}
        </span>
      </div>
    );
  }

  const inside = t >= clip.t0 && t <= clip.t1;
  const local = Math.min(Math.max(t, clip.t0), clip.t1) - clip.t0;
  const len = Math.max(1, clip.t1 - clip.t0);
  const dead = round.deaths[YOU] != null && t >= round.deaths[YOU];
  const sway = Math.sin(local * 1.7) * 10;
  const bob = Math.abs(Math.sin(local * 3.4)) * 5;
  const push = 1 + (local / len) * 0.07;
  const warm = map === 'de_mirage';
  const h = (hue(zone) % 24) - 12;
  const wall = `hsl(${(warm ? 34 : 40) + h} ${warm ? 30 : 22}% 62%)`;
  const wallDark = `hsl(${(warm ? 30 : 36) + h} ${warm ? 26 : 20}% 44%)`;
  const floor = `hsl(${(warm ? 32 : 38) + h} 18% 52%)`;
  const near = round.events.find((e) => e.type === 'kill' && (e.actor === YOU || e.victim === YOU) && Math.abs(e.t - t) < 1.6);
  const feed = round.events.filter((e) => e.type === 'kill' && e.t <= t && t - e.t < 5).slice(-3);
  const ammo = Math.max(0, 30 - Math.floor(round.events.filter((e) => e.type === 'kill' && e.actor === YOU && e.t <= t).length * 7));

  return (
    <div className={`clip${dead ? ' is-dead' : ''}`}>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g style={{ transform: `translate(${800 + sway}px, ${450 + bob}px) scale(${push}) translate(-800px, -450px)` }}>
          <rect width="1600" height="900" fill={`hsl(${205 + h} 30% 78%)`} />
          <polygon points="0,0 560,250 560,640 0,900" fill={wall} />
          <polygon points="1600,0 1040,250 1040,640 1600,900" fill={wallDark} />
          <polygon points="0,900 560,640 1040,640 1600,900" fill={floor} />
          <polygon points="560,250 1040,250 1040,640 560,640" fill={`hsl(${30 + h} 22% 70%)`} />
          <rect x="700" y="330" width="200" height="310" rx="100" ry="100" fill={`hsl(${28 + h} 18% 30%)`} />
          <rect x="700" y="430" width="200" height="210" fill={`hsl(${28 + h} 18% 30%)`} />
          <line x1="0" y1="620" x2="560" y2="560" stroke="rgba(0,0,0,.08)" strokeWidth="6" />
          <line x1="1600" y1="620" x2="1040" y2="560" stroke="rgba(0,0,0,.1)" strokeWidth="6" />
          {near && !dead ? (
            <g opacity="0.9">
              <ellipse cx="800" cy="505" rx="22" ry="26" fill="#3a3530" />
              <rect x="772" y="530" width="56" height="110" rx="18" fill="#3a3530" />
            </g>
          ) : null}
        </g>
        <g transform={`translate(${sway * 0.6} ${bob * 1.4})`}>
          <polygon points="1130,900 1250,700 1420,640 1600,660 1600,900" fill="#2f3235" />
          <polygon points="1250,700 1480,560 1520,585 1330,720" fill="#3b3f43" />
        </g>
        <g stroke="rgba(255,255,255,.9)" strokeWidth="3">
          <line x1="786" y1="450" x2="796" y2="450" />
          <line x1="804" y1="450" x2="814" y2="450" />
          <line x1="800" y1="436" x2="800" y2="446" />
          <line x1="800" y1="454" x2="800" y2="464" />
        </g>
      </svg>
      <div className="clip-hud" aria-hidden>
        <span className="num">{dead ? 0 : 100}</span>
        <span className="num">
          {ammo} / 90
        </span>
      </div>
      {feed.length && main ? (
        <ul className="clip-feed" aria-hidden>
          {feed.map((e) => (
            <li key={e.id} className={e.actor === YOU || e.victim === YOU ? 'me' : ''}>
              {e.actor} <span>{e.weapon}</span> {e.victim}
            </li>
          ))}
        </ul>
      ) : null}
      {dead ? <div className="clip-dead">{YOU} died at {clock(round.deaths[YOU])}</div> : null}
      {main ? <span className="clip-tag">Placeholder, the recorded clip plays here</span> : null}
      {!inside && main ? (
        <button type="button" className="clip-jump btn" onClick={() => onSeek(clip.t0)}>
          Clip covers {clock(clip.t0)} to {clock(clip.t1)}. Go to it
        </button>
      ) : null}
    </div>
  );
}
