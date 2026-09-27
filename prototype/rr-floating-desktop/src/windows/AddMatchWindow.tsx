import { useEffect, useRef, useState } from 'react';
import { WindowFrame } from '../desktop/WindowFrame';
import { ENEMY, FINDINGS, SERVED_MODEL, TEAM, YOU, mapName, type Match, type MatchStatus } from '../mock/world';
import { useStore } from '../state/store';

const BEFORE: [MatchStatus, string][] = [
  ['uploaded', 'Uploaded'],
  ['decompressing', 'Decompressing'],
  ['parsing', 'Reading the demo'],
  ['normalizing', 'Preparing the replay'],
];

const AFTER: [MatchStatus, string][] = [
  ['detecting', 'Looking for mistakes and good plays'],
  ['selecting', 'Picking the moments to review'],
  ['recording', 'Recording first-person clips'],
  ['explaining', 'Writing the review'],
];

const STEP_MS = 900;

const KD: Record<string, string> = {
  kestrel: '19 / 14', halvard: '17 / 15', 'mirek_': '21 / 12', oso: '12 / 16', tamsin: '14 / 17',
  vantablk: '18 / 16', jorvik: '20 / 15', deltaseven: '13 / 18', rumbo: '15 / 17', 'kiwi_ow': '11 / 19',
};

export function AddMatchWindow() {
  const s = useStore();
  const [dragOver, setDragOver] = useState(false);
  const [workId, setWorkId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const waiting = s.matches.find((m) => m.status === 'awaiting_player' && m.id !== workId);
  const work = workId ? s.matches.find((m) => m.id === workId) : null;

  const setStatus = (id: string, status: MatchStatus, extra: Partial<Match> = {}) =>
    s.setMatches((all) => all.map((m) => (m.id === id ? { ...m, status, ...extra } : m)));

  function run(id: string, steps: [MatchStatus, string][], then?: () => void) {
    steps.forEach(([status], i) => timers.current.push(window.setTimeout(() => setStatus(id, status), i * STEP_MS)));
    timers.current.push(window.setTimeout(() => then?.(), steps.length * STEP_MS));
  }

  function upload(name: string) {
    const id = `u${Date.now().toString(36)}`;
    setFileName(name);
    setWorkId(id);
    s.setMatches((all) => [
      { id, ref: null, map: 'de_mirage', us: 13, them: 8, when: 'Just now', status: 'uploaded', playerName: null, model: null, versions: 0 },
      ...all,
    ]);
    run(id, BEFORE, () => setStatus(id, 'awaiting_player'));
  }

  function pick(match: Match, player: string) {
    setWorkId(match.id);
    const source = match.map === 'de_anubis' ? 'm4' : 'm5';
    FINDINGS[match.id] = FINDINGS[source].map((f) => ({ ...f, matchId: match.id }));
    setStatus(match.id, 'detecting', { playerName: player, model: SERVED_MODEL });
    run(match.id, AFTER, () => {
      const refs = s.matches.map((m) => Number(m.ref?.slice(1) ?? 0));
      setStatus(match.id, 'complete', { ref: `M${Math.max(...refs) + 1}` });
      s.notify({
        title: `Review ready: ${mapName(match.map)} ${match.us}–${match.them}`,
        body: `${player}, ${SERVED_MODEL}. Moments and clips are in the Studio.`,
        action: { label: 'Open in Studio', run: () => s.openStudio(match.id) },
      });
    });
  }

  const target = work && work.status === 'awaiting_player' ? work : !work || work.status === 'complete' ? waiting : null;
  const steps = [...BEFORE, ['awaiting_player', 'Pick the player to review'] as [MatchStatus, string], ...AFTER, ['complete', 'Review ready'] as [MatchStatus, string]];
  const at = work ? steps.findIndex(([st]) => st === work.status) : -1;

  return (
    <WindowFrame id="addMatch" subtitle="A .dem or .dem.zst from CS2" minW={420}>
      <div className="page">
        {!work || work.status === 'complete' ? (
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
              if (f) upload(f.name);
            }}
          >
            <b>Drop a demo here</b>
            <span>The file stays on this computer. Parsing a full match takes about a minute.</span>
            <div className="ds-actions">
              <button type="button" className="btn btn-default" onClick={() => fileRef.current?.click()}>
                Choose file…
              </button>
              <button type="button" className="btn" onClick={() => upload('sample_mirage.dem.zst')}>
                Use the sample demo
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".dem,.zst"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f.name);
                e.target.value = '';
              }}
            />
          </div>
        ) : null}

        {work ? (
          <section className="sec">
            <div className="sec-h">
              <h2>{work.status === 'complete' ? 'Done' : fileName ?? `${mapName(work.map)} ${work.us}–${work.them}`}</h2>
              <span className="meta">
                {mapName(work.map)} {work.us}–{work.them}
              </span>
            </div>
            <ol className="pipeline">
              {steps.map(([st, label], i) => (
                <li key={st} data-s={i < at || work.status === 'complete' ? 'done' : i === at ? 'now' : 'todo'}>
                  <span className="pip" aria-hidden />
                  <span>{label}</span>
                  {st === 'awaiting_player' && i < at ? <span className="meta">{work.playerName}</span> : null}
                </li>
              ))}
            </ol>
            {work.status === 'complete' ? (
              <div className="ds-actions">
                <button type="button" className="btn btn-default" onClick={() => s.openStudio(work.id)}>
                  Open in Studio
                </button>
                <button type="button" className="btn" onClick={() => setWorkId(null)}>
                  Add another
                </button>
              </div>
            ) : (
              <p className="meta">The radar works as soon as a player is picked; clips fill in afterwards.</p>
            )}
          </section>
        ) : null}

        {target ? (
          <section className="sec">
            <div className="sec-h">
              <h2>Who should the coach review?</h2>
              <span className="meta">
                {mapName(target.map)} {target.us}–{target.them}, {target.when}
              </span>
            </div>
            <div className="picker">
              {[
                ['Your team', TEAM],
                ['Opponents', ENEMY],
              ].map(([name, list]) => (
                <div className="pick-team" key={name as string}>
                  <h3>{name as string}</h3>
                  {(list as string[]).map((p) => (
                    <button key={p} type="button" className="pick-row" onClick={() => pick(target, p)}>
                      <span>
                        {p}
                        {p === YOU ? <span className="meta"> · last picked</span> : null}
                      </span>
                      <span className="meta num">{KD[p]}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </WindowFrame>
  );
}
