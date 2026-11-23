"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { mapName } from "@/lib/labeler/manifest";
import { api, ApiError } from "./api";
import { ClipPlayer, type PlayerHandle } from "./ClipPlayer";
import { readDraft, removeDraft, writeDraft } from "./drafts";

type Assessment = "good" | "mistake" | "uncertain";
type Status = "draft" | "complete" | "skipped";
type Issue = "wrong_footage" | "insufficient_context";

export interface SavedReview {
  revision: number;
  status: Status;
  notes: string;
  assessment: Assessment | null;
  language: "en" | "pl";
  issue: Issue | null;
  savedAt: string;
}

export interface ClipData {
  account: { id: string; displayName: string; role: "admin" | "reviewer" };
  clip: {
    id: string;
    collectionId: string;
    collectionName: string;
    index: number;
    total: number;
    map: string;
    round: number;
    playerName: string;
    durationSec: number | null;
    momentAt: number | null;
  };
  review: SavedReview | null;
  previousClipId: string | null;
  nextClipId: string | null;
  nextUnfinishedClipId: string | null;
}

const CHIPS: Array<{ value: Assessment; label: string }> = [
  { value: "good", label: "Good play" },
  { value: "mistake", label: "Needs improvement" },
  { value: "uncertain", label: "Unsure" },
];

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "offline" | "conflict" | "error";

interface Pending {
  requestId: string;
  body: {
    requestId: string;
    previousRevision: number | null;
    status: Status;
    notes: string;
    assessment: Assessment | null;
    language: "en" | "pl";
    issue: Issue | null;
    confirmFootage: boolean;
  };
}

function typingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export function ClipReview({ data }: { data: ClipData }) {
  const router = useRouter();
  const { clip, account } = data;
  const player = useRef<PlayerHandle>(null);
  const [server, setServer] = useState<SavedReview | null>(data.review);
  const [notes, setNotes] = useState(data.review?.notes ?? "");
  const [assessment, setAssessment] = useState<Assessment | null>(data.review?.assessment ?? null);
  const [language, setLanguage] = useState<"en" | "pl">(data.review?.language ?? "en");
  const [state, setState] = useState<SaveState>(data.review ? "saved" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [conflict, setConflict] = useState<SavedReview | null>(null);
  const [busy, setBusy] = useState<null | "complete" | "skip">(null);
  const [issue, setIssue] = useState<Issue | "">("");
  const pending = useRef<Pending | null>(null);
  const revision = useRef<number | null>(data.review?.revision ?? null);
  const inflight = useRef<Promise<SavedReview | null> | null>(null);
  const retryTimer = useRef<number | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const retries = useRef(0);
  const target = clip.collectionId;
  // Saves always read the newest text, including retries scheduled from an older render.
  const latest = useRef({ notes, assessment, language });
  latest.current = { notes, assessment, language };

  const dirty = (server?.notes ?? "") !== notes || (server?.assessment ?? null) !== assessment || (server?.language ?? "en") !== language;

  // Recover text that never reached the server (reload, dropped connection, closed tab).
  useEffect(() => {
    const local = readDraft(account.id, clip.id);
    if (!local) return;
    const same = local.notes === (data.review?.notes ?? "") && local.assessment === (data.review?.assessment ?? null) && local.language === (data.review?.language ?? "en");
    if (same) {
      removeDraft(account.id, clip.id);
      return;
    }
    setNotes(local.notes);
    setAssessment(local.assessment);
    setLanguage(local.language);
    if (local.baseRevision === (data.review?.revision ?? null)) {
      setRestored(true);
      setState("unsaved");
    } else if (data.review) {
      setConflict(data.review);
      setState("conflict");
    } else {
      setState("unsaved");
    }
  }, [account.id, clip.id, data.review]);

  // Keep a local copy of every change until the server confirms it.
  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => {
      writeDraft(account.id, clip.id, { notes, assessment, language, baseRevision: revision.current, savedAt: Date.now() });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [account.id, clip.id, notes, assessment, language, dirty]);

  const send = useCallback(async (job: Pending): Promise<SavedReview | null> => {
    const result = await api<{ result: string; review: SavedReview; headRevision?: number }>(`/reviews/${clip.id}`, {
      method: "PUT",
      body: job.body,
    });
    pending.current = null;
    retries.current = 0;
    const saved = result.review;
    revision.current = result.result === "replayed" && result.headRevision ? result.headRevision : saved.revision;
    if (result.result !== "replayed" || result.headRevision === saved.revision) setServer(saved);
    return saved;
  }, [clip.id]);

  const scheduleRetry = useCallback((run: () => void) => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    const delay = Math.min(30_000, 2000 * 2 ** Math.min(retries.current, 4));
    retries.current += 1;
    retryTimer.current = window.setTimeout(run, delay);
  }, []);

  /**
   * Saves through one queue. A request that failed without an answer is resent with the same
   * request ID first, so the server returns its original result instead of appending twice.
   */
  const persist = useCallback(
    async (status: Status, options: { issue?: Issue | null; quiet?: boolean } = {}): Promise<SavedReview | null> => {
      if (inflight.current) await inflight.current.catch(() => null);
      const run = async (): Promise<SavedReview | null> => {
        setState("saving");
        setMessage(null);
        try {
          if (pending.current) await send(pending.current);
          const requestId = crypto.randomUUID();
          const { notes, assessment, language } = latest.current;
          const job: Pending = {
            requestId,
            body: {
              requestId,
              previousRevision: revision.current,
              status,
              notes,
              assessment,
              language,
              issue: status === "complete" ? null : options.issue ?? null,
              confirmFootage: status === "complete",
            },
          };
          pending.current = job;
          const saved = await send(job);
          const now = latest.current;
          setState(saved && saved.notes === now.notes && saved.assessment === now.assessment && saved.language === now.language ? "saved" : "unsaved");
          if (saved && saved.notes === now.notes && saved.assessment === now.assessment && saved.language === now.language) {
            removeDraft(account.id, clip.id);
          }
          return saved;
        } catch (error) {
          if (error instanceof ApiError && error.status === 409 && error.body.current !== undefined) {
            pending.current = null;
            setConflict((error.body.current as SavedReview | null) ?? null);
            setState("conflict");
            return null;
          }
          if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
            setState("offline");
            setMessage("Not sent yet. Your text is kept on this device and will be sent when the connection returns.");
            if (!options.quiet) throw error;
            scheduleRetry(() => void persist(status, options));
            return null;
          }
          pending.current = null;
          setState("error");
          setMessage(error instanceof Error ? error.message : "The note could not be saved.");
          if (!options.quiet) throw error;
          return null;
        }
      };
      inflight.current = run();
      try {
        return await inflight.current;
      } finally {
        inflight.current = null;
      }
    },
    [account.id, clip.id, scheduleRetry, send],
  );

  // Autosave drafts. A completed note is not silently withdrawn: edits to it wait for Save.
  useEffect(() => {
    if (!dirty || conflict || busy) return;
    setState((current) => (current === "offline" ? current : "unsaved"));
    if (server?.status === "complete") return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void persist("draft", { quiet: true });
    }, 1800);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [notes, assessment, language, dirty, conflict, busy, server?.status, persist]);

  useEffect(() => {
    const online = () => {
      if (pending.current || state === "offline") void persist(server?.status === "complete" ? "complete" : "draft", { quiet: true });
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [persist, server?.status, state]);

  useEffect(() => () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
  }, []);

  const nextHref = data.nextUnfinishedClipId ? `/label/review/${target}/${data.nextUnfinishedClipId}` : "/label";

  async function saveAndNext() {
    if (!notes.trim()) {
      setState("error");
      setMessage("Write what went well or could be improved before saving.");
      return;
    }
    setBusy("complete");
    try {
      const saved = await persist("complete");
      if (saved?.status === "complete") {
        removeDraft(account.id, clip.id);
        router.push(nextHref);
        router.refresh();
        return;
      }
    } catch {
      // The message is already shown; the text stays on this device.
    }
    setBusy(null);
  }

  async function skip(reported: Issue | null) {
    setBusy("skip");
    try {
      const saved = await persist("skipped", { issue: reported });
      if (saved) {
        router.push(nextHref);
        router.refresh();
        return;
      }
    } catch {
      // shown above
    }
    setBusy(null);
  }

  function keepMine() {
    if (!conflict && !server) return;
    revision.current = conflict?.revision ?? revision.current;
    setServer(conflict);
    setConflict(null);
    setState("unsaved");
  }

  function useSaved() {
    const saved = conflict;
    setConflict(null);
    removeDraft(account.id, clip.id);
    revision.current = saved?.revision ?? null;
    setServer(saved);
    setNotes(saved?.notes ?? "");
    setAssessment(saved?.assessment ?? null);
    setLanguage(saved?.language ?? "en");
    setState(saved ? "saved" : "idle");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typingTarget(event.target)) return;
      const actions: Record<string, () => void> = {
        k: () => player.current?.togglePlay(),
        r: () => player.current?.replay(),
        m: () => player.current?.goToMoment(),
        "[": () => player.current?.changeSpeed(-1),
        "]": () => player.current?.changeSpeed(1),
      };
      const action = actions[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        action();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onNoteKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void saveAndNext();
    }
  }

  const statusText: Record<SaveState, string> = {
    idle: "Not started",
    unsaved: server?.status === "complete" ? "Changes not saved. Press Save and next to keep them." : "Unsaved changes",
    saving: "Saving…",
    saved: server?.status === "complete" ? "Saved as reviewed" : server?.status === "skipped" ? "Skipped for now" : "Draft saved",
    offline: "Not sent yet",
    conflict: "Changed elsewhere",
    error: "Not saved",
  };

  return (
    <main className="lb-review" id="content">
      <div className="lb-review-head">
        <Link href="/label" className="lb-back">
          Your clips
        </Link>
        <p className="lb-meta" aria-live="polite">
          {clip.collectionName}, clip {clip.index} of {clip.total}
        </p>
      </div>

      <section className="lb-review-grid">
        <div className="lb-watch">
          <ClipPlayer ref={player} clipId={clip.id} momentAt={clip.momentAt} label={`Clip of ${clip.playerName}, round ${clip.round} on ${mapName(clip.map)}`} />
          <dl className="lb-context">
            <div>
              <dt>Player</dt>
              <dd>{clip.playerName}</dd>
            </div>
            <div>
              <dt>Map</dt>
              <dd>{mapName(clip.map)}</dd>
            </div>
            <div>
              <dt>Round</dt>
              <dd className="num">{clip.round}</dd>
            </div>
            {clip.momentAt !== null ? (
              <div>
                <dt>The moment</dt>
                <dd>
                  about <span className="num">{Math.round(clip.momentAt)}</span> s in
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="lb-hint">Shortcuts when you are not typing: K play or pause, R replay, M go to the moment, [ and ] change speed.</p>
        </div>

        <form className="lb-note sheet" onSubmit={(event) => { event.preventDefault(); void saveAndNext(); }} aria-labelledby="note-title">
          <h1 id="note-title" className="lb-note-title">
            Watch {clip.playerName}
          </h1>

          {conflict !== null || state === "conflict" ? (
            <div className="lb-conflict" role="alert">
              <p>This note was changed in another tab or on another device. Choose which text to keep.</p>
              <div className="lb-conflict-versions">
                <div>
                  <h2>Saved version</h2>
                  <p className="lb-quote">{conflict?.notes || "No text"}</p>
                </div>
                <div>
                  <h2>Your unsent text</h2>
                  <p className="lb-quote">{notes || "No text"}</p>
                </div>
              </div>
              <div className="lb-actions">
                <button type="button" className="lb-btn lb-btn-primary" onClick={keepMine}>
                  Keep my text
                </button>
                <button type="button" className="lb-btn lb-btn-secondary" onClick={useSaved}>
                  Use the saved version
                </button>
              </div>
            </div>
          ) : null}

          {restored ? (
            <p className="lb-notice" role="status">
              Restored text from this device that had not been sent.
            </p>
          ) : null}

          <div className="lb-field">
            <label className="lb-label" htmlFor="review-note">
              What went well or could be improved?
            </label>
            <textarea
              id="review-note"
              className="lb-input lb-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onKeyDown={onNoteKey}
              maxLength={6000}
              rows={7}
              aria-describedby="note-help"
            />
          </div>
          <p className="lb-hint" id="note-help">
            Describe what {clip.playerName} did in this clip. Ctrl+Enter saves and moves on.
          </p>

          <fieldset className="lb-chips">
            <legend className="lb-label">Overall (optional)</legend>
            {CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`lb-chip lb-chip-${chip.value}`}
                aria-pressed={assessment === chip.value}
                onClick={() => setAssessment(assessment === chip.value ? null : chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </fieldset>

          <fieldset className="lb-chips">
            <legend className="lb-label">Language of your note</legend>
            <div className="lb-segmented" role="group" aria-label="Language of your note">
              <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>
                English
              </button>
              <button type="button" aria-pressed={language === "pl"} onClick={() => setLanguage("pl")}>
                Polski
              </button>
            </div>
          </fieldset>

          <div className="lb-save">
            <p className={`lb-save-state lb-save-${state}`} role="status" aria-live="polite">
              {statusText[state]}
            </p>
            {message ? (
              <p className="lb-error" role="alert">
                {message}
              </p>
            ) : null}
            <p className="lb-hint">Saving confirms you checked that the clip shows {clip.playerName} and the event you described.</p>
            <div className="lb-actions">
              <button type="submit" className="lb-btn lb-btn-primary" disabled={busy !== null || conflict !== null || !notes.trim()}>
                {busy === "complete" ? "Saving…" : "Save and next"}
              </button>
              <button type="button" className="lb-btn lb-btn-secondary" disabled={busy !== null || conflict !== null} onClick={() => void skip(null)}>
                {busy === "skip" ? "Skipping…" : "Skip for now"}
              </button>
            </div>
          </div>

          <details className="lb-report">
            <summary>Report a problem with this clip</summary>
            <div className="lb-report-body">
              <label className="lb-radio">
                <input type="radio" name="issue" value="wrong_footage" checked={issue === "wrong_footage"} onChange={() => setIssue("wrong_footage")} />
                The clip shows the wrong player or event
              </label>
              <label className="lb-radio">
                <input
                  type="radio"
                  name="issue"
                  value="insufficient_context"
                  checked={issue === "insufficient_context"}
                  onChange={() => setIssue("insufficient_context")}
                />
                There is not enough context to judge
              </label>
              <button type="button" className="lb-btn lb-btn-secondary" disabled={!issue || busy !== null} onClick={() => void skip(issue || null)}>
                Report and skip
              </button>
            </div>
          </details>

          <nav className="lb-pager" aria-label="Clips in this collection">
            {data.previousClipId ? (
              <Link href={`/label/review/${target}/${data.previousClipId}`} className="lb-btn lb-btn-quiet">
                Previous clip
              </Link>
            ) : (
              <span />
            )}
            {data.nextClipId ? (
              <Link href={`/label/review/${target}/${data.nextClipId}`} className="lb-btn lb-btn-quiet">
                Next clip
              </Link>
            ) : null}
          </nav>
        </form>
      </section>
    </main>
  );
}
