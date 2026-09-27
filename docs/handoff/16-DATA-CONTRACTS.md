# 16 Data contracts

Related: [15 Implementation](./15-IMPLEMENTATION-ARCHITECTURE.md), [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [09 Coach](./09-AI-COACH.md), [10 Personalisation](./10-PERSONALIZATION.md)

The prototype has no type definitions. The shapes below are **as used in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html)**, written as TypeScript for clarity. Anything marked *planned* is a proposal for the backend contract, not an existing API.

## Provenance legend

Every field gets exactly one:

- **ENGINE**: measured or computed by deterministic code. This is the source of truth.
- **DERIVED**: computed by code from engine data, such as ranking, labels, overlay geometry and history counts.
- **LLM**: generated text. It must cite ENGINE findings and must never introduce numbers that aren't in them.
- **EDITORIAL**: a product copy template.

In the prototype, **all fields are hand-authored sample data**. The provenance column says where they must come from in production.

## Match

```ts
type Match = {
  map: string;            // ENGINE
  score: string;          // ENGINE, e.g. "11–13"
  when: string;           // ENGINE timestamp, formatted
  rounds: number;         // ENGINE
  won: (0|1)[];           // ENGINE, per round, player's team
};
```

## Moment (selected, 5 or 6 per match)

```ts
type Kind = "mistake" | "strength" | "opportunity";
type Moment = {
  id: string;
  round: number;          // ENGINE
  clockStart: number;     // ENGINE  round clock (s) at clip t=0
  key: number;            // ENGINE  clip time (s) of the decision
  kind: Kind;             // DERIVED (detector class)
  cat: string;            // DERIVED ("Peek", "Rotation", ...)
  side: "T" | "CT";       // ENGINE
  title: string;          // LLM or EDITORIAL, short noun phrase
  label: string;          // DERIVED  shared stage/timeline/panel label, 1 to 3 words
  pick: string;           // DERIVED  ranking reason ("Lost mid control and the round")
  finding: string;        // LLM  one sentence, must match ev
  why: string;            // LLM  two lines
  instead: string;        // LLM  one actionable sentence
  pattern: { text: string /* LLM, from counts */; last7: (0|1)[] /* DERIVED from history */ };
  related: number[];      // DERIVED  other moment indexes
  ev: [label: string, value: string, findingId: string, clipTime: number][]; // ENGINE (value may be formatted)
  bracket: [t0: number, t1: number, label: string] | null; // DERIVED
  zones: string[];        // DERIVED  map callouts to label on the radar
  youDeath?: number;      // ENGINE
  players: Track[];       // ENGINE
  rov: RadarOverlay[];    // DERIVED
  cam: [t: number, yaw: number][];            // mock only (placeholder clip camera)
  gtracks: Record<string, {p: [t:number,x:number,y:number,scale:number][]; vis:[number,number]}>; // DERIVED from projection (unknown)
  gov: GameOverlay[];     // DERIVED
  events: TimelineEvent[];// ENGINE (+ DERIVED insight markers)
  qa: [question: string, answer: string][];   // mock only; production answers come from the Coach
};
```

## Track and radar state

```ts
type Track = {
  n: string;                  // player name (ENGINE)
  r: "you" | "team" | "enemy";
  p: [t: number, x: number, y: number][];  // ENGINE, map units 0 to 100 in the prototype
  f?: 1;                      // DERIVED  include in camera framing
  from?: number;              // ENGINE  first time the enemy is known to the player's team
  death?: number;             // ENGINE
};
type RadarOverlay =
  | {type:"zone"; pts:[number,number][]; label?:string; lx?:number; ly?:number} & Win
  | {type:"sight"; x1:number;y1:number;x2:number;y2:number; good?:boolean} & Win
  | {type:"smoke"; x:number;y:number;r:number; label?:string; good?:boolean} & Win
  | {type:"link"; a:number; b:number; label:string} & Win      // player indexes
  | {type:"mark"; pl:number; at:number; label:string} & Win;   // point on a path
type Win = { t0:number; t1:number; pri:1|2 };
```

**Radar state at time t** is not stored. It is computed from tracks and overlays by `renderRadar()`. The camera is `{x,y,w,h}` in map units.

## Annotation (gameplay overlay)

```ts
type GameOverlay =
  | {type:"anno"; at:{track:string}|{x:number;y:number}; side?:"left"|"right"; lab?:string; g?:Kind|"note"; text:string} & Win
  | {type:"ring"|"los"; track:string; to?:[number,number]} & Win
  | {type:"zone"; pts:[number,number][]} & Win
  | {type:"arrow"; d:string} & Win
  | {type:"blob"; x:number;y:number;r:number} & Win
  | {type:"line"; x1:number;y1:number;x2:number;y2:number} & Win;
// coordinates: 160×90 overlay space over the 16:9 stage
```

## Timeline event

```ts
type Lane = "insight" | "you" | "team" | "enemy" | "util";
type Glyph = Kind | "note" | "kill" | "death" | "spot" | "smoke" | "flash" | "move" | "sound" | "plant";
type TimelineEvent = [lane: Lane, clipTime: number, glyph: Glyph, label: string, findingId?: string];
```

The `insight` events carry the moment `label`. The linked "live" state matches `gov[].lab` against the event label; a stable ID is planned.

## Findings (engine, planned contract)

**Superseded (26 Sep 2026):** the planned contract is in the [AI Coach plan §4.4](../coach/AI-COACH-PLAN.md#44-finding-contract) (Pydantic `Finding` with `evidence`, `severity`, `zone`, `summary`, plus `RoundStats`). The older sketch below is kept for history.

### Migration note (task T12, 26 Sep 2026)

Implemented in `apps/api/app/models/contracts.py`, mirrored in `apps/web/src/lib/contracts/index.ts`.

- **`Finding` replaced.** Old fields → new: `type` → `detector` (plus `kind`); `clipTime` → `t` (round clock seconds, the replay clock; clip time is derived per moment); `players` → `playerId` + `otherIds`; `metrics` → `evidence`. New: `zone`, `severity` (0..1), `summary` (English template), `template` (key of the en/pl/nl summary template, used for the fallback text). Nothing read the old model, so no data migration.
- **New:** `RoundStats` (per round, coached player), `SelectedMoment` (`id`, `round`, `t0`, `t1`, `findingIds`, `kind`, `pickedBecause`, `score`, `source` = `ranker` | `agent`), `PlayerSelectRequest`, `PlayerAnalysis`. `Match.selectedPlayerId`.
- **`MatchStatus`:** removed the unused legacy stubs `reconstructing`, `ranking`, `rendering`, `analyzing`; added `awaiting_player`, `selecting`, `recording`, `explaining` (plan §3). `REPLAY_READY_STATUSES` (both languages) lists the statuses in which the Radar can load.
- **Provenance:** `Finding` and `RoundStats` are ENGINE; `SelectedMoment` is DERIVED when `source` is `ranker`, LLM-chosen (verified) when `agent`.
- **Storage:** SQLite `findings`, `round_stats`, `moments`, `match_players` in `matches.db`; parse output for the detectors in `data/matches/<id>/analysis.json` (not served to the browser).
- **Routes:** `POST /matches/{id}/player`, `GET /matches/{id}/players/{pid}/findings?round=&kind=&detector=`, `…/round-stats`, `…/moments`.

### Migration note (tasks T24–T27, 26 Sep 2026)

Pydantic only in `contracts.py`; the TypeScript mirror is left for the UI tasks (T42, T43, T45), because phase 2 did not touch `apps/web`.

- **New:** `CoachLanguage` (`en` | `pl` | `nl`), `MomentExplanation` (`target` = `m3` or `r12`, `lang`, `text` with citation tokens, `citations`, `findingIds`, `source` = `agent` | `template`, `verifierErrors`, `model`, `promptVersion`), `ExplainRequest` (`language`), `AskRequest` (`question`, `language`, `round?`, `t?`, `momentId?`, `view?`).
- **Changed:** `PlayerSelectRequest.language` (optional, default `en`): the language the stored explanations are written in.
- **Provenance:** `MomentExplanation` with `source: agent` is LLM text that passed the verifier; `template` is the finding templates (ENGINE numbers, fixed wording).
- **Storage:** SQLite `explanations` (match, player, target, lang). The agent's picks replace the ranker's rows in `moments` (`source: agent`) and clear the moment explanations.
- **Routes:** `GET /matches/{id}/players/{pid}/moments/{mid}/explanation?lang=`, `POST …/rounds/{n}/explain` (`?refresh=true` to rewrite), `POST …/ask` (server-sent events: `step` per tool call, then one `answer` `{answer, citations, source, verified}`; `error` on failure). The legacy mocked `POST /matches/{id}/coach` is unchanged.

### Migration note (doc 29: R01, R03, R05, 27 Sep 2026)

Pydantic in `contracts.py`, mirrored in `apps/web/src/lib/contracts/` (also `CoachedPlayer` for `GET /players` and `Features` for `GET /features`).

- **New:** `SystemStatus` (`ok`, `llmModel`, `servedModels`, `mcpTools`, `checks`) with `SystemCheck` (`name` = `llm` | `mcp` | `csdm` | `knowledge` | `traces`, `state` = `ok` | `off` | `problem`, `detail`). `TracePage` (`items`, `total`) of `TraceSummary` (`id` = `<date>:<line>`, `ts`, `job`, `matchId`, `playerId`, `lang`, `model`, `source`, `verifierOk`, `repaired`, `latencyS`, `toolCalls`); `TraceDetail` adds `steps` (`tool`, `args`, `resultBytes`, `ms`, `error`), `knowledgeIds`, `verifierErrors`, `output`, `fallback` and the raw `record`. `CoachAskRequest` (`question`, `language`).
- **Citations:** a finding from another match is cited as `M2:F3`: the match ref from `list_matches` (`M1` is the player's oldest analysed match) and the finding id in that match.
- **Routes:** `GET /system`; `GET /lab/traces?job=&matchId=&source=&limit=&offset=` and `GET /lab/traces/{id}` (404 unless `RR_LAB_ENABLED`); `POST /players/{pid}/ask` (same events as the Ask tab; the `answer` event adds `matches`, cited ref to match id).
- **MCP tools:** `list_matches(player_id, map?)` and `find_moments(player_id, detector?, kind?, zone?, map?, limit?)`.

### Migration note (doc 29: R04, R07–R18, 27 Sep 2026)

All in `contracts.py` and mirrored in `apps/web/src/lib/contracts/`; routes in `apps/api/app/api/roadmap.py`.

- **Studio:** `Bookmark` (`id` = `b<n>`, `round`, `t`, `note`, `createdAt`) via `GET`/`POST /matches/{id}/bookmarks` and `DELETE …/bookmarks/{bid}`; `POST /matches/{id}/players/{pid}/bookmarks/{bid}/explain` returns a `MomentExplanation` whose `target` is the window `w<round>:<t0>-<t1>` (6 s before the note to 4 s after). `GoodExamples` (`zone`, `items` of `GoodExample`: `id` = `M2:F7`, `matchId`, `findingId`, `round`, `t`, `zone`, `summary`, `sameMatch`) from `GET …/findings/{fid}/done-well`. `GET …/clips/{cid}.mp4?download=1` names the file after map, player, round, what happened and time.
- **Coach page:** `PracticePlan` (`playerId`, `lang`, `text`, `citations`, `source`, `matches`, `items`, `createdAt`) of `PlanItem` (`detector`, `label`, `matchesWith`, `matchesTotal`, `per10Recent`, `per10Before`, `example`, `drillId`, `drillTitle`, `drillText`, `done`, `doneAt`): `GET`/`POST /players/{pid}/plan?lang=`, `PUT /players/{pid}/plan/{detector}` (`{done}`). `KnowledgeRow` (passage fields plus `zones`, `cited`, `flags`) from `GET /knowledge?map=&zone=&q=`; `MapZone` (`name`, `polygons` in radar pixels) from `GET /maps/{map}/zones`; `POST /knowledge/{id}/flag` (`{note}`); `POST /knowledge/notes` (`KnowledgeNoteRequest`, Lab only).
- **Matches, Progress:** `MatchRow` (`id`, `map`, `score`, `when`, `status`, `playerId`, `playerName`, `moments`, `model`, `versions`) from `GET /matches`; `POST /matches/{id}/rerun` (`{language}`) keeps the old moments and explanations (`GET /matches/{id}/versions`) and runs the pipeline again. `ProgressResponse` (`matches` of `ProgressMatch`, `detectors` of `ProgressDetector` with one count per match, `zones` of `ProgressZone` with deaths and `M2:F3` examples) from `GET /players/{pid}/progress`.
- **Lab** (404 unless `RR_LAB_ENABLED`): `RoundLabel` is exactly a `data/labels` JSONL line (`LabelVerdict`, `MissedEvent`), `PUT /lab/labels`, `GET /lab/labels/{mid}/{pid}?labeller=`, `GET /lab/labels/summary?a=&b=`; `MomentPicks` (`MomentPickRow` up to 6) via `PUT /lab/picks`, `GET /lab/picks/{mid}/{pid}?labeller=` (the score appears only once picks are saved); `GET /lab/bookmarks`. `EvalSummary` (`rows` of `EvalRow` per model and job, `results` of `EvalResultFile`, `ratings` of `RatingTally`) from `GET /lab/eval`; `ABPair` from `GET /lab/eval/pair`, `POST /lab/eval/rate` (`ABRatingRequest`). `DatasetPage` of `DatasetExample` from `GET /lab/dataset?job=&pending=`, `PUT /lab/dataset/{id}` (`DatasetReviewRequest`), `POST /lab/dataset/export`.

According to project history, `cs2coach` detectors emit evidence-linked findings with IDs such as `F12` in `report.json`. Their exact schema is **unknown** (not inspected). Minimum needs of this UI:

```ts
type Finding = { id: string; type: string; round: number; tick: number; clipTime?: number;
                 players: string[]; metrics: Record<string, number|string>; };  // ENGINE
```

## Coach context

Planned. This is what the prototype shows in its "Knows ..." line.

```ts
type CoachContext = {
  matchId: string; round: number; momentId: string;
  t: number; roundClock: string; view: "gameplay"|"radar";
  findings: Finding[];            // ENGINE, for this moment
  history: PlayerHistorySummary;  // DERIVED
};
// Reply: text with tokens [F12], [t:4.6], [m6]; every factual claim must carry an [F..] token.
```

## Player history

Planned. The prototype has `LAST7` and per-moment `last7`.

```ts
type PlayerHistorySummary = {
  window: { matchId: string; label: string }[];   // newest first
  patterns: { key: string; label: string; kind: Kind;
              occurrences: (0|1)[];               // DERIVED, aligned to window
              previousRate?: number;              // DERIVED
              class: "one-off"|"recurring"|"improving"|"strength"; }[];
};
```

## Processing state

Planned. The prototype simulates it with timers.

```ts
type Stage = "parse"|"rounds"|"events"|"rank"|"clips"|"explain";
type ProcessingEvent = { stage: Stage; state: "pending"|"active"|"done"|"error";
                         detail?: string;            // only counts that exist
                         progress?: {done:number; total:number} }; // e.g. clips 3 of 6
// delivered over SSE
```
