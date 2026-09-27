import { useState } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { FINDINGS, SERVED_MODEL, mapName, momentsFor, type Match, type MatchStatus } from '../mock/world';
import { useStore } from '../state/store';

const STATUS_LABEL: Partial<Record<MatchStatus, string>> = {
  awaiting_player: 'Pick a player',
  failed: 'Failed',
  selecting: 'Picking moments',
  recording: 'Recording clips',
  explaining: 'Writing the review',
  uploaded: 'Uploaded',
  decompressing: 'Decompressing',
  parsing: 'Reading the demo',
  normalizing: 'Preparing the replay',
  detecting: 'Looking for mistakes',
};

const RERUN: MatchStatus[] = ['selecting', 'explaining', 'complete'];

export function MatchesWindow() {
  const s = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);

  function rerun(m: Match) {
    setConfirm(null);
    RERUN.forEach((status, i) =>
      window.setTimeout(() => {
        s.setMatches((all) =>
          all.map((x) =>
            x.id === m.id ? { ...x, status, ...(status === 'complete' ? { model: SERVED_MODEL, versions: x.versions + 1 } : {}) } : x,
          ),
        );
        if (status === 'complete')
          s.notify({
            title: `Review ready: ${mapName(m.map)} ${m.us}–${m.them}`,
            body: `Written again by ${SERVED_MODEL}. The earlier review is kept.`,
            action: { label: 'Open in Studio', run: () => s.openStudio(m.id) },
          });
      }, 400 + i * 1400),
    );
  }

  const done = s.matches.filter((m) => m.status === 'complete').length;

  return (
    <WindowFrame
      id="matches"
      subtitle={`${s.matches.length} matches on this computer, ${done} reviewed`}
      toolbar={
        <button type="button" className="btn btn-default" onClick={() => s.open('addMatch')}>
          Add match
        </button>
      }
      minW={640}
    >
      <div className="page">
        <p className="lede">Every match on this computer, newest first, with the model that wrote its review.</p>
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
                const busy = !ready && m.status !== 'failed' && m.status !== 'awaiting_player';
                return (
                  <tr key={m.id}>
                    <td>
                      <button
                        type="button"
                        className="row-open"
                        disabled={busy || m.status === 'failed'}
                        onClick={() => (ready ? s.openStudio(m.id) : s.open('addMatch'))}
                        title={ready ? 'Open in the Studio' : m.status === 'awaiting_player' ? 'Pick the player to review' : undefined}
                      >
                        {mapName(m.map)}
                      </button>
                    </td>
                    <td className="n num">{m.status === 'failed' ? '' : `${m.us}–${m.them}`}</td>
                    <td className="num">{m.when}</td>
                    <td>
                      {m.playerName && ready ? (
                        m.playerName
                      ) : busy ? (
                        <span className="status-busy thinking">{STATUS_LABEL[m.status]}</span>
                      ) : m.status === 'awaiting_player' ? (
                        <button type="button" className="link" onClick={() => s.open('addMatch')}>
                          Pick a player
                        </button>
                      ) : (
                        <span className={m.status === 'failed' ? 'err' : 'meta'} title={m.error}>
                          {STATUS_LABEL[m.status] ?? m.status}
                        </span>
                      )}
                    </td>
                    <td className="n num">{ready && FINDINGS[m.id] ? momentsFor(m.id).length : ''}</td>
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
                      ) : m.status === 'failed' ? (
                        <span className="meta">{m.error}</span>
                      ) : null}
                    </td>
                    <td className="row-actions">
                      {ready ? (
                        confirm === m.id ? (
                          <span className="confirm">
                            Review again with <span className="mono">{SERVED_MODEL}</span>?{' '}
                            <button type="button" className="link" onClick={() => rerun(m)}>
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
        <p className="meta note-below">
          A re-run uses the model llama-server is serving now, <span className="mono">{SERVED_MODEL}</span>. To review with another model, start
          llama-server with it and check{' '}
          <button type="button" className="link" onClick={() => s.open('settings')}>
            Settings, System
          </button>
          . The earlier review is kept.
        </p>
      </div>
    </WindowFrame>
  );
}
