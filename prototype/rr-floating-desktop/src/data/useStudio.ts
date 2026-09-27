import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { Match as ApiMatch, MomentClip, RoundStats as ApiRoundStats, RoundSummary } from '@/lib/contracts';
import { errorText, fromFinding, fromMoment, roundShell, withReplay, type Finding, type Moment, type RoundData } from './model';

export type StudioData = {
  detail: ApiMatch;
  playerId: string;
  you: string;
  findings: Finding[];
  moments: Moment[];
  clips: MomentClip[];
  rounds: RoundData[];
  /** Rounds won by the coached player's team, then lost, from RoundStats. */
  us: number;
  them: number;
  replayError: string | null;
  loadRound: (n: number) => void;
};

type Base = {
  detail: ApiMatch;
  playerId: string;
  findings: Finding[];
  stats: ApiRoundStats[];
  summaries: RoundSummary[];
  moments: Parameters<typeof fromMoment>[0][];
};

/** Everything the Studio needs for one match and its coached player; round replays load one at a time. */
export function useStudioData(matchId: string, rowPlayerId: string | null) {
  const [base, setBase] = useState<Base | null>(null);
  const [clips, setClips] = useState<MomentClip[]>([]);
  const [replays, setReplays] = useState<Record<number, RoundData>>({});
  const [error, setError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const loading = useRef(new Set<number>());

  useEffect(() => {
    let stop = false;
    setBase(null);
    setReplays({});
    setError(null);
    loading.current.clear();
    (async () => {
      try {
        const detail = await api.getMatch(matchId);
        const playerId = detail.selectedPlayerId ?? rowPlayerId;
        if (!playerId) throw new Error('No player has been picked for this match yet.');
        const [findings, stats, summaries, moments, clipList] = await Promise.all([
          api.getFindings(matchId, playerId),
          api.getRoundStats(matchId, playerId),
          api.getRounds(matchId),
          api.getPlayerMoments(matchId, playerId),
          api.getPlayerClips(matchId, playerId).catch(() => [] as MomentClip[]),
        ]);
        if (stop) return;
        setBase({ detail, playerId, findings: findings.map(fromFinding), stats, summaries, moments });
        setClips(clipList);
      } catch (e) {
        if (!stop) setError(errorText(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [matchId, rowPlayerId]);

  // Clips are recorded after the analysis opens for rounds picked on demand, and CS:DM can be slow: keep the list fresh
  const pending = clips.some((c) => c.status === 'queued' || c.status === 'recording');
  useEffect(() => {
    if (!base || !pending) return;
    const t = window.setInterval(() => {
      api
        .getPlayerClips(matchId, base.playerId)
        .then(setClips)
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(t);
  }, [base, pending, matchId]);

  const you = base?.detail.players?.find((p) => p.id === base.playerId)?.name ?? 'You';

  const shells = useMemo(() => {
    if (!base) return [];
    const byRound = new Map(base.stats.map((r) => [r.round, r]));
    return [...base.summaries]
      .sort((a, b) => a.number - b.number)
      .map((r) => roundShell(r, byRound.get(r.number), base.findings, you));
  }, [base, you]);

  const loadRound = useCallback(
    (n: number) => {
      if (!base || replays[n] || loading.current.has(n)) return;
      const shell = shells.find((r) => r.number === n);
      const summary = base.summaries.find((r) => r.number === n);
      if (!shell || !summary) return;
      loading.current.add(n);
      setReplayError(null);
      api
        .getRoundReplay(matchId, summary.id)
        .then((rep) => setReplays((all) => ({ ...all, [n]: withReplay(shell, rep, base.playerId) })))
        .catch((e) => setReplayError(`Round ${n}: ${errorText(e)}`))
        .finally(() => loading.current.delete(n));
    },
    [base, replays, shells, matchId],
  );

  const data: StudioData | null = useMemo(() => {
    if (!base) return null;
    const rounds = shells.map((r) => replays[r.number] ?? r);
    const us = rounds.filter((r) => r.won === true).length;
    return {
      detail: base.detail,
      playerId: base.playerId,
      you,
      findings: base.findings,
      moments: base.moments.map((m) => fromMoment(m, clips, api.mediaUrl)),
      clips,
      rounds,
      us,
      them: rounds.filter((r) => r.won === false).length,
      replayError,
      loadRound,
    };
  }, [base, shells, replays, clips, you, replayError, loadRound]);

  return { data, error };
}

const cache = new Map<string, unknown>();

/** Load once per key and keep the answer for the session (explanations, summaries, the wrap-up). */
export function useCached<T>(key: string | null, load: () => Promise<T>): { value: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; value: T | null; error: string | null }>(() => ({
    key,
    value: key && cache.has(key) ? (cache.get(key) as T) : null,
    error: null,
  }));
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!key) return;
    if (cache.has(key)) {
      setState({ key, value: cache.get(key) as T, error: null });
      return;
    }
    let stop = false;
    setState({ key, value: null, error: null });
    loader
      .current()
      .then((v) => {
        cache.set(key, v);
        if (!stop) setState({ key, value: v, error: null });
      })
      .catch((e) => {
        if (!stop) setState({ key, value: null, error: errorText(e) });
      });
    return () => {
      stop = true;
    };
  }, [key]);

  if (state.key !== key) {
    const hit = !!key && cache.has(key);
    return { value: hit ? (cache.get(key!) as T) : null, error: null, loading: !!key && !hit };
  }
  return { value: state.value, error: state.error, loading: !!key && state.value == null && state.error == null };
}

export function forget(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}
