import { MAPS, zoneCentre, type MapId, type Pt } from './maps';
import { DEATH_TEMPLATES, ENEMY, FINDINGS, TEAM, YOU, roundsOf, sideOf, type Finding, type Match } from './world';

export type Side = 'T' | 'CT';
export type Key = { t: number; x: number; y: number };
export type EventType = 'kill' | 'smoke' | 'flash' | 'he' | 'molotov' | 'plant' | 'defuse';

export type ReplayEvent = {
  id: string;
  t: number;
  type: EventType;
  actor: string;
  victim?: string;
  weapon?: string;
  x: number;
  y: number;
};

export type RoundStats = {
  won: boolean;
  side: Side;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  utilityDamage: number;
  utilityThrown: number;
  enemiesFlashed: number;
  teammatesFlashed: number;
  openingKill: boolean;
  openingDeath: boolean;
  tradeKills: number;
  survived: boolean;
  timeAliveS: number | null;
  deathTraded: boolean | null;
  moneyStart: number;
  equipValue: number;
};

export type RoundData = {
  number: number;
  won: boolean;
  side: Side;
  winner: Side;
  reason: string;
  duration: number;
  tracks: Record<string, Key[]>;
  deaths: Record<string, number>;
  events: ReplayEvent[];
  stats: RoundStats;
  findings: Finding[];
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const wonCache = new Map<string, boolean[]>();

/** Which rounds we won, consistent with the score and with the findings (clutches are won). */
export function wonRounds(match: Match): boolean[] {
  const hit = wonCache.get(match.id);
  if (hit) return hit;
  const n = roundsOf(match);
  const rnd = mulberry(hash(match.id));
  const fs = FINDINGS[match.id] ?? [];
  const mustWin = new Set(fs.filter((f) => /clutch|multi_kill/.test(f.template)).map((f) => f.round));
  const mustLose = new Set(fs.filter((f) => f.template === 'untraded_death' || f.template === 'repeated_death_zone').map((f) => f.round));
  const order = Array.from({ length: n }, (_, i) => i + 1).sort(() => rnd() - 0.5);
  const won = new Array<boolean>(n + 1).fill(false);
  let left = match.us;
  for (const r of [...mustWin]) if (left > 0) (won[r] = true), left--;
  for (const r of order) {
    if (left === 0) break;
    if (won[r] || mustLose.has(r)) continue;
    won[r] = true;
    left--;
  }
  for (const r of order) {
    if (left === 0) break;
    if (!won[r]) (won[r] = true), left--;
  }
  const out = won.slice(1);
  wonCache.set(match.id, out);
  return out;
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function walk(points: Pt[], start: number, speed: number, end: number): Key[] {
  const keys: Key[] = [{ t: 0, x: points[0][0], y: points[0][1] }];
  let t = start;
  keys.push({ t, x: points[0][0], y: points[0][1] });
  for (let i = 1; i < points.length; i++) {
    t += dist(points[i - 1], points[i]) / speed;
    keys.push({ t, x: points[i][0], y: points[i][1] });
  }
  const last = points[points.length - 1];
  if (t < end) keys.push({ t: end, x: last[0] + 6, y: last[1] - 4 });
  return keys;
}

export function posAt(track: Key[], t: number): Pt {
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

function jitter(p: Pt, rnd: () => number, r = 18): Pt {
  return [p[0] + (rnd() - 0.5) * r, p[1] + (rnd() - 0.5) * r];
}

function routeTo(map: MapId, side: Side, zone: string): string[] {
  const meta = MAPS[map];
  const routes = side === 'T' ? meta.tRoutes : meta.ctRoutes;
  const hit = routes.find((r) => r.includes(zone));
  if (hit) return hit.slice(0, hit.indexOf(zone) + 1);
  return [routes[0][0], routes[0][1], zone];
}

const cache = new Map<string, RoundData>();

export function roundData(match: Match, number: number): RoundData {
  const key = `${match.id}:${number}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rnd = mulberry(hash(key));
  const map = match.map;
  const meta = MAPS[map];
  const side = sideOf(number);
  const other: Side = side === 'T' ? 'CT' : 'T';
  const won = wonRounds(match)[number - 1];
  const winner = won ? side : other;
  const findings = (FINDINGS[match.id] ?? []).filter((f) => f.round === number).sort((a, b) => a.t - b.t);
  const latest = findings.reduce((m, f) => Math.max(m, f.t), 0);
  const duration = Math.round(Math.max(58 + rnd() * 45, latest + 14));
  const pistol = number === 1 || number === 13;
  const reason =
    winner === 'T' ? (rnd() < 0.55 ? 'Bomb exploded' : 'Elimination') : rnd() < 0.5 ? 'Elimination' : rnd() < 0.6 ? 'Bomb defused' : 'Time ran out';

  const sideOfPlayer = (name: string): Side => (TEAM.includes(name) ? side : other);
  const tracks: Record<string, Key[]> = {};
  const everyone = [...TEAM, ...ENEMY];
  const tRoutes = [...meta.tRoutes].sort(() => rnd() - 0.5);
  const ctRoutes = [...meta.ctRoutes].sort(() => rnd() - 0.5);

  const anchor = findings.length ? findings[findings.length - 1] : null;
  everyone.forEach((name, i) => {
    const s = sideOfPlayer(name);
    if (name === YOU && anchor) {
      const path = routeTo(map, s, anchor.zone).map((z) => jitter(zoneCentre(map, z), rnd, z.includes('spawn') ? 30 : 16));
      const length = path.slice(1).reduce((sum, p, j) => sum + dist(path[j], p), 0);
      const speed = Math.min(70, Math.max(14, length / Math.max(4, anchor.t - 3)));
      tracks[name] = walk(path, 1, speed, duration);
      return;
    }
    const route = (s === 'T' ? tRoutes : ctRoutes)[i % 5];
    const path = route.map((z) => jitter(zoneCentre(map, z), rnd, z.includes('spawn') ? 30 : 22));
    tracks[name] = walk(path, rnd() * 3, 24 + rnd() * 14, duration);
  });

  const deaths: Record<string, number> = {};
  const events: ReplayEvent[] = [];
  const weapon = (who: string) => {
    if (pistol) return sideOfPlayer(who) === 'T' ? 'Glock-18' : 'USP-S';
    if (who === 'jorvik' || who === 'mirek_') return 'AWP';
    return sideOfPlayer(who) === 'T' ? 'AK-47' : 'M4A1-S';
  };
  const alive = (who: string, t: number) => deaths[who] == null || deaths[who] > t;
  const kill = (actor: string, victim: string, t: number) => {
    if (!alive(victim, t) || !alive(actor, t)) return false;
    deaths[victim] = t;
    const [x, y] = posAt(tracks[victim], t);
    events.push({ id: '', t, type: 'kill', actor, victim, weapon: weapon(actor), x, y });
    return true;
  };
  const pickAlive = (pool: string[], t: number, not?: string) => {
    const opts = pool.filter((p) => p !== not && alive(p, t));
    return opts.length ? opts[Math.floor(rnd() * opts.length)] : null;
  };

  for (const f of findings) {
    if (f.kind === 'strength') {
      const times = /multi_kill/.test(f.template) ? [f.t - 4, f.t - 2, f.t] : /clutch/.test(f.template) ? [f.t - 7, f.t] : [f.t];
      if (/flash_assist|utility_damage/.test(f.template)) continue;
      for (const t of times) {
        const v = pickAlive(ENEMY, t);
        if (v) kill(YOU, v, t);
      }
    }
  }
  const myDeath = findings.filter((f) => DEATH_TEMPLATES.has(f.template)).reduce<number | null>((m, f) => Math.max(m ?? 0, f.t), null);
  if (myDeath != null) {
    const k = pickAlive(ENEMY, myDeath);
    if (k) kill(k, YOU, myDeath);
  }

  const loserTeam = won ? ENEMY : TEAM;
  const winnerTeam = won ? TEAM : ENEMY;
  const loserDeaths = reason === 'Elimination' ? 5 : 2 + Math.floor(rnd() * 3);
  const winnerDeaths = 1 + Math.floor(rnd() * 3);
  const times = Array.from({ length: 10 }, () => 12 + rnd() * (duration - 18)).sort((a, b) => a - b);
  let ti = 0;
  const kills = (pool: string[], target: number, killers: string[]) => {
    while (pool.filter((p) => !alive(p, duration)).length < target && ti < times.length) {
      const t = Math.round(times[ti++] * 10) / 10;
      const v = pickAlive(pool.filter((p) => p !== YOU || findings.length === 0), t);
      const k = pickAlive(killers, t, YOU);
      if (!v || !k) break;
      kill(k, v, t);
    }
  };
  kills(winnerTeam, winnerDeaths, loserTeam);
  kills(loserTeam, Math.min(5, loserDeaths), winnerTeam);

  const plantT = Math.round(duration * (0.55 + rnd() * 0.15));
  if (reason === 'Bomb exploded' || reason === 'Bomb defused') {
    const tSide = side === 'T' ? TEAM : ENEMY;
    const planter = pickAlive(tSide, plantT) ?? tSide[0];
    const site = rnd() < 0.5 ? 'A site' : 'B site';
    const [x, y] = zoneCentre(map, site);
    events.push({ id: '', t: plantT, type: 'plant', actor: planter, x, y });
    if (reason === 'Bomb defused') {
      const ctSide = side === 'CT' ? TEAM : ENEMY;
      const d = pickAlive(ctSide, duration - 3) ?? ctSide[0];
      events.push({ id: '', t: duration - 3, type: 'defuse', actor: d, x: x + 8, y: y + 6 });
    }
  }

  const myFlash = findings.find((f) => f.template === 'team_flash');
  const myMolly = findings.find((f) => f.template === 'good_plays.utility_damage');
  const noUtil = findings.some((f) => f.template === 'unused_utility');
  const nades: EventType[] = ['smoke', 'flash', 'he', 'molotov'];
  for (const name of everyone) {
    if (name === YOU && noUtil) continue;
    const count = name === YOU ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const limit = Math.min(deaths[name] ?? duration, duration) - 2;
      if (limit < 8) break;
      const t = Math.round((6 + rnd() * (limit - 6)) * 10) / 10;
      const [x, y] = jitter(posAt(tracks[name], t + 2), rnd, 70);
      events.push({ id: '', t, type: nades[Math.floor(rnd() * 4)], actor: name, x, y });
    }
  }
  if (myFlash) {
    const [x, y] = posAt(tracks[YOU], myFlash.t);
    events.push({ id: '', t: myFlash.t, type: 'flash', actor: YOU, x: x - 30, y: y + 10 });
  }
  if (myMolly) {
    const [x, y] = zoneCentre(map, myMolly.zone);
    events.push({ id: '', t: myMolly.t, type: 'molotov', actor: YOU, x, y });
  }

  events.sort((a, b) => a.t - b.t);
  events.forEach((e, i) => (e.id = `e${i + 1}`));

  for (const [name, t] of Object.entries(deaths)) {
    const tr = tracks[name];
    const [x, y] = posAt(tr, t);
    tracks[name] = [...tr.filter((k) => k.t < t), { t, x, y }];
  }

  const myKills = events.filter((e) => e.type === 'kill' && e.actor === YOU);
  const firstKill = events.find((e) => e.type === 'kill');
  const killedBy = events.find((e) => e.type === 'kill' && e.victim === YOU)?.actor;
  const traded =
    deaths[YOU] == null
      ? null
      : findings.some((f) => f.template === 'untraded_death')
        ? false
        : killedBy != null && deaths[killedBy] != null && deaths[killedBy] - deaths[YOU] <= 5;
  const econ = findings.find((f) => f.template.startsWith('economy_mismatch'));
  const moneyStart = pistol ? 800 : econ ? 2300 : Math.round((2800 + rnd() * 4200) / 50) * 50;
  const equipValue = pistol ? 850 : econ ? 3100 : Math.round((4400 + rnd() * 1300) / 50) * 50;
  const stats: RoundStats = {
    won,
    side,
    kills: myKills.length,
    deaths: deaths[YOU] != null ? 1 : 0,
    assists: rnd() < 0.3 ? 1 : 0,
    damage: Math.min(500, myKills.length * 100 + Math.round(rnd() * 70)),
    utilityDamage: myMolly ? 61 : Math.round(rnd() * 25),
    utilityThrown: events.filter((e) => e.actor === YOU && e.type !== 'kill' && e.type !== 'plant' && e.type !== 'defuse').length,
    enemiesFlashed: myFlash ? 0 : Math.floor(rnd() * 3),
    teammatesFlashed: myFlash ? 2 : 0,
    openingKill: firstKill?.actor === YOU,
    openingDeath: firstKill?.victim === YOU,
    tradeKills: findings.filter((f) => f.template === 'good_plays.trade_kill').length,
    survived: deaths[YOU] == null,
    timeAliveS: deaths[YOU] ?? null,
    deathTraded: traded,
    moneyStart,
    equipValue,
  };

  const data: RoundData = { number, won, side, winner, reason, duration, tracks, deaths, events, stats, findings };
  cache.set(key, data);
  return data;
}

export function aliveAt(r: RoundData, t: number): { us: number; them: number } {
  const dead = (pool: string[]) => pool.filter((p) => r.deaths[p] != null && r.deaths[p] <= t).length;
  return { us: 5 - dead(TEAM), them: 5 - dead(ENEMY) };
}

export function isTeam(name: string) {
  return TEAM.includes(name);
}

const TYPE_LABEL: Record<EventType, string> = {
  kill: 'Kill',
  smoke: 'Smoke',
  flash: 'Flash',
  he: 'HE grenade',
  molotov: 'Molotov',
  plant: 'Bomb planted',
  defuse: 'Bomb defused',
};

export function typeLabel(t: EventType) {
  return TYPE_LABEL[t];
}

export function eventTitle(e: ReplayEvent): string {
  if (e.type === 'kill') return `${e.actor} killed ${e.victim} (${e.weapon})`;
  if (e.type === 'plant') return `${e.actor} planted the bomb`;
  if (e.type === 'defuse') return `${e.actor} defused the bomb`;
  return `${e.actor} threw a ${TYPE_LABEL[e.type].toLowerCase()}`;
}
