import { FINDINGS, MATCHES, SERVED_MODEL, explanation, momentsFor } from './world';

export const JOBS = [
  { id: '', label: 'All jobs' },
  { id: 'select_moments', label: 'Moment selection' },
  { id: 'explain', label: 'Explanations' },
  { id: 'summary', label: 'Match summary' },
  { id: 'wrapup', label: 'Wrap-up' },
  { id: 'ask', label: 'Ask tab' },
  { id: 'ask_across', label: 'Coach page' },
  { id: 'practice_plan', label: 'Practice plan' },
];

export const SOURCES = [
  { id: '', label: 'Any result' },
  { id: 'agent', label: 'Model, verified' },
  { id: 'template', label: 'Fell back to templates' },
  { id: 'ranker', label: 'Fell back to the ranker' },
];

export const BIG_MODEL = 'qwen3-32b-q4_k_m';

export type Step = { tool: string; args: Record<string, unknown>; ms: number; resultBytes: number; error?: string };

export type Run = {
  id: string;
  ts: Date;
  job: string;
  lang: string | null;
  model: string | null;
  toolCalls: number;
  latencyS: number | null;
  verifierOk: boolean | null;
  repaired: boolean;
  source: 'agent' | 'template' | 'ranker';
  matchId: string | null;
  steps: Step[];
  knowledgeIds: string[];
  verifierErrors: string[];
  output: string | null;
  fallback: string | null;
  prompt: string;
};

export function jobLabel(job: string) {
  return JOBS.find((j) => j.id === job)?.label ?? job;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const TOOLS: Record<string, string[]> = {
  select_moments: ['list_findings', 'list_rounds', 'get_round_stats', 'select_moments'],
  explain: ['get_finding', 'get_round_timeline', 'get_player_state', 'search_knowledge'],
  summary: ['get_match_totals', 'list_findings'],
  wrapup: ['list_findings', 'get_player_history'],
  ask: ['get_round_timeline', 'get_round_stats', 'search_knowledge'],
  ask_across: ['list_matches', 'get_player_history', 'find_moments', 'search_knowledge'],
  practice_plan: ['get_player_history', 'list_findings', 'search_knowledge'],
};

function build(): Run[] {
  const r = rng(42);
  const out: Run[] = [];
  const jobs = ['explain', 'explain', 'explain', 'select_moments', 'summary', 'ask', 'ask_across', 'wrapup', 'practice_plan'];
  const done = MATCHES.filter((m) => m.status === 'complete');
  const start = new Date('2026-09-26T21:30:00Z').getTime();
  for (let i = 0; i < 34; i++) {
    const job = jobs[Math.floor(r() * jobs.length)];
    const match = job === 'ask_across' || job === 'practice_plan' ? null : done[Math.floor(r() * done.length)];
    const model = match?.id === 'm3' ? null : r() < 0.25 ? BIG_MODEL : SERVED_MODEL;
    const roll = r();
    const source: Run['source'] = !model ? (job === 'select_moments' ? 'ranker' : 'template') : roll < 0.12 ? (job === 'select_moments' ? 'ranker' : 'template') : 'agent';
    const verifierOk = !model ? null : source === 'agent';
    const repaired = verifierOk === true && r() < 0.18;
    const tools = model ? TOOLS[job] : [];
    const moment = match ? momentsFor(match.id)[Math.floor(r() * 4)] : null;
    const steps: Step[] = tools.map((tool) => ({
      tool,
      args:
        tool === 'search_knowledge'
          ? { query: 'Connector trade', map: match?.map ?? 'de_mirage', k: 4 }
          : tool === 'get_finding'
            ? { match_id: match?.id, finding_id: moment?.findingIds[0] }
            : tool === 'get_round_timeline' || tool === 'get_round_stats' || tool === 'get_player_state'
              ? { match_id: match?.id, round: moment?.round ?? 7, player: 'kestrel' }
              : match
                ? { match_id: match.id }
                : { player: 'kestrel' },
      ms: Math.round(8 + r() * 90),
      resultBytes: Math.round(400 + r() * 5200),
      error: r() < 0.04 ? 'timeout after 5 s' : undefined,
    }));
    const text = match && moment ? explanation(match, moment) : 'Untraded deaths are in every match you reviewed [M5:F3] [M4:F1].';
    const errors =
      verifierOk === false
        ? [
            `Claims 2 kills in round ${moment?.round ?? 7}; RoundStats has ${moment ? 0 : 1}.`,
            `Cites F${(FINDINGS[match?.id ?? 'm5']?.length ?? 9) + 3}, which is not a finding of this match.`,
          ].slice(0, 1 + Math.floor(r() * 2))
        : [];
    out.push({
      id: `run_${(1000 + i).toString(36)}`,
      ts: new Date(start - i * (1 + r() * 9) * 3600_000),
      job,
      lang: job === 'ask' || job === 'ask_across' ? (r() < 0.3 ? 'pl' : 'en') : null,
      model,
      toolCalls: steps.length,
      latencyS: model ? Math.round((2.5 + r() * (model === BIG_MODEL ? 22 : 11)) * 10) / 10 : null,
      verifierOk,
      repaired,
      source,
      matchId: match?.id ?? null,
      steps,
      knowledgeIds: tools.includes('search_knowledge') ? ['K1', 'K6', 'K3'].slice(0, 1 + Math.floor(r() * 3)) : [],
      verifierErrors: errors,
      output: model ? (verifierOk === false ? text.replace('died at', 'got two kills and died at') : text) : null,
      fallback: source !== 'agent' ? (match ? FINDINGS[match.id][0].summary + ` [F1]` : 'Written from the findings.') : null,
      prompt: `System: explain_moment.v3 (en). You are a CS2 coach. Use only numbers from the tools. Cite every claim with [F#], [t:s] or [K#].\n\nUser: Explain ${moment ? `moment ${moment.id}, round ${moment.round}` : 'the practice plan'} for kestrel on ${match?.map ?? 'every map'}.\n\nTool results: ${steps.map((s) => s.tool).join(', ') || 'none'}.`,
    });
  }
  return out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
}

export const RUNS: Run[] = build();

export type ABPair = { id: string; question: string; a: { model: string; text: string }; b: { model: string; text: string } };

export const AB_PAIRS: ABPair[] = [
  {
    id: 'ab1',
    question: 'Why did I die here? (Mirage, round 7)',
    a: { model: SERVED_MODEL, text: 'You went into Connector alone and died at [t:34.0] [F3]. Nobody was close enough to trade. Go in as a pair [K1].' },
    b: { model: BIG_MODEL, text: 'You entered Connector at [t:26.0], eight seconds ahead of the team, with a flash and a smoke unused [F4]. The Stairs player had the angle and the nearest teammate was still at Top mid, so the death at [t:34.0] could not be traded [F3]. Smoke Jungle and walk in with a second player [K1].' },
  },
  {
    id: 'ab2',
    question: 'What mistake do I repeat most across my matches?',
    a: { model: BIG_MODEL, text: 'Untraded deaths, in all five matches [M5:F3] [M4:F1]. Mostly Connector on Mirage and A main on Anubis.' },
    b: { model: SERVED_MODEL, text: 'Untraded deaths [M5:F3] [M3:F2] [M4:F1]. You are first in without a second player close enough.' },
  },
  {
    id: 'ab3',
    question: 'Did my team trade me? (Anubis, round 16)',
    a: { model: SERVED_MODEL, text: 'No. You held Bridge alone and the nearest teammate was at B [F6].' },
    b: { model: BIG_MODEL, text: 'No. You died on Bridge at [t:45.0] and nobody was within trading range [F6]. Bridge is a crossfire spot with A connector [K18].' },
  },
];

export function modelRows(runs: Run[]) {
  const models = [...new Set(runs.map((x) => x.model).filter(Boolean))] as string[];
  return models.map((model) => {
    const mine = runs.filter((x) => x.model === model);
    const lat = mine.map((x) => x.latencyS ?? 0).sort((a, b) => a - b);
    return {
      model,
      runs: mine.length,
      verified: mine.filter((x) => x.verifierOk).length,
      repaired: mine.filter((x) => x.repaired).length,
      fellBack: mine.filter((x) => x.source !== 'agent').length,
      median: lat[Math.floor(lat.length / 2)] ?? 0,
      toolCalls: mine.reduce((s, x) => s + x.toolCalls, 0),
      toolFailed: mine.reduce((s, x) => s + x.steps.filter((st) => st.error).length, 0),
    };
  });
}
