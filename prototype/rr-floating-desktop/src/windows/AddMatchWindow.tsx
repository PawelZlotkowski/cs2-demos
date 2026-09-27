import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { Match as ApiMatch, StatusResponse } from '@/lib/contracts';
import { WindowFrame } from '../desktop/WindowFrame';
import { BUSY, errorText } from '../data/model';
import { mapName } from '../data/maps';
import { useStore } from '../state/store';

const POLL_MS = 1500;

export function AddMatchWindow() {
  const s = useStore();
  const [dragOver, setDragOver] = useState(false);
  const [workId, setWorkId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiMatch | null>(null);
  const [picking, setPicking] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const announced = useRef<string | null>(null);

  // The match to pick a player for: the one Matches asked about, else the upload once it is parsed, else any waiting match
  const waiting = s.matches.find((m) => m.status === 'awaiting_player' && m.id !== workId);
  const uploading = sent != null;
  const targetId =
    s.pickFor ??
    (uploading ? null : status?.status === 'awaiting_player' ? workId : !workId || status?.status === 'complete' || status?.status === 'failed' ? waiting?.id : null) ??
    null;

  useEffect(() => {
    if (s.pickFor) setWorkId(s.pickFor);
  }, [s.pickFor]);

  // Follow the work match's pipeline until it rests (a player to pick, complete or failed)
  useEffect(() => {
    if (!workId) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      try {
        const st = await api.getStatus(workId);
        if (stop) return;
        setStatus(st);
        if (BUSY.has(st.status)) timer = window.setTimeout(poll, POLL_MS);
        else void s.refreshMatches();
      } catch (e) {
        if (!stop) setError(errorText(e));
      }
    };
    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [workId, pollKey, s.refreshMatches]);

  useEffect(() => {
    setDetail(null);
    if (!targetId) return;
    api
      .getMatch(targetId)
      .then(setDetail)
      .catch((e) => setError(errorText(e)));
  }, [targetId]);

  useEffect(() => {
    if (!workId || status?.status !== 'complete' || announced.current === workId) return;
    announced.current = workId;
    const m = s.matches.find((x) => x.id === workId);
    s.notify({
      title: `Review ready${m ? `: ${m.mapLabel} ${m.score}` : ''}`,
      body: `${m?.playerName ?? 'The player'}, ${m?.model ?? 'templates'}. Moments and clips are in the Studio.`,
      action: { label: 'Open in Studio', run: () => s.openStudio(workId) },
    });
  }, [status?.status, workId, s]);

  async function upload(file: File) {
    setError(null);
    setStatus(null);
    setWorkId(null);
    setFileName(file.name);
    setSent(0);
    s.openPicker(null);
    try {
      const res = await api.upload(file, (n, total) => setSent(total ? n / total : 0));
      setSent(null);
      setWorkId(res.id);
      void s.refreshMatches();
    } catch (e) {
      setSent(null);
      setError(errorText(e));
    }
  }

  async function pick(matchId: string, playerId: string) {
    setPicking(true);
    setError(null);
    try {
      const st = await api.selectPlayer(matchId, playerId, s.language);
      s.openPicker(null);
      setWorkId(matchId);
      setStatus(st);
      setPollKey((k) => k + 1);
      void s.refreshMatches();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPicking(false);
    }
  }

  const work = workId ? s.matches.find((m) => m.id === workId) : null;
  const resting = !workId || status?.status === 'complete' || status?.status === 'failed';
  const roster = detail?.players ?? [];
  const coached = new Set(s.players.map((p) => p.id));

  return (
    <WindowFrame id="addMatch" subtitle="A .dem or .dem.zst from CS2" minW={420}>
      <div className="page">
        {resting && !uploading ? (
          <div
            className={`drop${dragOver ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
          >
            <b>Drop a demo here</b>
            <span>The file goes to the API on this computer. Parsing a full match takes about a minute.</span>
            <div className="ds-actions">
              <button type="button" className="btn btn-default" onClick={() => fileRef.current?.click()}>
                Choose file…
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".dem,.zst"
              hidden
              data-testid="demo-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
          </div>
        ) : null}

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        {uploading ? (
          <section className="sec">
            <div className="sec-h">
              <h2>{fileName}</h2>
              <span className="meta num">{Math.round((sent ?? 0) * 100)}%</span>
            </div>
            <p className="meta thinking">Uploading</p>
          </section>
        ) : null}

        {workId && status ? (
          <section className="sec">
            <div className="sec-h">
              <h2>{status.status === 'complete' ? 'Done' : status.status === 'failed' ? 'Could not process the demo' : (fileName ?? work?.mapLabel ?? 'Processing')}</h2>
              {work ? (
                <span className="meta">
                  {work.mapLabel} {work.score}
                </span>
              ) : null}
            </div>
            <ol className="pipeline">
              {status.stages.map((st) => (
                <li key={st.id} data-s={st.state === 'done' ? 'done' : st.state === 'active' ? 'now' : st.state === 'error' ? 'error' : 'todo'}>
                  <span className="pip" aria-hidden />
                  <span>{st.label}</span>
                  {st.progress ? (
                    <span className="meta num">
                      {st.progress.done}/{st.progress.total}
                    </span>
                  ) : st.detail ? (
                    <span className="meta">{st.detail}</span>
                  ) : st.id === 'awaiting_player' && st.state === 'done' && work?.playerName ? (
                    <span className="meta">{work.playerName}</span>
                  ) : null}
                </li>
              ))}
            </ol>
            {status.status === 'failed' ? <p className="err">{status.error ?? 'The pipeline stopped.'}</p> : null}
            {status.status === 'complete' ? (
              <div className="ds-actions">
                <button type="button" className="btn btn-default" onClick={() => s.openStudio(workId)}>
                  Open in Studio
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWorkId(null);
                    setStatus(null);
                    setFileName(null);
                  }}
                >
                  Add another
                </button>
              </div>
            ) : status.status !== 'failed' ? (
              <p className="meta">The radar works as soon as a player is picked; clips fill in afterwards.</p>
            ) : null}
          </section>
        ) : null}

        {targetId && detail ? (
          <section className="sec">
            <div className="sec-h">
              <h2>Who should the coach review?</h2>
              <span className="meta">
                {mapName(detail.mapName ?? detail.map)} {detail.score}, {detail.rounds} rounds
              </span>
            </div>
            {roster.length ? (
              <div className="picker">
                {(['CT', 'T'] as const).map((team) => (
                  <div className="pick-team" key={team}>
                    <h3>{team === 'CT' ? 'Started on CT' : 'Started on T'}</h3>
                    {roster
                      .filter((p) => p.team === team)
                      .map((p) => (
                        <button key={p.id} type="button" className="pick-row" disabled={picking} onClick={() => void pick(targetId, p.id)}>
                          <span>
                            {p.name}
                            {coached.has(p.id) ? <span className="meta"> · reviewed before</span> : null}
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="meta">The demo has no player list.</p>
            )}
          </section>
        ) : null}
      </div>
    </WindowFrame>
  );
}
