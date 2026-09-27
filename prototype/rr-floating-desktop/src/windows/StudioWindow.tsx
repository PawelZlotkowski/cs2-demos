import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { WindowFrame } from '../desktop/WindowFrame';
import { aliveAt, eventTitle, findingLabel, roundClip, type Match, type Moment } from '../data/model';
import { useStudioData, type StudioData } from '../data/useStudio';
import { useStore, type StudioTarget } from '../state/store';
import type { CiteHandlers } from '../ui/CoachText';
import { Segmented } from '../ui/Segmented';
import { clock } from '../ui/time';
import { AnalysisPanel, type PanelCtx } from '../studio/AnalysisPanel';
import { Rail, type Review } from '../studio/Rail';
import { AskPanel, NotesPanel, RoundPanel } from '../studio/SidePanels';
import { Stage, type View } from '../studio/Stage';
import { Timeline } from '../studio/Timeline';
import { RATES, useClock } from '../studio/useClock';

type Tab = 'analysis' | 'ask' | 'round' | 'notes';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function StudioWindow() {
  const s = useStore();
  const match = s.studio ? s.matches.find((m) => m.id === s.studio!.matchId) : undefined;
  const done = s.matches.filter((m) => m.status === 'complete');
  const ready = match && match.status === 'complete';
  const [panelOn, setPanelOn] = useState(true);

  return (
    <WindowFrame
      id="studio"
      title={ready ? `${match.mapLabel} ${match.score}` : 'Studio'}
      subtitle={ready ? `${match.when} · ${match.playerName ?? 'no player'} · reviewed by ${match.model ?? 'templates'}` : 'No match open'}
      minW={880}
      minH={560}
      flush
      toolbar={
        <>
          <select className="select" aria-label="Match" value={ready ? match.id : ''} onChange={(e) => s.openStudio(e.target.value)}>
            {ready ? null : <option value="">Pick a match</option>}
            {done.map((m) => (
              <option key={m.id} value={m.id}>
                {m.mapLabel} {m.score} · {m.playerName ?? 'no player'} · {m.when}
              </option>
            ))}
          </select>
          <button type="button" className="btn icon" aria-pressed={panelOn} title={panelOn ? 'Hide the analysis' : 'Show the analysis'} onClick={() => setPanelOn((p) => !p)}>
            <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
              <rect x="1" y="1" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 1v12" stroke="currentColor" strokeWidth="1.3" />
              {panelOn ? <rect x="10" y="1" width="5" height="12" fill="currentColor" opacity=".25" /> : null}
            </svg>
          </button>
        </>
      }
    >
      {ready && s.studio ? (
        <StudioLoader key={match.id} match={match} target={s.studio} panelOn={panelOn} />
      ) : (
        <div className="studio-empty">
          <h2>{match && !ready ? `${match.mapLabel} is not reviewed yet` : 'Open a match to review it'}</h2>
          <p className="meta">The Studio shows one match: its moments, the clip and radar, and the coach.</p>
          <div className="row-btns">
            {done[0] ? (
              <button type="button" className="btn btn-default" onClick={() => s.openStudio(done[0].id)}>
                Open {done[0].mapLabel} {done[0].score}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => s.open('matches')}>
              Show matches
            </button>
          </div>
        </div>
      )}
    </WindowFrame>
  );
}

function StudioLoader({ match, target, panelOn }: { match: Match; target: StudioTarget; panelOn: boolean }) {
  const { data, error } = useStudioData(match.id, match.playerId);
  if (error)
    return (
      <div className="studio-empty">
        <h2>Could not open {match.mapLabel}</h2>
        <p className="err">{error}</p>
      </div>
    );
  if (!data || !data.rounds.length)
    return (
      <div className="studio-empty">
        <p className="meta thinking">{data ? 'This match has no rounds' : `Loading ${match.mapLabel}`}</p>
      </div>
    );
  return <StudioBody match={match} data={data} target={target} panelOn={panelOn} />;
}

function StudioBody({ match, data, target, panelOn }: { match: Match; data: StudioData; target: StudioTarget; panelOn: boolean }) {
  const s = useStore();
  const { findings, moments, rounds, you } = data;

  const [roundNo, setRoundNo] = useState(moments[0]?.round ?? 1);
  const [momentId, setMomentId] = useState<string | null>(moments[0]?.id ?? null);
  const [review, setReview] = useState<Review>('overview');
  const [headId, setHeadId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [main, setMain] = useState<View>('gameplay');
  const [tab, setTab] = useState<Tab>('analysis');
  const [seenMoments, setSeenMoments] = useState<Set<string>>(new Set());
  const [seenRounds, setSeenRounds] = useState<Set<number>>(new Set());
  const wasPlaying = useRef(false);

  const round = rounds.find((r) => r.number === roundNo) ?? rounds[0];
  const clk = useClock(round.duration);
  const { loadRound } = data;
  useEffect(() => loadRound(round.number), [loadRound, round.number]);
  const moment = moments.find((m) => m.id === momentId) ?? null;
  const headFinding = findings.find((f) => f.id === (headId ?? (moment && !review ? moment.findingIds[0] : null))) ?? null;
  const selectedEvent = round.events.find((e) => e.id === eventId) ?? null;

  const markRound = (n: number) => setSeenRounds((x) => new Set(x).add(n));

  const selectMoment = useCallback(
    (m: Moment, focusId?: string) => {
      setReview(null);
      setMomentId(m.id);
      setRoundNo(m.round);
      setHeadId(focusId ?? m.findingIds[0]);
      setEventId(null);
      setSeenMoments((x) => new Set(x).add(m.id));
      markRound(m.round);
      const f = findings.find((x) => x.id === (focusId ?? m.findingIds[0]));
      window.setTimeout(() => clk.seek(focusId && f ? Math.max(m.t0, f.t - 3) : m.t0), 0);
    },
    [findings, clk],
  );

  const selectRound = useCallback(
    (n: number) => {
      setReview(null);
      setMomentId(null);
      setHeadId(null);
      setEventId(null);
      setRoundNo(n);
      markRound(n);
      window.setTimeout(() => clk.seek(0), 0);
    },
    [clk],
  );

  const openFinding = useCallback(
    (id: string) => {
      const f = findings.find((x) => x.id === id);
      if (!f) return;
      const m = moments.find((x) => x.findingIds.includes(id));
      if (m) return selectMoment(m, id);
      setReview(null);
      setMomentId(null);
      setHeadId(id);
      setEventId(null);
      setRoundNo(f.round);
      markRound(f.round);
      window.setTimeout(() => clk.seek(Math.max(0, f.t - 3)), 0);
    },
    [findings, moments, selectMoment, clk],
  );

  const applied = useRef(0);
  useEffect(() => {
    if (applied.current === target.nonce) return;
    applied.current = target.nonce;
    if (target.findingId) openFinding(target.findingId);
    else if (moments[0]) clk.seek(moments[0].t0);
  }, [target, openFinding, moments, clk]);

  const onSeek = useCallback(
    (t: number, id?: string) => {
      clk.seek(t);
      if (id) setEventId(id);
    },
    [clk],
  );

  const cites: CiteHandlers = {
    onFinding: openFinding,
    onSeek: (t) => clk.seek(t),
    onMoment: (id) => {
      const m = moments.find((x) => x.id === id);
      if (m) selectMoment(m);
    },
    onMatchFinding: (matchId, fid) => s.openStudio(matchId, fid),
  };

  const stepEvent = (dir: 1 | -1) => {
    const evs = round.events;
    const e = dir === 1 ? evs.find((x) => x.t > clk.t + 0.05) : [...evs].reverse().find((x) => x.t < clk.t - 0.05);
    if (e) onSeek(e.t, e.id);
  };

  const idx = moment ? moments.indexOf(moment) : -1;
  const nextMoment = () => {
    if (review === 'overview' && moments[0]) return selectMoment(moments[0]);
    if (idx >= 0 && moments[idx + 1]) return selectMoment(moments[idx + 1]);
    if (idx === moments.length - 1) setReview('wrapup');
  };

  const keys = useRef({ toggle: clk.toggle, stepEvent, nextMoment, setMain });
  keys.current = { toggle: clk.toggle, stepEvent, nextMoment, setMain };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (s.focused !== 'studio' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select')) return;
      const k = keys.current;
      if (e.key === ' ') {
        e.preventDefault();
        k.toggle();
      } else if (e.key === 'v' || e.key === 'V') k.setMain((m) => (m === 'gameplay' ? 'radar' : 'gameplay'));
      else if (e.key === ',') k.stepEvent(-1);
      else if (e.key === '.') k.stepEvent(1);
      else if (e.key === 'n' || e.key === 'N') k.nextMoment();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.focused]);

  const lead = moment ? (findings.find((f) => f.id === moment.findingIds[0]) ?? null) : null;
  const inMoment = moment && !review && moment.round === round.number;
  const clipState =
    inMoment && moment.clip.status !== 'none'
      ? moment.clip
      : roundClip(round.number, clk.t, data.clips, data.roundClips, data.roundIdOf(round.number), round.duration, api.mediaUrl, (id) => api.clipUrl(match.id, id));
  const clip = { ...clipState, t1: Math.min(clipState.t1, round.duration), label: inMoment && lead ? findingLabel(lead.template) : `round ${round.number}` };
  const chip =
    moment && !review
      ? { glyph: lead?.kind ?? ('mistake' as const), n: String(idx + 1).padStart(2, '0'), label: lead ? findingLabel(lead.template) : moment.id }
      : { glyph: 'round' as const, n: `R${round.number}`, label: review === 'overview' ? 'Match brief' : review === 'wrapup' ? 'Debrief' : round.winner ? `${round.winner} win` : `Round ${round.number}` };
  const alive = aliveAt(round, clk.t);
  const now = [...round.events].reverse().find((e) => e.t <= clk.t && clk.t - e.t < 2.5);
  const recording = moments.filter((m) => m.clip.status === 'recording').length;
  const momentKind = new Map(moments.map((m) => [m.round, findings.find((f) => f.id === m.findingIds[0])?.kind ?? 'mistake']));

  // The clip takes the stage when there is one; without it the radar is the only picture
  const noClip = clip.status === 'none' || clip.status === 'failed';
  useEffect(() => {
    setMain(noClip ? 'radar' : 'gameplay');
  }, [noClip, round.number, momentId]);

  function download() {
    if (!clip.url) return;
    const t = lead?.t ?? clip.t0;
    const name = `${match.mapLabel.toLowerCase()}_${slug(you)}_r${String(round.number).padStart(2, '0')}_${slug(clip.label)}_${Math.floor(t / 60)}m${String(Math.round(t % 60)).padStart(2, '0')}s.mp4`;
    const a = document.createElement('a');
    a.href = clip.download ?? clip.url;
    a.download = name;
    a.click();
  }

  function retryClip() {
    if (!clip.id) return;
    void api
      .retryPlayerClip(match.id, data.playerId, clip.id)
      .catch(() => undefined)
      .finally(() => data.refreshClips());
  }

  const ctx: PanelCtx = {
    match,
    data,
    you,
    moments,
    findings,
    round,
    rounds,
    review,
    moment: review ? null : moment,
    headFinding: review ? null : headFinding,
    selectedEvent,
    seenMoments,
    seenRounds,
    cites,
    selectMoment: (m) => selectMoment(m),
    selectRound,
    setReview: (r) => {
      setReview(r);
      setTab('analysis');
    },
    onSeek,
  };

  return (
    <div className={`studio${panelOn ? '' : ' no-panel'}`}>
      <Rail
        you={you}
        moments={moments}
        findings={findings}
        rounds={rounds}
        review={review}
        momentId={review ? null : momentId}
        roundNo={roundNo}
        seenMoments={seenMoments}
        seenRounds={seenRounds}
        onReview={(r) => {
          setReview(r);
          setTab('analysis');
        }}
        onMoment={(m) => selectMoment(m)}
        onRound={selectRound}
      />

      <section className="work" aria-label="Replay">
        {data.replayError ? <p className="err stage-err">{data.replayError}</p> : null}
        <Stage
          map={match.map}
          you={you}
          round={round}
          t={clk.t}
          playing={clk.playing}
          rate={clk.rate}
          main={main}
          onMain={setMain}
          clip={clip}
          focusFinding={headFinding ?? lead}
          selectedEventId={eventId}
          chip={chip}
          onSeek={(t) => clk.seek(t)}
          onDownload={download}
          onRetry={clip.id ? retryClip : undefined}
        />
        <div className="transport">
          <button type="button" className="play" aria-label={clk.playing ? 'Pause' : 'Play'} title={clk.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={clk.toggle}>
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              {clk.playing ? (
                <>
                  <rect x="2.5" y="1.5" width="3.2" height="11" rx="0.6" fill="currentColor" />
                  <rect x="8.3" y="1.5" width="3.2" height="11" rx="0.6" fill="currentColor" />
                </>
              ) : (
                <path d="M3.5 1.8v10.4l9-5.2z" fill="currentColor" />
              )}
            </svg>
          </button>
          <button type="button" className="step" aria-label="Previous event" title="Previous event (,)" onClick={() => stepEvent(-1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 1.5v9M10 1.5L4.5 6 10 10.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="step" aria-label="Next event" title="Next event (.)" onClick={() => stepEvent(1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M10 1.5v9M2 1.5L7.5 6 2 10.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="clock num">
            <b>{clock(clk.t)}</b>
            <span>/ {clock(round.duration)}</span>
          </div>
          <div className={`adv num${alive.us > alive.them ? ' up' : alive.us < alive.them ? ' down' : ''}`} title="Players alive, your team first">
            <b>{alive.us}</b>
            <i>v</i>
            <b>{alive.them}</b>
          </div>
          <div className="now">{now ? eventTitle(now) : !round.loaded ? `Loading round ${round.number}` : `Round ${round.number}${round.side ? `, ${round.side} side` : ''}`}</div>
          {recording ? <span className="clip-progress num">Clips {moments.length - recording}/{moments.length}</span> : null}
          <Segmented<View>
            label="View"
            value={main}
            onChange={setMain}
            options={[
              { id: 'gameplay', label: 'Gameplay', title: 'Gameplay (V)' },
              { id: 'radar', label: 'Radar', title: 'Radar (V)' },
            ]}
          />
          <button type="button" className="t-opt num" title="Playback speed" onClick={() => clk.setRate(RATES[(RATES.indexOf(clk.rate) + 1) % RATES.length])}>
            {clk.rate}×
          </button>
          <button type="button" className="t-opt" title={s.wins.studio.zoomed ? 'Restore size' : 'Fill the screen'} aria-label="Fill the screen" onClick={() => s.zoom('studio')}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <Timeline
          duration={round.duration}
          t={clk.t}
          events={round.events}
          findings={round.findings}
          band={moment && !review ? { t0: moment.t0, t1: moment.t1 } : null}
          headFindingId={headFinding?.id ?? null}
          selectedEventId={eventId}
          rounds={rounds.map((r) => ({ n: r.number, won: r.won === true, moment: momentKind.get(r.number) ?? null }))}
          team={round.team}
          you={you}
          current={roundNo}
          onRound={selectRound}
          onSeek={onSeek}
          onFinding={openFinding}
          onScrub={(active) => {
            if (active) {
              wasPlaying.current = clk.playing;
              clk.pause();
            } else if (wasPlaying.current) clk.play();
          }}
        />
      </section>

      {panelOn ? (
        <aside className="ctx" aria-label="Analysis of this round">
          <div className="p-head">
            <Segmented<Tab>
              label="Panel"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'analysis', label: 'Analysis' },
                { id: 'ask', label: 'Ask' },
                { id: 'round', label: 'Round' },
                { id: 'notes', label: 'Notes' },
              ]}
            />
          </div>
          <div className={`insight tab-${tab}`}>
            {tab === 'analysis' ? <AnalysisPanel ctx={ctx} /> : tab === 'ask' ? <AskPanel key={`${match.id}:${roundNo}`} ctx={ctx} t={clk.t} view={main} /> : tab === 'round' ? <RoundPanel ctx={ctx} /> : <NotesPanel ctx={ctx} t={clk.t} />}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
