import type { MapId } from './maps';
import { DRILLS, FINDINGS, detectorOf, findingLabel, roundsOf, type Match } from './world';

export const COACH_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'pl', label: 'Polski' },
] as const;
export type CoachLanguage = (typeof COACH_LANGUAGES)[number]['id'];

export const ACROSS_SUGGESTIONS = [
  'What mistake do I repeat most across my matches?',
  'Where do I die most often, and what should I do instead?',
  'Show me a round where I traded well.',
];

export const ACROSS_STEPS = ['Listing your matches', 'Reading the findings', 'Comparing matches', 'Checking the knowledge base'];

const ACROSS: Record<string, string> = {
  [ACROSS_SUGGESTIONS[0]]:
    'Untraded deaths. They are in every match you have reviewed, most often in Connector on Mirage [M5:F3] [M3:F2] [M1:F1] and in A main or on Bridge on Anubis [M4:F1] [M4:F6]. Each time you were first in and the next teammate was more than a few seconds behind. Walk in with a second player, or wait for them before you peek.',
  [ACROSS_SUGGESTIONS[1]]:
    'Connector on Mirage: 9 deaths across three matches [M5:F3] [M5:F9] [M3:F2]. You push it alone after mid control and get caught between Jungle and Stairs. Go with a teammate and smoke Jungle first. On Anubis it is A main [M4:F1] [M4:F4], usually with grenades still in hand.',
  [ACROSS_SUGGESTIONS[2]]:
    'Round 9 on Mirage, 24 September: the Palace entry died and you traded within 2 seconds [M5:F5]. Also round 6 on 17 September in Top mid [M3:F3]. In both you were a second behind the entry, close enough to trade.',
};

export function answerAcross(q: string): { text: string; source: 'agent' | 'template' } {
  const hit = ACROSS[q];
  if (hit) return { text: hit, source: 'agent' };
  const s = q.toLowerCase();
  if (/(die|death|dying)/.test(s)) return { text: ACROSS[ACROSS_SUGGESTIONS[1]], source: 'agent' };
  if (/trade/.test(s)) return { text: ACROSS[ACROSS_SUGGESTIONS[2]], source: 'agent' };
  if (/(utility|smoke|flash|grenade|molotov)/.test(s))
    return {
      text: 'You keep dying with grenades in hand: in every match you reviewed [M5:F4] [M4:F4] [M3:F4] [M2:F4] [M1:F3]. Your flashes that do land sometimes hit teammates [M5:F8] [M3:F7]. Throw two grenades before the first peek.',
      source: 'agent',
    };
  return {
    text: 'Across your 5 matches the findings point the same way: you are first into a fight without a teammate close enough to trade [M5:F3] [M4:F1], and your utility often stays unused [M5:F4]. Your good rounds are the ones where you stayed close [M5:F5] [M3:F3].',
    source: 'template',
  };
}

export const ROUND_SUGGESTIONS = ['Why did I die here?', 'What should I have done instead?', 'Did my team trade me?'];

export type PlanItem = {
  detector: string;
  label: string;
  matchesWith: number;
  matchesTotal: number;
  per10Recent: number | null;
  per10Before: number | null;
  example: string | null;
  drillTitle: string;
  drillText: string;
};

function per10(matches: Match[], detector: string): number | null {
  const rounds = matches.reduce((s, m) => s + roundsOf(m), 0);
  if (!rounds) return null;
  const n = matches.reduce((s, m) => s + (FINDINGS[m.id] ?? []).filter((f) => detectorOf(f.template) === detector).length, 0);
  return Math.round((n / rounds) * 100) / 10;
}

/** Up to three mistakes that repeat across matches, with the latest example and a drill. */
export function planItems(done: Match[]): PlanItem[] {
  const oldest = [...done].sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? ''));
  const recent = oldest.slice(-3);
  const before = oldest.slice(0, -3);
  const counts = new Map<string, number>();
  for (const m of oldest) {
    const seen = new Set((FINDINGS[m.id] ?? []).filter((f) => f.kind === 'mistake').map((f) => detectorOf(f.template)));
    seen.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  }
  return [...counts.entries()]
    .filter(([d, n]) => n >= 2 && DRILLS[d])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d, n]) => {
      const latest = [...oldest].reverse().find((m) => (FINDINGS[m.id] ?? []).some((f) => detectorOf(f.template) === d));
      const f = latest ? (FINDINGS[latest.id] ?? []).find((x) => detectorOf(x.template) === d) : null;
      return {
        detector: d,
        label: findingLabel(d),
        matchesWith: n,
        matchesTotal: oldest.length,
        per10Recent: per10(recent, d),
        per10Before: before.length ? per10(before, d) : null,
        example: latest && f ? `${latest.ref}:${f.id}` : null,
        drillTitle: DRILLS[d].title,
        drillText: DRILLS[d].text,
      };
    });
}

export function planText(items: PlanItem[]): string {
  if (!items.length) return 'Nothing repeats yet. Review a second match and the plan fills in.';
  const parts = items.map((i, n) => {
    const cite = i.example ? ` [${i.example}]` : '';
    const lead = n === 0 ? 'Start with' : n === 1 ? 'Then' : 'Last,';
    return `${lead} ${i.label.toLowerCase()}: in ${i.matchesWith} of your ${i.matchesTotal} matches${cite}.`;
  });
  return `${parts.join(' ')} One drill for each; tick it when you have practised it.`;
}

export type ProgressRow = {
  template: string;
  label: string;
  kind: 'mistake' | 'good';
  counts: number[];
  per10Recent: number | null;
  per10Before: number | null;
};

export function progressRows(done: Match[]): ProgressRow[] {
  const oldest = [...done].sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? ''));
  const templates = new Map<string, 'mistake' | 'good'>();
  for (const m of oldest)
    for (const f of FINDINGS[m.id] ?? []) {
      const key = f.kind === 'strength' ? f.template : detectorOf(f.template);
      templates.set(key, f.kind === 'strength' ? 'good' : 'mistake');
    }
  const recent = oldest.slice(-3);
  const before = oldest.slice(0, -3);
  const count = (m: Match, key: string) =>
    (FINDINGS[m.id] ?? []).filter((f) => (f.kind === 'strength' ? f.template : detectorOf(f.template)) === key).length;
  const rate = (ms: Match[], key: string) => {
    const r = ms.reduce((s, m) => s + roundsOf(m), 0);
    return r ? Math.round((ms.reduce((s, m) => s + count(m, key), 0) / r) * 100) / 10 : null;
  };
  return [...templates.entries()]
    .map(([key, kind]) => ({
      template: key,
      label: findingLabel(key),
      kind,
      counts: oldest.map((m) => count(m, key)),
      per10Recent: rate(recent, key),
      per10Before: before.length ? rate(before, key) : null,
    }))
    .sort((a, b) => (a.kind === b.kind ? b.counts.reduce((s, c) => s + c, 0) - a.counts.reduce((s, c) => s + c, 0) : a.kind === 'mistake' ? -1 : 1));
}

export type DeathZone = { map: MapId; zone: string; deaths: number; examples: string[] };

export const DEATH_ZONES: DeathZone[] = [
  { map: 'de_mirage', zone: 'Connector', deaths: 9, examples: ['M5:F3', 'M5:F9', 'M3:F2', 'M1:F1'] },
  { map: 'de_mirage', zone: 'A ramp', deaths: 6, examples: ['M5:F1', 'M3:F1', 'M1:F3'] },
  { map: 'de_mirage', zone: 'Short', deaths: 5, examples: ['M5:F11', 'M3:F5'] },
  { map: 'de_mirage', zone: 'Palace', deaths: 3, examples: ['M3:F4'] },
  { map: 'de_mirage', zone: 'Jungle', deaths: 2, examples: [] },
  { map: 'de_anubis', zone: 'A main', deaths: 7, examples: ['M4:F1', 'M4:F4', 'M2:F3'] },
  { map: 'de_anubis', zone: 'Canal', deaths: 5, examples: ['M2:F2', 'M2:F4'] },
  { map: 'de_anubis', zone: 'Bridge', deaths: 3, examples: ['M4:F6'] },
  { map: 'de_anubis', zone: 'Mid', deaths: 3, examples: ['M4:F3', 'M2:F1'] },
  { map: 'de_anubis', zone: 'B connector', deaths: 2, examples: ['M2:F6'] },
];

export function trendText(recent: number | null, before: number | null): string {
  if (recent == null || before == null) return '';
  if (recent === before) return `${recent} per 10 rounds, as before`;
  return `${recent} per 10 rounds lately, ${before} before`;
}
