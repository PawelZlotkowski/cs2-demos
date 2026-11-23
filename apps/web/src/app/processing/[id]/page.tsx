"use client";

import { LoadingState } from "@/components/LoadingState";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { NotFound, isNotFound } from "@/components/NotFound";
import { PillBubble } from "@/components/PillBubble";
import { StatusIsland } from "@/components/StatusIsland";
import { PlayerPicker, type PickerPlayer } from "@/components/processing/PlayerPicker";
import { RunLog, type StageObservations } from "@/components/processing/RunLog";
import { api } from "@/lib/api/client";
import { useCoachLanguage } from "@/lib/coach/language";
import { REPLAY_READY_STATUSES, type Match, type ReviewFocus, type StatusResponse } from "@/lib/contracts";
import { askToNotify, notifyPermission, notifyReviewReady } from "@/lib/notify";
import { getMapMeta } from "@/lib/replay/maps";
import { makeRosterLookup } from "@/lib/replay/roster";

const FOCUSES: { id: ReviewFocus; label: string; detail: string }[] = [
  { id: "overall", label: "Overall", detail: "Review shooting, utility and teamwork together." },
  { id: "shooting", label: "Shooting", detail: "Review movement while firing, opening duels and successful fights." },
  { id: "utility", label: "Utility", detail: "Review flashes, grenade damage and utility held at death." },
  { id: "teamwork", label: "Teamwork", detail: "Review this player’s trades, support and flashes." },
];

const LANGUAGES = [{ id: "en", label: "English" }, { id: "pl", label: "Polski" }] as const;

/** Legacy demos can reach the picker after parsing, with real kills and deaths available. */
async function rosterWithStats(match: Match): Promise<PickerPlayer[]> {
  const roster = match.players ?? [];
  const lookup = makeRosterLookup(roster);
  const kills = new Map<string, number>();
  const deaths = new Map<string, number>();
  for (let offset = 0; ; ) {
    const page = await api.getEvents(match.id, { offset, limit: 2000 });
    for (const event of page.events) {
      if (event.type !== "kill") continue;
      const killer = lookup(event.actorId);
      const victim = lookup(event.victimId);
      if (victim) deaths.set(victim.id, (deaths.get(victim.id) ?? 0) + 1);
      if (killer && victim && killer.team !== victim.team) kills.set(killer.id, (kills.get(killer.id) ?? 0) + 1);
    }
    offset += page.events.length;
    if (!page.events.length || offset >= page.total) break;
  }
  return roster.map((p) => ({ ...p, kills: kills.get(p.id) ?? 0, deaths: deaths.get(p.id) ?? 0 }));
}

function ChoicePills<T extends string>({ name, options, value, onChange }: {
  name: string; options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return <div className="setup-choices">
    <PillBubble value={value} />
    {options.map((option) => <label key={option.id}>
      <input type="radio" name={name} value={option.id} checked={value === option.id}
        onChange={() => onChange(option.id)} />
      <span lang={option.id === "pl" ? "pl" : undefined}>{option.label}</span>
    </label>)}
  </div>;
}

export default function ProcessingPage() {
  const { id } = useParams<{ id: string }>();
  return <ProcessingMatch key={id} id={id} />;
}

function ProcessingMatch({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const previous = useRef<StatusResponse | null>(null);
  const [observed, setObserved] = useState<StageObservations>({});
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<PickerPlayer[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [hasRounds, setHasRounds] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<ReviewFocus>("overall");
  const [coachLanguage, setCoachLanguage] = useCoachLanguage();
  const language = coachLanguage === "pl" ? "pl" : "en";
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => setPermission(notifyPermission()), []);

  const receive = useCallback((next: StatusResponse) => {
    const last = previous.current;
    const changes: StageObservations = {};
    const seenAt = new Date();
    for (const stage of next.stages) {
      const prior = last?.stages.find((s) => s.id === stage.id);
      if (prior && prior.state !== stage.state) changes[stage.id] = seenAt;
    }
    if (Object.keys(changes).length) setObserved((times) => ({ ...times, ...changes }));
    previous.current = next;
    setStatus(next);
    setPollError(null);
  }, []);

  useEffect(() => {
    if (busy) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.getStatus(id);
        if (!live || submitting.current) return;
        receive(next);
        if (next.status === "complete" || next.status === "failed") return;
        const paused = next.status === "awaiting_setup" || next.status === "awaiting_player";
        timer = setTimeout(poll, paused ? 2500 : 800);
      } catch (e) {
        if (!live) return;
        const message = e instanceof Error ? e.message : "Unable to reach the API.";
        setPollError(message);
        if (!isNotFound(message)) timer = setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [id, busy, pollKey, receive]);

  const phase = status?.status;
  const beforeParse = phase === "awaiting_setup";
  const awaiting = beforeParse || phase === "awaiting_player";
  const ready = phase === "complete";
  const failed = phase === "failed";
  const replayPhase = !!phase && REPLAY_READY_STATUSES.has(phase);
  const wantMatch = awaiting || replayPhase || phase === "ready_to_parse" || phase === "parsing" || phase === "normalizing";

  useEffect(() => {
    document.title = `${awaiting ? "Set up your review" : ready ? "Review ready" : failed ? "Processing failed" : "Processing demo"} · Round Reviewer`;
    if (!ready) return;
    notifyReviewReady(id, "Your review is ready. Open the tab to see your moments.");
    const timer = setTimeout(() => router.replace(`/studio/${id}`), 700);
    return () => clearTimeout(timer);
  }, [awaiting, failed, ready, id, router]);

  useEffect(() => {
    if (!wantMatch) return;
    let live = true;
    setRosterError(null);
    api.getMatch(id).then(async (m) => {
      if (!live) return;
      setMatch(m);
      if (!awaiting) return;
      setPlayers(m.players ?? []);
      if (!beforeParse && m.players?.length) {
        const detailed = await rosterWithStats(m).catch(() => null);
        if (live && detailed) setPlayers(detailed);
      }
    }).catch((e: unknown) => {
      if (live) setRosterError(e instanceof Error ? e.message : "Unable to read this match.");
    });
    return () => { live = false; };
  }, [id, wantMatch, awaiting, beforeParse, loadKey]);

  useEffect(() => {
    if (!replayPhase || ready) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function checkReplay() {
      const rounds = await api.getRounds(id).catch(() => null);
      if (!live) return;
      if (rounds?.length) setHasRounds(true);
      else timer = setTimeout(checkReplay, 2500);
    }
    void checkReplay();
    return () => { live = false; clearTimeout(timer); };
  }, [id, replayPhase, ready]);

  const selected = players?.find((p) => p.id === selectedId);
  async function startReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !awaiting || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      receive(await api.selectPlayer(id, selected.id, language, focus));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unable to start the review. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
      setPollKey((n) => n + 1);
    }
  }

  async function retry() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const next = await api.retryProcessing(id);
      // A new attempt: earlier stage times belong to the failed run.
      previous.current = null;
      setObserved({});
      receive(next);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unable to start processing again. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
      setPollKey((n) => n + 1);
    }
  }

  if (isNotFound(pollError)) return <NotFound title="This match isn’t here" detail="It may have been deleted, or the link is wrong." />;
  const mapLabel = match?.mapName || match?.map;
  const rawMap = mapLabel && mapLabel !== "…" ? mapLabel : null;
  const map = rawMap && (getMapMeta(rawMap) ?? getMapMeta(`de_${rawMap.toLowerCase()}`));
  const mapName = map ? map.displayName : rawMap;
  const mapImage = map ? map.radarImage : null;
  const showPreview = !!mapName || hasRounds || !!rosterError;
  const solo = !awaiting && !showPreview && !ready && !failed;
  const studioHref = `/studio/${id}`;
  return <main className="main processing-page" id="content">
    <StatusIsland status={status} disconnected={!!pollError} />
    <div className="processing-layout" data-solo={solo}>
      {pollError && <div className="processing-message sheet" role="alert">
        <p>{pollError}</p><button type="button" className="btn btn-line" onClick={() => setPollKey((n) => n + 1)}>Check again</button>
      </div>}
      {awaiting ? <form className="setup-sheet sheet" onSubmit={startReview} aria-labelledby="setup-title">
        <header className="setup-heading">
          <div><h1 id="setup-title">Who should the coach review?</h1>
            {(mapName || players) && <p>{mapName && <strong>{mapName}</strong>}{mapName && players && ", "}
              {players && `${players.length} ${players.length === 1 ? "player" : "players"} in this demo`}</p>}
          </div>
          {mapImage && <span aria-hidden="true" className="setup-map" style={{ backgroundImage: `url(${mapImage})` }} />}
        </header>
        {players?.length ? <PlayerPicker players={players} selectedId={selectedId} busyId={busy ? selectedId : null} onPick={setSelectedId} />
          : !rosterError && !players ? <LoadingState label="Reading the demo roster…" />
          : <div className="roster-message" role="status"><p>{rosterError || "The demo roster has no players available to review."}</p>
            {!rosterError && <Link className="btn btn-fill" href="/upload">Choose another demo</Link>}
            {rosterError && <button type="button" className="btn btn-line" onClick={() => setLoadKey((n) => n + 1)}>Reload roster</button>}
          </div>}
        <div className="setup-preferences">
          <fieldset disabled={busy}><legend>Review focus</legend>
            <ChoicePills name="review-focus" options={FOCUSES} value={focus} onChange={setFocus} />
            <p>{FOCUSES.find((f) => f.id === focus)?.detail}</p>
          </fieldset>
          <fieldset disabled={busy}><legend>Coach language</legend>
            <ChoicePills name="coach-language" options={LANGUAGES} value={language} onChange={setCoachLanguage} />
          </fieldset>
        </div>
        {(submitError || status?.error) && <p className="err" role="alert">{submitError || status?.error}</p>}
        <footer className="setup-footer">
          <p>{selected ? <>Reviewing <strong>{selected.name}</strong></> : "Choose a player to continue."}</p>
          <button type="submit" className="btn btn-fill" disabled={!selected || busy}>{busy ? "Starting review…" : "Start review"}</button>
        </footer>
        {hasRounds && <Link className="setup-radar-link" href={studioHref}>Watch the radar</Link>}
      </form> : failed ? <section className="processing-summary sheet">
        <h1>Unable to process this demo</h1>
        <p>{status?.error || "Processing stopped before the review was ready."} Retry to process the same demo again, or choose another one.</p>
        {submitError && <p className="err" role="alert">{submitError}</p>}
        <div className="preview-actions">
          <button type="button" className="btn btn-fill" disabled={busy} onClick={() => void retry()}>{busy ? "Retrying…" : "Retry processing"}</button>
          <Link className="btn btn-line" href="/upload">Choose another demo</Link>
        </div>
      </section> : ready ? <section className="processing-summary sheet">
        <h1>Your review is ready</h1><Link className="btn btn-fill" href={studioHref}>Open Studio</Link>
      </section> : showPreview ? <section className="processing-preview sheet">
        <header><h1>{mapName ?? "Preparing your demo"}</h1><p>{hasRounds ? "The replay is ready to watch while your review finishes." : "Preparing the replay for your review."}</p></header>
        {mapImage && <div className="processing-map" role="img" aria-label={`${mapName} map overview`} style={{ backgroundImage: `url(${mapImage})` }} />}
        {rosterError && <p className="err" role="alert">{rosterError}</p>}
        <div className="preview-actions">
          {rosterError && <button className="btn btn-line" onClick={() => setLoadKey((n) => n + 1)}>Reload match details</button>}
          {hasRounds && <Link className="btn btn-fill" href={studioHref}>Watch the radar</Link>}
          {permission === "default" && <button type="button" className="btn btn-line" onClick={() => void askToNotify().then(setPermission)}>Notify me when ready</button>}
          {permission === "granted" && <span className="meta">We’ll notify you when the review is ready.</span>}
        </div>
      </section> : <h1 className="sr-only">Preparing your demo</h1>}
      {(status || !pollError) && <RunLog status={status} observed={observed} />}
    </div>
  </main>;
}
