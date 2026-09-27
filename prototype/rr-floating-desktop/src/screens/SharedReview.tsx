import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { SharedReview as Shared } from '@/lib/contracts';
import { errorText } from '@/lib/format';
import { mapName } from '../data/maps';
import { clockShort } from '../ui/time';

/**
 * A shared review (A14), opened from a share link without signing in: one read-only window on the
 * wallpaper, like a Quick Look preview. Moments, clips and explanations; no Ask, no menu bar.
 */
export function SharedReview({ token }: { token: string }) {
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .shared(token)
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [token]);

  return (
    <div className="desktop shared">
      <div className="win focused entered shared-win" role="main" aria-label="Shared review">
        <div className="titlebar">
          <div className="lights" aria-hidden>
            <span className="light close" />
            <span className="light min" />
            <span className="light zoom" />
          </div>
          <div className="win-title">
            <b>{data ? `${data.playerName ?? 'Player'} on ${data.map ? mapName(data.map) : 'a map'}` : 'Shared review'}</b>
            {data?.score ? <span className="num">{data.score}</span> : null}
          </div>
        </div>
        <div className="win-body">
          <div className="page narrow">
            {error ? (
              <p className="empty">{error}</p>
            ) : !data ? (
              <p className="meta thinking">Loading</p>
            ) : (
              <>
                <p className="lede">A review from Round Reviewer, shared read-only.</p>
                {data.explanations.summary ? <p className="coach-voice">{data.explanations.summary}</p> : null}
                <ol className="version-moments">
                  {data.moments.map((m, i) => (
                    <li key={m.id} data-kind={m.kind}>
                      <h3>
                        <span className="num">{String(i + 1).padStart(2, '0')}</span>
                        <i className={`g g-${m.kind === 'good' ? 'strength' : 'mistake'}`} aria-hidden />
                        Round {m.round}, {clockShort(m.t0)}
                      </h3>
                      {m.clip ? <video className="shared-clip" src={api.mediaUrl(m.clip)} controls preload="metadata" /> : null}
                      <p className="coach-voice">{data.explanations[m.id] ?? m.pickedBecause}</p>
                    </li>
                  ))}
                </ol>
                {data.explanations.wrapup ? (
                  <section className="sec">
                    <div className="sec-h">
                      <h2>Wrap-up</h2>
                    </div>
                    <p className="coach-voice">{data.explanations.wrapup}</p>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
