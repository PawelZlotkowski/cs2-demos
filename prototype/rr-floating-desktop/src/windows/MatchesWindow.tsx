import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api/client';
import { WindowFrame } from '../desktop/WindowFrame';
import { BUSY, errorText, type Match, type MatchStatus } from '../data/model';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { ApiTooOld } from '../ui/ApiNotice';
import { Secret, Sheet } from '../ui/kit';

const STATUS_LABEL: Partial<Record<MatchStatus, string>> = {
  awaiting_player: 'Pick a player',
  failed: 'Failed',
  selecting: 'Picking moments',
  recording: 'Recording clips',
  explaining: 'Writing the review',
  uploaded: 'Uploaded',
  decompressing: 'Decompressing',
  decompressed: 'Decompressing',
  parsing: 'Reading the demo',
  normalizing: 'Preparing the replay',
  detecting: 'Looking for mistakes',
};

type SheetKind = { kind: 'rename' | 'share' | 'delete'; match: Match };

export function MatchesWindow() {
  const s = useStore();
  const { state } = useAuth();
  const mine = !!state?.authEnabled;
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // Matches can change behind the window (another browser, the Admin window, a share); bring the list up to date when it comes to the front
  const front = s.focused === 'matches';
  const { refreshMatches } = s;
  useEffect(() => {
    if (front) void refreshMatches();
  }, [front, refreshMatches]);
  const [error, setError] = useState<string | null>(null);
  const served = s.system?.checks.find((c) => c.name === 'llm')?.state === 'ok' ? s.system.llmModel : null;

  async function rerun(m: Match) {
    setConfirm(null);
    setError(null);
    try {
      await api.rerunCoach(m.id, s.language);
      await s.refreshMatches();
    } catch (e) {
      setError(`${m.mapLabel} ${m.score}: ${errorText(e)}`);
    }
  }

  const done = s.matches.filter((m) => m.status === 'complete').length;

  return (
    <WindowFrame
      id="matches"
      subtitle={
        s.matchesError
          ? 'The API is not answering'
          : `${s.matches.length} ${s.matches.length === 1 ? 'match' : 'matches'}${mine ? '' : ' on this computer'}, ${done} reviewed`
      }
      toolbar={
        <button type="button" className="btn btn-default" onClick={() => s.openInstaller(null)}>
          Add match
        </button>
      }
      minW={640}
    >
      <div className="page">
        <p className="lede">{mine ? 'Your matches' : 'Every match on this computer'}, newest first, with the model that wrote its review.</p>
        {s.apiTooOld ? <ApiTooOld /> : null}
        {s.matchesError && !s.apiTooOld ? (
          <p className="err" role="alert">
            Could not load the matches: {s.matchesError}. Start the API (<code>uvicorn app.main:app --port 8000</code> in <code>apps/api</code>) and{' '}
            <button type="button" className="link" onClick={() => void s.refreshMatches()}>
              try again
            </button>
            .
          </p>
        ) : null}
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        {!s.matchesError && s.matches.length === 0 ? (
          <p className="empty">
            No matches yet.{' '}
            <button type="button" className="link" onClick={() => s.openInstaller(null)}>
              Add a demo
            </button>{' '}
            to review it.
          </p>
        ) : null}
        {s.matches.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Map</th>
                  <th scope="col" className="n">
                    Score
                  </th>
                  <th scope="col">Played</th>
                  <th scope="col">Player</th>
                  <th scope="col" className="n">
                    Moments
                  </th>
                  <th scope="col">Review written by</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.matches.map((m) => {
                  const ready = m.status === 'complete';
                  const busy = BUSY.has(m.status);
                  return (
                    <tr key={m.id}>
                      <td>
                        <button
                          type="button"
                          className="row-open"
                          disabled={m.status === 'failed'}
                          onClick={() => (ready ? s.openStudio(m.id) : s.openInstaller(m.id))}
                          title={ready ? 'Open in the Studio' : m.status === 'awaiting_player' ? 'Pick the player to review' : busy ? 'Show the progress' : undefined}
                        >
                          {m.title ?? m.mapLabel}
                        </button>
                        {m.title ? <span className="meta"> {m.mapLabel}</span> : null}
                      </td>
                      <td className="n num">{m.status === 'failed' ? '' : m.score}</td>
                      <td className="num">{m.when}</td>
                      <td>
                        {busy ? (
                          <button type="button" className="link status-busy thinking" onClick={() => s.openInstaller(m.id)}>
                            {m.playerName ? `${m.playerName}, ` : ''}
                            {STATUS_LABEL[m.status]}
                          </button>
                        ) : m.playerName && ready ? (
                          m.playerName
                        ) : m.status === 'awaiting_player' ? (
                          <button type="button" className="link" onClick={() => s.openInstaller(m.id)}>
                            Pick a player
                          </button>
                        ) : (
                          <span className={m.status === 'failed' ? 'err' : 'meta'}>{STATUS_LABEL[m.status] ?? m.status}</span>
                        )}
                      </td>
                      <td className="n num">{ready ? m.moments : ''}</td>
                      <td>
                        {ready || (busy && m.playerName) ? (
                          <>
                            <span className="mono">{m.model ?? 'templates'}</span>
                            {m.versions ? (
                              <span className="meta">
                                {' '}
                                · {m.versions} earlier {m.versions === 1 ? 'review' : 'reviews'} kept
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                      <td className="row-actions">
                        {ready ? (
                          confirm === m.id ? (
                            <span className="confirm">
                              Review again with <span className="mono">{served ?? 'the templates'}</span>?{' '}
                              <button type="button" className="link" onClick={() => void rerun(m)}>
                                Re-run
                              </button>{' '}
                              <button type="button" className="link" onClick={() => setConfirm(null)}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="link" onClick={() => setConfirm(m.id)}>
                              Re-run the coach
                            </button>
                          )
                        ) : null}
                        <RowMenu
                          open={menu === m.id}
                          onToggle={(on) => setMenu(on ? m.id : null)}
                          items={[
                            { label: 'Rename…', run: () => setSheet({ kind: 'rename', match: m }) },
                            { label: m.versions ? `Earlier Reviews (${m.versions})` : 'Earlier Reviews', disabled: !m.versions, run: () => s.openReviews(m.id) },
                            ...(s.features?.shareLinks ? [{ label: 'Share Link…', disabled: !ready, run: () => setSheet({ kind: 'share', match: m }) }] : []),
                            'sep',
                            { label: 'Delete Match…', danger: true, disabled: busy, run: () => setSheet({ kind: 'delete', match: m }) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {sheet?.kind === 'rename' ? <RenameSheet m={sheet.match} onClose={() => setSheet(null)} /> : null}
        {sheet?.kind === 'share' ? <ShareSheet m={sheet.match} onClose={() => setSheet(null)} /> : null}
        {sheet?.kind === 'delete' ? <DeleteSheet m={sheet.match} onClose={() => setSheet(null)} /> : null}
        <p className="meta note-below">
          {served ? (
            <>
              A re-run uses the model llama-server is serving now, <span className="mono">{served}</span>.
            </>
          ) : (
            <>The coach model is off, so a re-run writes the review from the findings.</>
          )}{' '}
          To review with another model, start llama-server with it and check{' '}
          <button type="button" className="link" onClick={() => s.open('settings')}>
            Settings, System
          </button>
          . The earlier review is kept.
        </p>
      </div>
    </WindowFrame>
  );
}

type MenuItem = { label: string; run: () => void; disabled?: boolean; danger?: boolean } | 'sep';

/**
 * The "…" pop-up on a row, like Finder's action menu. Drawn on the page at the button's place,
 * because the table's rounded frame clips anything that overflows it.
 */
function RowMenu({ open, onToggle, items }: { open: boolean; onToggle: (on: boolean) => void; items: MenuItem[] }) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 3, right: window.innerWidth - r.right });
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) onToggle(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onToggle(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open, onToggle]);
  return (
    <span className="row-menu">
      <button ref={btn} type="button" className="more-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => onToggle(!open)}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {open && at
        ? createPortal(
            <div ref={menu} className="menu right floating" role="menu" style={{ top: at.top, right: at.right }}>
              {items.map((it, i) =>
                it === 'sep' ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    className={it.danger ? 'danger' : undefined}
                    disabled={it.disabled}
                    onClick={() => {
                      onToggle(false);
                      it.run();
                    }}
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function RenameSheet({ m, onClose }: { m: Match; onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(m.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`Rename ${m.title ?? m.mapLabel} ${m.score}`} onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.renameMatch(m.id, title.trim() || null);
            await s.refreshMatches();
            onClose();
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input className="field" value={title} placeholder={m.mapLabel} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <p className="meta">Leave it empty to show the map name again.</p>
        {error ? <p className="err">{error}</p> : null}
        <div className="sheet-btns">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-default" disabled={busy}>
            Rename
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function ShareSheet({ m, onClose }: { m: Match; onClose: () => void }) {
  const [shared, setShared] = useState<boolean | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .shareState(m.id)
      .then((x) => setShared(x.active))
      .catch((e) => setError(errorText(e)));
  }, [m.id]);

  async function make() {
    setError(null);
    try {
      const out = await api.share(m.id);
      setLink(`${window.location.origin}${out.path}`);
      setShared(true);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function stop() {
    setError(null);
    try {
      await api.unshare(m.id);
      setShared(false);
      setLink(null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Sheet title={`Share ${m.title ?? m.mapLabel} ${m.score}`} onClose={onClose} width={480}>
      <p className="meta">
        A read-only link to the moments, clips and explanations, with no Ask. Anyone who can reach this computer and holds the link can open it.
      </p>
      {shared === null && !error ? <p className="meta thinking">Checking</p> : null}
      {link ? <Secret value={link} note="Shown once. Stop sharing and make a new link to change it." /> : null}
      {shared && !link ? <p className="status-line">This match has a share link. It was shown when it was made.</p> : null}
      {error ? <p className="err">{error}</p> : null}
      <div className="sheet-btns">
        {shared ? (
          <button type="button" className="btn btn-danger" onClick={() => void stop()}>
            Stop Sharing
          </button>
        ) : null}
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
        {shared === false ? (
          <button type="button" className="btn btn-default" onClick={() => void make()}>
            Make Link
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}

function DeleteSheet({ m, onClose }: { m: Match; onClose: () => void }) {
  const s = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`Delete ${m.title ?? m.mapLabel} ${m.score}?`} onClose={onClose}>
      <p className="meta">The demo, its review, clips, notes and Ask history are deleted from this computer. This cannot be undone.</p>
      {error ? <p className="err">{error}</p> : null}
      <div className="sheet-btns">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.deleteMatch(m.id);
              await s.refreshMatches();
              onClose();
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Sheet>
  );
}
