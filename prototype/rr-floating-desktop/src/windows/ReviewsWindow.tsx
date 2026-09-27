import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { ReviewVersion } from '@/lib/contracts';
import { errorText, when } from '@/lib/format';
import { WindowFrame } from '../desktop/WindowFrame';
import { useStore } from '../state/store';
import { CoachText } from '../ui/CoachText';
import { clockShort } from '../ui/time';

/**
 * Earlier reviews of one match (AD09): each re-run keeps the review it replaced, so the player can
 * read what another model, or the same model before a change, said about the same demo. Like the
 * Versions browser: the list of versions on the left, the chosen one read-only on the right.
 */
export function ReviewsWindow() {
  const s = useStore();
  const matchId = s.reviewsFor;
  const match = s.matches.find((m) => m.id === matchId);
  const [list, setList] = useState<Omit<ReviewVersion, 'playerId'>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let live = true;
    setList(null);
    setError(null);
    api
      .getVersions(matchId)
      .then((v) => {
        if (!live) return;
        const newest = [...v].reverse();
        setList(newest);
        setPick(newest[0]?.id ?? null);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [matchId]);

  const v = list?.find((x) => x.id === pick) ?? null;
  const text = new Map((v?.explanations ?? []).map((e) => [e.target, e.text]));

  return (
    <WindowFrame
      id="reviews"
      subtitle={match ? `${match.title ?? match.mapLabel} ${match.score}` : undefined}
      minW={560}
      flush
      toolbar={
        matchId ? (
          <button type="button" className="btn" onClick={() => s.openStudio(matchId)}>
            Open Current Review
          </button>
        ) : null
      }
    >
      {!matchId ? (
        <div className="page">
          <p className="empty">Pick a match in Matches, then Earlier reviews.</p>
        </div>
      ) : error ? (
        <div className="page">
          <p className="err">{error}</p>
        </div>
      ) : !list ? (
        <div className="page">
          <p className="meta thinking">Loading</p>
        </div>
      ) : list.length === 0 ? (
        <div className="page">
          <p className="empty">No earlier reviews. Re-running the coach from Matches keeps the review it replaces here.</p>
        </div>
      ) : (
        <div className="split narrow-source">
          <nav className="source" aria-label="Earlier reviews">
            <p className="source-h">Replaced, newest first</p>
            {list.map((x) => (
              <button key={x.id} type="button" className="source-item two" aria-current={x.id === pick ? 'page' : undefined} onClick={() => setPick(x.id)}>
                <span className="mono">{x.model}</span>
                <span className="meta">{when(x.createdAt)}</span>
              </button>
            ))}
          </nav>
          <div className="split-body">
            {v ? (
              <div className="pane">
                <header className="pane-h">
                  <div>
                    <h1 className="mono">{v.model}</h1>
                    <p className="lede">
                      Written {when(v.createdAt)} · {v.moments.length} moments. Read-only.
                    </p>
                  </div>
                </header>
                {text.get('summary') ? (
                  <p className="coach-voice">
                    <CoachText text={text.get('summary') ?? ''} />
                  </p>
                ) : null}
                <ol className="version-moments">
                  {v.moments.map((m, i) => (
                    <li key={m.id} data-kind={m.kind}>
                      <h3>
                        <span className="num">{String(i + 1).padStart(2, '0')}</span>
                        <i className={`g g-${m.kind === 'good' ? 'strength' : 'mistake'}`} aria-hidden />
                        Round {m.round}, {clockShort(m.t0)}
                      </h3>
                      <p className="coach-voice">
                        <CoachText text={text.get(m.id) ?? m.pickedBecause} />
                      </p>
                    </li>
                  ))}
                </ol>
                {text.get('wrapup') ? (
                  <section className="sec">
                    <div className="sec-h">
                      <h2>Wrap-up</h2>
                    </div>
                    <p className="coach-voice">
                      <CoachText text={text.get('wrapup') ?? ''} />
                    </p>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </WindowFrame>
  );
}
