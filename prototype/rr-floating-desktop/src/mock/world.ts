import type { MapId } from './maps';

export const YOU = 'kestrel';
export const SERVED_MODEL = 'qwen3-14b-q4_k_m';

export const TEAM = ['kestrel', 'halvard', 'mirek_', 'oso', 'tamsin'];
export const ENEMY = ['vantablk', 'jorvik', 'deltaseven', 'rumbo', 'kiwi_ow'];

export type MatchStatus =
  | 'complete'
  | 'awaiting_player'
  | 'failed'
  | 'uploaded'
  | 'decompressing'
  | 'parsing'
  | 'normalizing'
  | 'detecting'
  | 'selecting'
  | 'recording'
  | 'explaining';

export type Match = {
  id: string;
  /** Short reference the coach cites across matches, oldest first. */
  ref: string | null;
  map: MapId;
  /** Our rounds first. */
  us: number;
  them: number;
  when: string;
  status: MatchStatus;
  playerName: string | null;
  model: string | null;
  versions: number;
  error?: string;
};

export const MATCHES: Match[] = [
  { id: 'm7', ref: null, map: 'de_mirage', us: 0, them: 0, when: '26 Sep, 21:40', status: 'failed', playerName: null, model: null, versions: 0, error: 'The demo ends at round 4; the file was cut short.' },
  { id: 'm6', ref: null, map: 'de_anubis', us: 13, them: 10, when: '25 Sep, 22:15', status: 'awaiting_player', playerName: null, model: null, versions: 0 },
  { id: 'm5', ref: 'M5', map: 'de_mirage', us: 13, them: 9, when: '24 Sep, 20:05', status: 'complete', playerName: YOU, model: SERVED_MODEL, versions: 1 },
  { id: 'm4', ref: 'M4', map: 'de_anubis', us: 11, them: 13, when: '21 Sep, 19:30', status: 'complete', playerName: YOU, model: SERVED_MODEL, versions: 0 },
  { id: 'm3', ref: 'M3', map: 'de_mirage', us: 13, them: 11, when: '17 Sep, 21:10', status: 'complete', playerName: YOU, model: null, versions: 0 },
  { id: 'm2', ref: 'M2', map: 'de_anubis', us: 8, them: 13, when: '12 Sep, 18:45', status: 'complete', playerName: YOU, model: SERVED_MODEL, versions: 2 },
  { id: 'm1', ref: 'M1', map: 'de_mirage', us: 13, them: 6, when: '8 Sep, 20:20', status: 'complete', playerName: YOU, model: SERVED_MODEL, versions: 0 },
];

export type FindingKind = 'mistake' | 'strength';

export type Finding = {
  id: string;
  matchId: string;
  template: string;
  kind: FindingKind;
  round: number;
  t: number;
  zone: string;
  summary: string;
};

const LABELS: Record<string, string> = {
  untraded_death: 'Untraded death',
  shot_while_moving: 'Shot while moving',
  unused_utility: 'Unused utility',
  dry_peek: 'Dry peek',
  team_flash: 'Team flash',
  opening_duel: 'Opening duel',
  economy_mismatch: 'Economy mismatch',
  'opening_duel.won': 'Opening duel won',
  'opening_duel.lost': 'Opening duel lost',
  'economy_mismatch.saved_on_buy': 'Saved on a buy round',
  'economy_mismatch.forced_on_save': 'Forced on a save round',
  late_rotation: 'Late rotation',
  repeated_death_zone: 'Same death spot',
  'good_plays.trade_kill': 'Trade kill',
  'good_plays.entry_kill': 'Entry kill',
  'good_plays.multi_kill': 'Multi-kill',
  'good_plays.clutch': 'Clutch',
  'good_plays.flash_assist': 'Flash assist',
  'good_plays.utility_damage': 'Utility damage',
};

export function findingLabel(template: string): string {
  return LABELS[template] ?? LABELS[template.split('.')[0]] ?? template.replace(/_/g, ' ');
}

export function detectorOf(template: string): string {
  return template.split('.')[0];
}

/** Deaths the Round tab and the radar show as the player's own. */
export const DEATH_TEMPLATES = new Set(['untraded_death', 'dry_peek', 'repeated_death_zone', 'opening_duel.lost', 'unused_utility']);

type Row = [template: string, round: number, t: number, zone: string, summary: string];

const RAW: Record<string, Row[]> = {
  m5: [
    ['dry_peek', 2, 41, 'A ramp', 'Peeked A ramp without a flash and died to the Tetris player.'],
    ['good_plays.entry_kill', 4, 18, 'Top mid', 'Entry kill on the Top mid player to open the mid take.'],
    ['untraded_death', 7, 34, 'Connector', 'Died in Connector 9 seconds after the team left mid; nobody was close enough to trade.'],
    ['unused_utility', 7, 29, 'Connector', 'Walked into Connector with a flash and a smoke and threw neither.'],
    ['good_plays.trade_kill', 9, 52, 'Palace', 'Traded the Palace entry within 2 seconds.'],
    ['late_rotation', 11, 65, 'Mid', 'Joined the B execute 14 seconds after the rest of the team.'],
    ['economy_mismatch.forced_on_save', 6, 12, 'T spawn', 'Bought a Galil and armour on a save round with $2,300.'],
    ['team_flash', 14, 23, 'Jungle', 'Flashed two teammates in Jungle while they held the A ramp push.'],
    ['repeated_death_zone', 16, 47, 'Connector', 'Third death in Connector this match, from the same angle.'],
    ['good_plays.clutch', 18, 72, 'A site', 'Won a 1v2 on A site with the bomb down.'],
    ['untraded_death', 20, 38, 'Short', 'Died on Short holding alone; the nearest teammate was in Market.'],
    ['good_plays.utility_damage', 21, 15, 'B apartments', 'Molotov at the bottom of B apartments did 61 damage and stopped the rush.'],
  ],
  m4: [
    ['untraded_death', 3, 27, 'A main', 'Died first in A main; the second player was 11 seconds behind.'],
    ['good_plays.entry_kill', 5, 40, 'Canal', 'Opened Canal with an entry kill on the water player.'],
    ['dry_peek', 8, 22, 'Mid', 'Peeked Mid doors without utility and lost the duel.'],
    ['unused_utility', 10, 58, 'A main', 'Died in A main holding a smoke and two flashes.'],
    ['team_flash', 14, 31, 'B CT', 'Flashed the B anchor as the push came through.'],
    ['untraded_death', 16, 45, 'Bridge', 'Held Bridge alone and died with no one in range to trade.'],
    ['good_plays.multi_kill', 19, 68, 'B site', 'Three kills on B site in the retake.'],
    ['economy_mismatch.forced_on_save', 22, 8, 'CT spawn', 'Forced a Famas on a save round with $2,050; the team saved.'],
    ['late_rotation', 23, 50, 'A site', 'Reached A site 12 seconds after the bomb was planted.'],
  ],
  m3: [
    ['dry_peek', 2, 36, 'A ramp', 'Peeked A ramp first without a flash from the team.'],
    ['untraded_death', 5, 33, 'Connector', 'Died in Connector alone after mid control.'],
    ['good_plays.trade_kill', 6, 21, 'Top mid', 'Traded the Top mid entry within a second.'],
    ['unused_utility', 9, 47, 'Palace', 'Died in Palace with a molotov and a flash unused.'],
    ['untraded_death', 15, 40, 'Short', 'Died on Short with the closest teammate at B site.'],
    ['good_plays.clutch', 17, 62, 'A site', 'Won a 1v1 on A site on the defuse.'],
    ['team_flash', 20, 26, 'Jungle', 'Flashed the Connector player during the A hit.'],
  ],
  m2: [
    ['opening_duel.lost', 1, 44, 'Mid', 'Lost the opening duel in Mid on the pistol round.'],
    ['untraded_death', 4, 30, 'Canal', 'Died in Canal first; the rest of the team was still in Mid.'],
    ['dry_peek', 6, 52, 'A main', 'Peeked A main into two CTs without a flash.'],
    ['unused_utility', 8, 25, 'Canal', 'Carried a smoke through Canal and died with it.'],
    ['good_plays.flash_assist', 11, 39, 'B main', 'Flash for the B main entry; two kills came off it.'],
    ['untraded_death', 14, 48, 'B connector', 'Held B connector alone and died without a trade.'],
    ['shot_while_moving', 17, 35, 'Top mid', 'Sprayed while strafing in Top mid; 2 of 14 bullets hit.'],
    ['late_rotation', 19, 70, 'B site', 'Arrived at B 10 seconds after the call.'],
  ],
  m1: [
    ['untraded_death', 3, 31, 'Connector', 'Died in Connector before the team reached Jungle.'],
    ['good_plays.entry_kill', 4, 19, 'Top mid', 'Entry kill in Top mid through the Window smoke.'],
    ['unused_utility', 7, 45, 'A ramp', 'Died at the top of A ramp with two flashes.'],
    ['good_plays.multi_kill', 10, 58, 'A site', 'Two kills on A site after the plant.'],
    ['shot_while_moving', 14, 34, 'Window', 'Shot while moving from Window; the AWP shot missed.'],
    ['good_plays.trade_kill', 16, 27, 'Jungle', 'Traded the Jungle player from Connector stairs.'],
  ],
};

export const FINDINGS: Record<string, Finding[]> = Object.fromEntries(
  Object.entries(RAW).map(([matchId, rows]) => [
    matchId,
    rows.map(([template, round, t, zone, summary], i) => ({
      id: `F${i + 1}`,
      matchId,
      template,
      kind: template.startsWith('good_plays') || template === 'opening_duel.won' ? 'strength' : 'mistake',
      round,
      t,
      zone,
      summary,
    })) as Finding[],
  ]),
);

export type Moment = {
  id: string;
  findingIds: string[];
  round: number;
  t0: number;
  t1: number;
  pickedBecause: string;
  source: 'agent' | 'ranker';
  clip: 'ready' | 'recording';
};

const PICKS: Record<string, [ids: string[], because: string][]> = {
  m5: [
    [['F3', 'F4'], 'the death that decided the round: 4v5 from there, and the utility was still in hand'],
    [['F1'], 'the first of your dry peeks, and the round it happened in was lost'],
    [['F9'], 'the same Connector angle again, the third time this match'],
    [['F11'], 'a lone hold on Short with no trade, the most common way you died on CT'],
    [['F10'], 'your best round: a 1v2 on A you should see again'],
    [['F8'], 'two teammates blinded just as A ramp pushed'],
  ],
};

const REASONS = [
  'the mistake that cost the most in this match',
  'it repeats a habit from your other matches',
  'the round turned on it',
  'the same kind of death as moment 1, in another spot',
  'a small change here saves the round',
];

function autoPicks(matchId: string): [string[], string][] {
  const fs = FINDINGS[matchId] ?? [];
  const mistakes = fs.filter((f) => f.kind === 'mistake').slice(0, 5);
  const good = fs.find((f) => f.kind === 'strength');
  const out: [string[], string][] = mistakes.map((f, i) => [[f.id], REASONS[i]]);
  if (good) out.splice(Math.min(3, out.length), 0, [[good.id], 'a round you played well, to compare with']);
  return out.slice(0, 6);
}

export function momentsFor(matchId: string): Moment[] {
  const fs = FINDINGS[matchId] ?? [];
  const picks = PICKS[matchId] ?? autoPicks(matchId);
  const source = matchId === 'm3' ? 'ranker' : 'agent';
  return picks.map(([ids, because], i) => {
    const lead = fs.find((f) => f.id === ids[0])!;
    return {
      id: `m${i + 1}`,
      findingIds: ids,
      round: lead.round,
      t0: Math.max(0, lead.t - 8),
      t1: lead.t + 6,
      pickedBecause: because,
      source,
      clip: matchId === 'm5' && i === 5 ? 'recording' : 'ready',
    };
  });
}

export type Passage = {
  id: string;
  map: MapId;
  title: string;
  source: string;
  side: 'T' | 'CT' | 'any';
  zones: string[];
  text: string;
  cited: number;
};

export const PASSAGES: Passage[] = [
  { id: 'K1', map: 'de_mirage', title: 'Connector after mid control', source: 'Map notes', side: 'T', zones: ['Connector', 'Jungle', 'Mid'], cited: 9, text: 'Push Connector as a pair. The first player clears the Jungle box, the second holds the Stairs angle; one player alone is caught between Jungle and Stairs and cannot be traded.' },
  { id: 'K2', map: 'de_mirage', title: 'Window smoke from T spawn', source: 'Liquipedia, Mirage', side: 'T', zones: ['Window', 'Top mid', 'Mid'], cited: 4, text: 'The Window smoke covers the sniper spot so the T side can cross Top mid. Throw it with the push, not before it, or it fades as you arrive.' },
  { id: 'K3', map: 'de_mirage', title: 'A ramp entries', source: 'Map notes', side: 'T', zones: ['A ramp', 'Tetris', 'A site'], cited: 6, text: 'Tetris and the Stairs off-angle both see A ramp. Flash over the ramp wall before the first peek, or have a teammate ready to trade from the top of the ramp.' },
  { id: 'K4', map: 'de_mirage', title: 'Palace timing', source: 'Liquipedia, Mirage', side: 'T', zones: ['Palace', 'A site'], cited: 2, text: 'Palace is the slow route. Come out as the ramp group flashes so the site defender has to watch both entries at once.' },
  { id: 'K5', map: 'de_mirage', title: 'Holding Short on CT', source: 'Map notes', side: 'CT', zones: ['Short', 'Market', 'B site'], cited: 5, text: 'Short is a two-player spot or a fall-back spot. Alone, hold from the Market door so the B player can rotate and trade you.' },
  { id: 'K6', map: 'de_mirage', title: 'Jungle falls back to Connector', source: 'Map notes', side: 'CT', zones: ['Jungle', 'Connector', 'A site'], cited: 3, text: 'When mid is lost the Jungle player drops to the Connector stairs and waits for the A anchor instead of re-peeking.' },
  { id: 'K7', map: 'de_mirage', title: 'Flashing for a teammate', source: 'Map notes', side: 'any', zones: ['Jungle', 'A ramp', 'Palace'], cited: 3, text: 'Call the flash before you throw it and throw it over the teammate, not past them. The flash that blinds a friend is usually thrown from behind them.' },
  { id: 'K8', map: 'de_mirage', title: 'Save rounds', source: 'Liquipedia, Economy', side: 'any', zones: [], cited: 2, text: 'After a lost buy round with under $2,500 each, save together. One player forcing leaves the next full buy short.' },
  { id: 'K9', map: 'de_mirage', title: 'B apartments molotov', source: 'Map notes', side: 'CT', zones: ['B apartments', 'B site'], cited: 1, text: 'A molotov at the bottom of B apartments holds a rush for several seconds. Throw it on the first footsteps, not after the flash.' },
  { id: 'K10', map: 'de_mirage', title: 'Retaking A', source: 'Liquipedia, Mirage', side: 'CT', zones: ['A site', 'A CT', 'Jungle'], cited: 2, text: 'Retake A from CT and Jungle at the same time. One entry at a time lets the planted T side trade each of you.' },
  { id: 'K11', map: 'de_mirage', title: 'Mid control', source: 'Liquipedia, Mirage', side: 'any', zones: ['Mid', 'Top mid', 'Short', 'Window'], cited: 4, text: 'Mid connects both sites. Whoever holds Top mid and Window decides how fast the other side can rotate.' },
  { id: 'K12', map: 'de_mirage', title: 'B site default', source: 'Map notes', side: 'CT', zones: ['B site', 'Market', 'B apartments'], cited: 1, text: 'The B anchor plays off the Market door or the van. Call early, fall back to Market and wait for the rotation.' },
  { id: 'K13', map: 'de_anubis', title: 'Canal before water', source: 'Map notes', side: 'T', zones: ['Canal', 'A water', 'A main'], cited: 4, text: 'Clear Canal before walking the water. The Bridge player sees the whole water walk from above.' },
  { id: 'K14', map: 'de_anubis', title: 'A main takes', source: 'Liquipedia, Anubis', side: 'T', zones: ['A main', 'A site'], cited: 5, text: 'Go through A main with at least two players and the smoke for the CT side of the site. Alone, the first peek is free for the defender.' },
  { id: 'K15', map: 'de_anubis', title: 'Mid doors', source: 'Map notes', side: 'any', zones: ['Mid', 'Top mid', 'Bridge'], cited: 2, text: 'Mid doors are a flash-and-peek spot. A dry peek there meets the CT who already holds the angle.' },
  { id: 'K16', map: 'de_anubis', title: 'B long pace', source: 'Map notes', side: 'T', zones: ['B long', 'B main'], cited: 1, text: 'B long is long and open. Walk it together and save the flashes for B main, not the long itself.' },
  { id: 'K17', map: 'de_anubis', title: 'B connector rotation', source: 'Liquipedia, Anubis', side: 'CT', zones: ['B connector', 'B CT', 'B site'], cited: 2, text: 'B connector is the fast rotation between mid and B. Hold it with the B anchor in range, or fall back.' },
  { id: 'K18', map: 'de_anubis', title: 'Holding Bridge', source: 'Map notes', side: 'CT', zones: ['Bridge', 'Top mid', 'A connector'], cited: 3, text: 'Bridge is a crossfire spot with A connector. Held alone, nobody can trade you.' },
  { id: 'K19', map: 'de_anubis', title: 'CT to A', source: 'Map notes', side: 'CT', zones: ['CT to A', 'A site'], cited: 1, text: 'The CT to A rotation is short. Rotate on the first call; waiting for the plant makes it a retake.' },
  { id: 'K20', map: 'de_anubis', title: 'B retakes', source: 'Liquipedia, Anubis', side: 'CT', zones: ['B site', 'B CT'], cited: 1, text: 'Retake B from CT and connector together. Utility first: a smoke on the planted bomb splits the T side.' },
];

export function passage(id: string): Passage | undefined {
  return PASSAGES.find((p) => p.id === id);
}

export function kFor(map: MapId, zone: string, side: 'T' | 'CT'): string | undefined {
  const own = PASSAGES.filter((p) => p.map === map && p.zones.includes(zone));
  return (own.find((p) => p.side === side) ?? own.find((p) => p.side === 'any') ?? own[0])?.id;
}

const ADVICE: Record<string, string> = {
  untraded_death: 'The next teammate was too far away to trade. Go in as a pair or wait for the second player.',
  unused_utility: 'Both grenades would have covered the angle you died to. Throw them before the first peek.',
  dry_peek: 'A flash from you or a teammate first would have won the first shot.',
  team_flash: 'Call the flash and throw it over your teammates, not past them.',
  late_rotation: 'The call came early enough; the rotation started late.',
  repeated_death_zone: 'Same angle, same result. Try a different way into this spot, or a smoke first.',
  shot_while_moving: 'Stop before you shoot. Your first bullet only lands when you stand still.',
  'opening_duel.lost': 'The first duel sets the round. Take it with a flash or leave it to the entry.',
  economy_mismatch: 'Save together; one forced buy leaves the next full buy short.',
  good_plays: 'Keep this: you were in range of a teammate and took the fight on your terms.',
};

export function adviceFor(template: string): string {
  return ADVICE[template] ?? ADVICE[detectorOf(template)] ?? '';
}

export function sideOf(round: number): 'T' | 'CT' {
  return round <= 12 ? 'T' : 'CT';
}

const HAND: Record<string, string> = {
  'm5:m1':
    'You went into Connector alone at [t:26.0] while the team was still at Top mid, and died at [t:34.0] [F3]. The flash and the smoke you carried stayed in hand [F4]. Connector needs two: one clears the Jungle box, one holds Stairs [K1]. From here the round was 4v5 and the A take stalled.',
  'm5:m2':
    'You peeked A ramp at [t:41.0] with no flash from you or the ramp group [F1]. Tetris sees that peek first [K3]. Pop a flash over the ramp wall, or let the teammate behind you trade from the top.',
  'm5:m3':
    'Round 16, Connector again, and the same Stairs angle as round 7 [F9]. You re-peeked at [t:45.5] without changing the timing. If Connector keeps costing you, take mid-to-Jungle with a smoke first [K1] [K6].',
  'm5:m4':
    'On CT you held Short alone and died at [t:38.0] [F11]. Your nearest teammate was in Market, too far to trade. Alone, play Short from the Market door so B can rotate to you [K5].',
  'm5:m5':
    'The bomb was down on A and you were 1v2. You stayed on the CT side of the site, let them come to you, and won both fights by [t:72.0] [F10]. This is what your Connector rounds are missing: patience and a teammate-sized gap.',
  'm5:m6':
    'The flash at [t:23.0] went past Jungle and blinded both teammates holding the A ramp push [F8]. Throw it over them, and call it first [K7].',
};

export function explanation(match: Match, m: Moment): string {
  const hand = HAND[`${match.id}:${m.id}`];
  if (hand) return hand;
  const f = (FINDINGS[match.id] ?? []).find((x) => x.id === m.findingIds[0])!;
  const k = kFor(match.map, f.zone, sideOf(f.round));
  const advice = ADVICE[f.template] ?? ADVICE[detectorOf(f.template)] ?? '';
  return `${f.summary} [${f.id}] It happened at [t:${f.t.toFixed(1)}] in ${f.zone}. ${advice}${k ? ` [${k}]` : ''}`;
}

export function summary(match: Match): string {
  if (match.id === 'm5')
    return 'Your T half was decided in Connector: you died there three times [F3] [F9], and twice nobody could trade. The CT half was steadier, with the round 18 clutch [F10]. Start with moment 1.';
  const fs = FINDINGS[match.id] ?? [];
  const mistakes = fs.filter((f) => f.kind === 'mistake');
  const good = fs.find((f) => f.kind === 'strength');
  const top = mistakes[0];
  return `${mistakes.length} mistakes and ${fs.length - mistakes.length} good plays. The one that cost most was in ${top.zone} in round ${top.round} [${top.id}].${good ? ` Keep what you did in round ${good.round} [${good.id}].` : ''}`;
}

export type Drill = { detector: string; title: string; text: string };

export const DRILLS: Record<string, Drill> = {
  untraded_death: { detector: 'untraded_death', title: 'Trade distance', text: 'On a retake server, play a whole session within a second of a teammate. After each death, check whether they could have traded you.' },
  unused_utility: { detector: 'unused_utility', title: 'Two grenades first', text: 'Before every execute in your next five matches, throw two grenades before the first peek. Buy them even if the rifle is lighter.' },
  dry_peek: { detector: 'dry_peek', title: 'Flash, then peek', text: 'On a workshop aim map, pop-flash yourself round three common corners until the peek lands within a second of the flash.' },
  team_flash: { detector: 'team_flash', title: 'Over, not past', text: 'In a private server, practise the Jungle and A ramp flashes with a teammate standing in front. Call each one out loud.' },
  late_rotation: { detector: 'late_rotation', title: 'Move on the call', text: 'For one match, start moving the moment a rotation is called, before you ask for the reason.' },
};

export function matchById(id: string, list: Match[] = MATCHES): Match | undefined {
  return list.find((m) => m.id === id);
}

export function matchByRef(ref: string, list: Match[] = MATCHES): Match | undefined {
  return list.find((m) => m.ref === ref);
}

export function mapName(map: MapId): string {
  return map === 'de_mirage' ? 'Mirage' : 'Anubis';
}

export function roundsOf(m: Match): number {
  return m.us + m.them;
}
