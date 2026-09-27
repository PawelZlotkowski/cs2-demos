import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { Match as ApiMatch, MomentClip, RoundClip, RoundStats as ApiRoundStats, RoundSummary } from '@/lib/contracts';
import { errorText, fromFinding, fromMoment, roundShell, withReplay, type Finding, type Moment, type RoundData } from './model';

export type StudioData = {
  detail: ApiMatch;
  playerId: string;
  you: string;
  findings: Finding[];
  moments: Moment[];
  clips: MomentClip[];
  /** CS:DM's whole-round clips (the replay worker), used when a round has no player clip. */
  roundClips: RoundClip[];
  rounds: RoundData[];
  /** Rounds won by the coached player's team, then lost, from RoundStats. */
  us: number;
  them: number;
  replayError: string | null;
  loadRound: (n: number) => void;
  /** Fetch the clip lists again, after something queued a recording (a round explained on demand, a retry). */
  refreshClips: () => void;
  roundIdOf: (n: number) => string | null;
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
  const [roundClips, setRoundClips] = useState<RoundClip[]>([]);
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
        api
          .getClips(matchId)
          .then((m) => !stop && setRoundClips(m.clips))
          .catch(() => undefined);
      } catch (e) {
        if (!stop) setError(errorText(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [matchId, rowPlayerId]);

  const refreshClips = useCallback(() => {
    if (!base) return;
    api
      .getPlayerClips(matchId, base.playerId)
      .then(setClips)
      .catch(() => undefined);
    api
      .getClips(matchId)
      .then((m) => setRoundClips(m.clips))
      .catch(() => undefined);
  }, [base, matchId]);

  // Clips are recorded after the analysis opens for rounds picked on demand, and CS:DM can be slow: keep the lists fresh
  const pending = [...clips, ...roundClips].some((c) => c.status === 'queued' || c.status === 'recording');
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(refreshClips, 3000);
    return () => window.clearInterval(t);
  }, [pending, refreshClips]);

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
      roundClips,
      rounds,
      us,
      them: rounds.filter((r) => r.won === false).length,
      replayError,
      loadRound,
      refreshClips,
      roundIdOf: (n) => base.summaries.find((r) => r.number === n)?.id ?? null,
    };
  }, [base, shells, replays, clips, roundClips, you, replayError, loadRound, refreshClips]);

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
