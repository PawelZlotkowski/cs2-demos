/**
 * The shapes the desktop's windows draw, built from the API's contracts (apps/web/src/lib/contracts).
 * Names are the identity inside a round (tracks, kills, "you"), as the mock data had it, so the radar,
 * timeline and panels keep their logic; the adapters below resolve SteamIDs to names once.
 */
import type {
  Finding as ApiFinding,
  MatchRow,
  MatchStatus,
  MomentClip,
  ReplayPlayer,
  RoundClip,
  RoundReplay,
  RoundStats as ApiRoundStats,
  RoundSummary,
  SelectedMoment,
  Side,
} from '@/lib/contracts';
import { getMapMeta, worldToRadar } from '@/lib/replay/maps';
import { makeRosterLookup, reasonLabel } from '@/lib/replay/roster';
import { mapIdOf, mapName, type MapId } from './maps';

export type { MatchStatus, Side };

export type Match = {
  id: string;
  map: MapId | null;
  mapLabel: string;
  /** The owner's own name for the match, when they gave one */
  title: string | null;
  /** As the API stores it: rounds won by the CT side first. The Studio shows the player's own score. */
  score: string;
  when: string;
  status: MatchStatus;
  playerId: string | null;
  playerName: string | null;
  model: string | null;
  versions: number;
  moments: number;
  error?: string | null;
};

export function fromRow(r: MatchRow): Match {
  return {
    id: r.id,
    map: mapIdOf(r.map),
    mapLabel: mapName(r.map),
    title: r.title ?? null,
    score: r.score,
    when: r.when,
    status: r.status,
    playerId: r.playerId,
    playerName: r.playerName,
    model: r.model,
    versions: r.versions,
    moments: r.moments,
  };
}

export const BUSY: ReadonlySet<MatchStatus> = new Set<MatchStatus>([
  'uploaded',
  'decompressing',
  'decompressed',
  'parsing',
  'normalizing',
  'detecting',
  'selecting',
  'recording',
  'explaining',
]);

/** Detector kinds: "good" draws as a strength; "context" and "pattern" are neither mistake nor good play. */
export type FindingKind = 'mistake' | 'strength' | 'context';

export type Finding = {
  id: string;
  detector: string;
  template: string;
  kind: FindingKind;
  round: number;
  t: number;
  zone: string;
  summary: string;
};

export function fromFinding(f: ApiFinding): Finding {
  return {
    id: f.id,
    detector: f.detector,
    template: f.template || f.detector,
    kind: f.kind === 'good' ? 'strength' : f.kind === 'mistake' ? 'mistake' : 'context',
    round: f.round,
    t: f.t,
    zone: f.zone ?? '',
    summary: f.summary,
  };
}

const LABELS: Record<string, string> = {
  untraded_death: 'Untraded death',
  shot_while_moving: 'Shot while moving',
  unused_utility: 'Unused utility',
  dry_peek: 'Dry peek',
  team_flash: 'Team flash',
  'team_flash.self': 'Flashed self',
  opening_duel: 'Opening duel',
  economy_mismatch: 'Economy mismatch',
  'opening_duel.won': 'Opening duel won',
  'opening_duel.lost': 'Opening duel lost',
  'economy_mismatch.saved_on_buy': 'Saved on a buy round',
  'economy_mismatch.forced_on_save': 'Forced on a save round',
  late_rotation: 'Late rotation',
  repeated_death_zone: 'Same death spot',
  good_plays: 'Good play',
  'good_plays.trade_kill': 'Trade kill',
  'good_plays.entry_kill': 'Entry kill',
  'good_plays.multi_kill': 'Multi-kill',
  'good_plays.clutch': 'Clutch',
  'good_plays.flash_assist': 'Flash assist',
  'good_plays.utility_damage': 'Utility damage',
};

export function findingLabel(template: string): string {
  return LABELS[template] ?? LABELS[template.split('.')[0]] ?? template.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function detectorOf(template: string): string {
  return template.split('.')[0];
}

export type ClipState = {
  status: 'ready' | 'recording' | 'failed' | 'none';
  url: string | null;
  t0: number;
  t1: number;
  error?: string | null;
  /** The player clip's id, for a retry; absent for a whole-round clip. */
  id?: string;
  /** Saves the file under a readable name (?download=1). */
  download?: string | null;
};

export type Moment = {
  id: string;
  findingIds: string[];
  round: number;
  t0: number;
  t1: number;
  pickedBecause: string;
  source: 'agent' | 'ranker';
  clip: ClipState;
};

function clipState(c: MomentClip | undefined, t0: number, t1: number, mediaUrl: (p: string) => string): ClipState {
  if (!c) return { status: 'none', url: null, t0, t1 };
  const status = c.status === 'ready' && c.url ? 'ready' : c.status === 'queued' || c.status === 'recording' ? 'recording' : c.status === 'failed' ? 'failed' : 'none';
  const url = c.url ? mediaUrl(c.url) : null;
  return { status, url, t0: c.t0, t1: c.t1, error: c.error, id: c.id, download: url ? `${url}${url.includes('?') ? '&' : '?'}download=1` : null };
}

export function fromMoment(m: SelectedMoment, clips: MomentClip[], mediaUrl: (p: string) => string): Moment {
  const clip = clips.find((c) => c.momentId === m.id) ?? clips.find((c) => c.round === m.round && c.t0 <= m.t0 && c.t1 >= m.t1);
  return {
    id: m.id,
    findingIds: m.findingIds,
    round: m.round,
    t0: m.t0,
    t1: m.t1,
    pickedBecause: m.pickedBecause.replace(/^\s*\[F\d+\]\s*/, '').trim(),
    source: m.source,
    clip: clipState(clip, m.t0, m.t1, mediaUrl),
  };
}

/**
 * The clip for a round outside the coach's moments, picked as the web Studio picks it: a ready player clip
 * covering the clock, else any ready one in the round (rounds explained on demand queue one around their main
 * finding), else the newest; then CS:DM's whole-round clip, whose video time is round time.
 */
export function roundClip(
  round: number,
  t: number,
  clips: MomentClip[],
  roundClips: RoundClip[],
  roundId: string | null,
  duration: number,
  mediaUrl: (p: string) => string,
  wholeUrl: (roundId: string) => string,
): ClipState {
  const here = clips.filter((c) => c.round === round);
  const newest = (list: MomentClip[]) => list[list.length - 1];
  const pov = newest(here.filter((c) => c.status === 'ready' && t >= c.t0 && t <= c.t1)) ?? here.find((c) => c.status === 'ready') ?? newest(here);
  if (pov && pov.status !== 'failed') return clipState(pov, 0, duration, mediaUrl);
  const whole = roundId ? roundClips.find((c) => c.roundId === roundId) : undefined;
  if (whole && roundId && (whole.status !== 'skipped' || !pov)) {
    const status = whole.status === 'ready' && whole.url ? 'ready' : whole.status === 'queued' || whole.status === 'recording' ? 'recording' : whole.status === 'failed' ? 'failed' : 'none';
    if (status !== 'none' || !pov) {
      const url = status === 'ready' ? wholeUrl(roundId) : null;
      return { status, url, t0: 0, t1: whole.durationSec || duration, error: whole.error, download: url };
    }
  }
  return clipState(pov, 0, duration, mediaUrl);
}

export type RoundStats = Omit<ApiRoundStats, 'round' | 'playerId'>;

export type Key = { t: number; x: number; y: number };

export type ReplayEvent = {
  id: string;
  t: number;
  /** kill, smoke, flash, he, molotov, plant, defuse */
  type: string;
  label: string;
  actor: string;
  victim?: string;
  weapon?: string;
  /** Radar pixels; null when the parser gave no position. */
  x: number | null;
  y: number | null;
};

export type RoundData = {
  number: number;
  won: boolean | null;
  side: Side | null;
  winner: Side | null;
  reason: string;
  duration: number;
  stats: RoundStats | null;
  findings: Finding[];
  /** False until the round's replay has loaded; tracks and events are empty until then. */
  loaded: boolean;
  you: string;
  team: Set<string>;
  enemy: Set<string>;
  tracks: Record<string, Key[]>;
  deaths: Record<string, number>;
  events: ReplayEvent[];
};

export function roundShell(
  r: RoundSummary,
  stats: ApiRoundStats | undefined,
  findings: Finding[],
  you: string,
): RoundData {
  return {
    number: r.number,
    won: stats?.won ?? null,
    side: stats?.side ?? null,
    winner: r.winner ?? null,
    reason: reasonLabel(r.reason),
    duration: r.durationSec,
    stats: stats ?? null,
    findings: findings.filter((f) => f.round === r.number).sort((a, b) => a.t - b.t),
    loaded: false,
    you,
    team: new Set(),
    enemy: new Set(),
    tracks: {},
    deaths: {},
    events: [],
  };
}

const EVENT_TYPE: Record<string, string> = { incendiary: 'molotov', inferno: 'molotov', bomb_planted: 'plant', bomb_defused: 'defuse' };

/** Fill a round shell with its replay: tracks and deaths by player name, events with radar positions. */
export function withReplay(shell: RoundData, replay: RoundReplay, focusId: string | null): RoundData {
  const meta = getMapMeta(replay.map);
  const lookup = makeRosterLookup(replay.players);
  const byId = new Map(replay.players.map((p) => [p.id, p]));
  const focus: ReplayPlayer | undefined = focusId ? lookup(focusId) : undefined;
  const side = focus?.team ?? shell.side ?? 'CT';
  const nameOf = (id: string | null | undefined) => lookup(id)?.name ?? '';

  const tracks: Record<string, Key[]> = {};
  const deaths: Record<string, number> = {};
  for (const s of replay.samples) {
    for (const p of s.players) {
      const name = byId.get(p.id)?.name ?? lookup(p.id)?.name;
      if (!name) continue;
      let x = p.rx;
      let y = p.ry;
      if ((x == null || y == null) && meta) ({ rx: x, ry: y } = worldToRadar(p.x, p.y, meta));
      if (x == null || y == null) continue;
      if (!p.alive || p.health <= 0) {
        if (deaths[name] == null && (tracks[name]?.length ?? 0) > 0) deaths[name] = s.t;
        continue;
      }
      (tracks[name] ??= []).push({ t: s.t, x, y });
    }
  }

  const events: ReplayEvent[] = [];
  for (const e of replay.events) {
    if (e.type === 'round_start' || e.type === 'round_end') continue;
    const type = EVENT_TYPE[e.type] ?? e.type;
    let x: number | null = null;
    let y: number | null = null;
    if (e.pos && meta) ({ rx: x, ry: y } = worldToRadar(e.pos.x, e.pos.y, meta));
    const victim = type === 'kill' ? nameOf(e.victimId) : undefined;
    const weapon = type === 'kill' ? /\(([^)]+)\)\s*$/.exec(e.label)?.[1] : undefined;
    if (type === 'kill' && victim && deaths[victim] == null) deaths[victim] = e.t;
    events.push({ id: e.id, t: e.t, type, label: e.label, actor: nameOf(e.actorId), victim, weapon, x, y });
  }
  // A kill is the better death time than the first dead sample, which can lag by a sampling step
  for (const e of events) if (e.type === 'kill' && e.victim) deaths[e.victim] = Math.min(deaths[e.victim] ?? e.t, e.t);

  const team = new Set(replay.players.filter((p) => p.team === side).map((p) => p.name));
  const enemy = new Set(replay.players.filter((p) => p.team !== side).map((p) => p.name));
  return {
    ...shell,
    side: shell.side ?? focus?.team ?? null,
    duration: replay.durationSec || shell.duration,
    loaded: true,
    you: focus?.name ?? shell.you,
    team,
    enemy,
    tracks,
    deaths,
    events,
  };
}

export function posAt(track: Key[] | undefined, t: number): [number, number] | null {
  if (!track?.length) return null;
  if (t <= track[0].t) return [track[0].x, track[0].y];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (t <= b.t) {
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
    }
  }
  const z = track[track.length - 1];
  return [z.x, z.y];
}

export function aliveAt(r: RoundData, t: number): { us: number; them: number } {
  const dead = (pool: Set<string>) => [...pool].filter((p) => r.deaths[p] != null && r.deaths[p] <= t).length;
  return { us: (r.team.size || 5) - dead(r.team), them: (r.enemy.size || 5) - dead(r.enemy) };
}

const TYPE_LABEL: Record<string, string> = {
  kill: 'Kill',
  smoke: 'Smoke',
  flash: 'Flash',
  he: 'HE grenade',
  molotov: 'Molotov',
  plant: 'Bomb planted',
  defuse: 'Bomb defused',
};

export function typeLabel(t: string) {
  return TYPE_LABEL[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Kill labels already name both players and the weapon; the rest get their thrower or planter. */
export function eventTitle(e: ReplayEvent): string {
  if (e.type === 'kill') return e.label;
  if (e.type === 'plant') return e.actor ? `${e.actor} planted the bomb` : 'Bomb planted';
  if (e.type === 'defuse') return e.actor ? `${e.actor} defused the bomb` : 'Bomb defused';
  return e.actor ? `${e.actor} threw a ${typeLabel(e.type).toLowerCase()}` : typeLabel(e.type);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'The API did not answer.';
}
