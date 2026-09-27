import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { WindowFrame } from '../desktop/WindowFrame';
import { BUSY, errorText, type Match, type MatchStatus } from '../data/model';
import { useStore } from '../state/store';

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

export function MatchesWindow() {
  const s = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rerunning = useRef(new Set<string>());
  const served = s.system?.checks.find((c) => c.name === 'llm')?.state === 'ok' ? s.system.llmModel : null;

  // A re-run finishes in the background; say so when its row turns complete again
  useEffect(() => {
    for (const m of s.matches) {
      if (!rerunning.current.has(m.id) || BUSY.has(m.status)) continue;
      rerunning.current.delete(m.id);
      if (m.status === 'complete')
        s.notify({
          title: `Review ready: ${m.mapLabel} ${m.score}`,
          body: `Written again by ${m.model ?? 'the templates'}. The earlier review is kept.`,
          action: { label: 'Open in Studio', run: () => s.openStudio(m.id) },
        });
    }
  }, [s.matches, s]);

  async function rerun(m: Match) {
    setConfirm(null);
    setError(null);
    try {
      await api.rerunCoach(m.id, s.language);
      rerunning.current.add(m.id);
      await s.refreshMatches();
    } catch (e) {
      setError(`${m.mapLabel} ${m.score}: ${errorText(e)}`);
    }
  }

  const done = s.matches.filter((m) => m.status === 'complete').length;

  return (
    <WindowFrame
      id="matches"
      subtitle={s.matchesError ? 'The API is not answering' : `${s.matches.length} ${s.matches.length === 1 ? 'match' : 'matches'} on this computer, ${done} reviewed`}
      toolbar={
        <button type="button" className="btn btn-default" onClick={() => s.openPicker(null)}>
          Add match
        </button>
      }
      minW={640}
    >
      <div className="page">
        <p className="lede">Every match on this computer, newest first, with the model that wrote its review.</p>
        {s.matchesError ? (
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
            <button type="button" className="link" onClick={() => s.openPicker(null)}>
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
                          disabled={busy || m.status === 'failed'}
                          onClick={() => (ready ? s.openStudio(m.id) : s.openPicker(m.id))}
                          title={ready ? 'Open in the Studio' : m.status === 'awaiting_player' ? 'Pick the player to review' : undefined}
                        >
                          {m.mapLabel}
                        </button>
                      </td>
                      <td className="n num">{m.status === 'failed' ? '' : m.score}</td>
                      <td className="num">{m.when}</td>
                      <td>
                        {busy ? (
                          <span className="status-busy thinking">
                            {m.playerName ? `${m.playerName}, ` : ''}
                            {STATUS_LABEL[m.status]}
                          </span>
                        ) : m.playerName && ready ? (
                          m.playerName
                        ) : m.status === 'awaiting_player' ? (
                          <button type="button" className="link" onClick={() => s.openPicker(m.id)}>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
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
