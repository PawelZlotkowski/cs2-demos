// TypeScript contracts - mirror apps/api/app/models/contracts.py
// Source of truth: docs/handoff/16-DATA-CONTRACTS.md + prototype SAMPLE_MOMENTS
// Sync: edit Pydantic first, then update these types in the same change.

export type MatchStatus =
  | "uploaded"
  | "decompressing"
  | "decompressed"
  | "parsing"
  | "normalizing"
  | "awaiting_player"
  | "detecting"
  | "selecting"
  | "recording"
  | "explaining"
  | "complete"
  | "failed";

/** Statuses in which round replays exist and the Radar can load. */
export const REPLAY_READY_STATUSES: ReadonlySet<MatchStatus> = new Set<MatchStatus>([
  "awaiting_player",
  "detecting",
  "selecting",
  "recording",
  "explaining",
  "complete",
]);

export type MomentKind = "mistake" | "strength" | "opportunity";
export type Side = "T" | "CT";
export type PlayerRole = "you" | "team" | "enemy";
export type TimelineLane = "insight" | "you" | "team" | "enemy" | "util";
export type Glyph =
  | MomentKind
  | "note"
  | "kill"
  | "death"
  | "spot"
  | "smoke"
  | "flash"
  | "move"
  | "sound"
  | "plant";

export type PatternClass = "one-off" | "recurring" | "improving" | "strength";
export type StageView = "gameplay" | "radar";

export interface Match {
  id: string;
  map: string;
  score: string;
  when: string;
  rounds: number;
  won: (0 | 1)[];
  status: MatchStatus;
  clipDuration: number;
  error?: string | null;
  mapName?: string | null;
  tickRate?: number | null;
  players?: ReplayPlayer[] | null;
  selectedPlayerId?: string | null;
}

export interface ReplayPlayer {
  id: string;
  name: string;
  team: Side;
}

export interface ProcessingStage {
  id: MatchStatus;
  label: string;
  state: "pending" | "active" | "done" | "error";
  detail?: string | null;
  progress?: { done: number; total: number } | null;
}

export type ClipStatus = "queued" | "recording" | "ready" | "failed" | "skipped";

export interface RoundClip {
  roundId: string;
  status: ClipStatus;
  url?: string | null;
  startTick: number;
  endTick: number;
  durationSec: number;
  focusSteamid?: string | null;
  error?: string | null;
}

export interface ClipManifest {
  matchId: string;
  focusSteamid?: string | null;
  clips: RoundClip[];
  done: number;
  total: number;
}

export interface StatusResponse {
  id: string;
  status: MatchStatus;
  stages: ProcessingStage[];
  error?: string | null;
  clips?: ClipManifest | null;
}

export interface Track {
  n: string;
  r: PlayerRole;
  p: [number, number, number][];
  f?: 1;
  from?: number;
  death?: number;
}

export interface PatternSnippet {
  text: string;
  last7: (0 | 1)[];
}

/** Evidence row: [label, value, findingId, clipTime] */
export type EvidenceRow = [string, string, string, number];

/** Timeline event tuple from the prototype */
export type TimelineEventTuple = [
  TimelineLane,
  number,
  Glyph,
  string,
  string?,
];

export interface Moment {
  id: string;
  round: number;
  clockStart: number;
  key: number;
  kind: MomentKind;
  cat: string;
  side: Side;
  title: string;
  label: string;
  pick: string;
  finding: string;
  why: string;
  instead: string;
  pattern: PatternSnippet;
  related: number[];
  ev: EvidenceRow[];
  bracket: [number, number, string] | null;
  zones: string[];
  youDeath?: number;
  players: Track[];
  rov: Record<string, unknown>[];
  cam?: [number, number][];
  gtracks: Record<string, unknown>;
  gov: Record<string, unknown>[];
  events: TimelineEventTuple[];
  qa: [string, string][];
  clipUrl?: string | null;
}

export interface TimelineEvent {
  lane: TimelineLane;
  clipTime: number;
  glyph: Glyph;
  label: string;
  findingId?: string | null;
}

export interface OverlayAnnotation {
  id: string;
  t0: number;
  t1: number;
  type: string;
  pri: 1 | 2;
  anchor?: Record<string, unknown> | null;
  label?: string | null;
  geometry?: Record<string, unknown> | null;
}

export interface RadarState {
  t: number;
  camera: { x: number; y: number; w: number; h: number };
  players: Record<string, unknown>[];
}

// --- Coach analysis (AI Coach plan §4.4) ---

export type FindingKind = "mistake" | "good" | "context" | "pattern";

/** What happened, stated by a detector (ENGINE). */
export interface Finding {
  id: string; // "F12", unique within a match + player
  detector: string;
  kind: FindingKind;
  round: number;
  t: number; // round clock seconds, same clock as the replay
  tick: number;
  playerId: string;
  otherIds: string[];
  zone?: string | null;
  severity: number; // 0..1
  evidence: Record<string, number | string>;
  summary: string; // templated English fallback
  template: string;
}

export interface RoundStats {
  round: number;
  playerId: string;
  side?: Side | null;
  won?: boolean | null;
  kills: number;
  deaths: number;
  assists: number;
  flashAssists: number;
  headshotKills: number;
  damage: number;
  utilityDamage: number;
  utilityThrown: number;
  enemiesFlashed: number;
  teammatesFlashed: number;
  moneyStart?: number | null;
  equipValue?: number | null;
  survived: boolean;
  openingKill: boolean;
  openingDeath: boolean;
  tradeKills: number;
  deathTraded?: boolean | null;
  timeAliveS?: number | null;
}

export interface SelectedMoment {
  id: string; // "m1"
  round: number;
  t0: number;
  t1: number;
  findingIds: string[];
  kind: "mistake" | "good";
  pickedBecause: string;
  score?: number | null;
  source: "ranker" | "agent";
}

export type CoachLanguage = "en" | "pl" | "nl";

export interface PlayerSelectRequest {
  playerId: string;
  /** Language the stored explanations are written in (default "en"). */
  language?: CoachLanguage;
}

/** Analysis-tab text for a moment ("m3") or an on-demand round ("r12"). */
export interface MomentExplanation {
  /** "m3", "r12", or the review's "summary" and "wrapup". */
  target: string;
  lang: CoachLanguage;
  text: string; // with [F..] [t:..] [m..] [K..] tokens
  citations: string[];
  findingIds: string[];
  /** "agent": model text that passed the verifier; "template": finding templates. */
  source: "agent" | "template";
  verifierErrors: string[];
  model?: string | null;
  promptVersion?: string | null;
}

/** A drill from the knowledge base for one mistake type in the review (design plan item 3). */
export interface PracticeDrill {
  detector: string;
  findingIds: string[];
  passageId: string;
  title: string;
  text: string;
  source: string;
}

/** End of the review: verified wrap-up text ("wrapup") and one drill per mistake type. */
export interface ReviewWrapUp {
  explanation: MomentExplanation;
  drills: PracticeDrill[];
}

export interface ExplainRequest {
  language?: CoachLanguage;
}

/** Ask tab question with the Studio's context line. */
export interface AskRequest {
  question: string;
  language?: CoachLanguage;
  round?: number | null;
  t?: number | null;
  momentId?: string | null;
  view?: StageView | null;
}

/** Server-sent events of POST /matches/{id}/players/{pid}/ask. */
export type AskEvent =
  | { event: "step"; data: { tool: string; ms: number; error: string | null } }
  | {
      event: "answer";
      data: {
        answer: string;
        citations: string[];
        source: "agent" | "template";
        verified: boolean;
        /** Stored Ask history id, the target for feedback on the answer (A10) */
        messageId?: number | null;
        /** Coach page only: cited match ref ("M2") to match id. */
        matches?: Record<string, string>;
      };
    }
  | { event: "error"; data: { detail: string } };

export interface KnowledgePassage {
  id: string; // "K7"
  title: string;
  map: string;
  source: string;
  text: string;
}

/** First-person clip of the coached player; t0/t1 are round clock seconds (video time = t - t0). */
export interface MomentClip {
  id: string;
  playerId: string;
  round: number;
  t0: number;
  t1: number;
  momentId?: string | null;
  status: ClipStatus;
  url?: string | null;
  error?: string | null;
}

export interface PlayerAnalysis {
  matchId: string;
  playerId: string;
  findings: Finding[];
  roundStats: RoundStats[];
  moments: SelectedMoment[];
}

export interface CoachRequest {
  momentId: string;
  question: string;
  t?: number;
  view?: StageView;
}

export interface CoachResponse {
  answer: string;
  citations: string[];
  momentId: string;
  mocked: boolean;
}

export interface Pattern {
  key: string;
  label: string;
  kind: MomentKind;
  occurrences: (0 | 1)[];
  previousRate?: number | null;
  class: PatternClass;
  direction?: "up" | "down" | "flat" | null;
  frequency?: number | null;
}

export interface PatternsResponse {
  last7: string[];
  patterns: Pattern[];
}

export interface UploadResponse {
  id: string;
  status: MatchStatus;
  filename: string;
  message: string;
}

export interface RoundSummary {
  id: string;
  number: number;
  winner?: Side | null;
  reason?: string | null;
  startTick: number;
  endTick: number;
  durationSec: number;
  clip?: RoundClip | null;
}

export interface ReplayEventPos {
  x: number;
  y: number;
  z?: number | null;
}

export interface ReplayEvent {
  id: string;
  type: string;
  tick: number;
  t: number;
  label: string;
  actorId?: string | null;
  victimId?: string | null;
  pos?: ReplayEventPos | null;
  roundId?: string | null;
}

export interface SamplePlayerState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  alive: boolean;
  rx?: number | null;
  ry?: number | null;
}

export interface ReplaySample {
  tick: number;
  t: number;
  players: SamplePlayerState[];
}

export interface RoundReplay {
  matchId: string;
  roundId: string;
  roundNumber: number;
  map: string;
  tickRate: number;
  startTick: number;
  endTick: number;
  durationSec: number;
  players: ReplayPlayer[];
  samples: ReplaySample[];
  events: ReplayEvent[];
  clip?: RoundClip | null;
}

export interface EventsPage {
  matchId: string;
  events: ReplayEvent[];
  total: number;
}

// --- Doc 29 roadmap: Coach page, system status, Lab ---

/** POST /players/{pid}/ask: a question across all the player's matches. Findings come back as "M2:F3". */
export interface CoachAskRequest {
  question: string;
  language?: CoachLanguage;
}

/** GET /players: someone picked for review in at least one match. */
export interface CoachedPlayer {
  id: string;
  name: string;
  matches: number;
  maps: string[];
}

export interface Features {
  lab: boolean;
  auth?: boolean;
  shareLinks?: boolean;
  studyMode?: boolean;
}

export type SystemCheckName = "llm" | "mcp" | "csdm" | "knowledge" | "traces";

export interface SystemCheck {
  name: SystemCheckName;
  /** "off" when disabled in .env, "problem" when on but not working. */
  state: "ok" | "off" | "problem";
  detail: string;
}

/** GET /system */
export interface SystemStatus {
  ok: boolean;
  llmModel: string;
  servedModels: string[];
  mcpTools: string[];
  checks: SystemCheck[];
}

export interface TraceToolStep {
  tool: string;
  args: Record<string, unknown>;
  resultBytes: number;
  ms: number;
  error: string | null;
}

/** One coach job from data/traces; id is "<date>:<line>". */
export interface TraceSummary {
  id: string;
  ts: string;
  job: string;
  matchId: string | null;
  playerId: string | null;
  lang: string | null;
  model: string | null;
  source: string | null;
  verifierOk: boolean | null;
  repaired: boolean;
  latencyS: number | null;
  toolCalls: number;
}

export interface TraceDetail extends TraceSummary {
  steps: TraceToolStep[];
  knowledgeIds: string[];
  verifierErrors: string[];
  output: string | null;
  fallback: string | null;
  record: Record<string, unknown>;
}

export interface TracePage {
  items: TraceSummary[];
  total: number;
}

// --- Doc 29 roadmap R07–R17 (mirrors apps/api/app/models/contracts.py) ---

/** Studio Notes (R08). */
export interface Bookmark {
  id: string; // "b3"
  round: number;
  t: number;
  note: string;
  createdAt: string;
}

export interface BookmarkRequest {
  round: number;
  t: number;
  note: string;
}

/** Coach page Plan (R09). */
export interface PlanItem {
  detector: string;
  label: string;
  matchesWith: number;
  matchesTotal: number;
  /** Per 10 rounds in the last 3 matches; null until there are more than 3. */
  per10Recent: number | null;
  per10Before: number | null;
  example: string | null; // "M2:F3"
  drillId: string | null;
  drillTitle: string | null;
  drillText: string | null;
  done: boolean;
  doneAt: string | null;
}

export interface PracticePlan {
  playerId: string;
  lang: CoachLanguage;
  text: string;
  citations: string[];
  source: "agent" | "template";
  matches: Record<string, string>;
  items: PlanItem[];
  createdAt: string;
}

/** Coach page Knowledge (R12). */
export interface MapZone {
  name: string;
  /** Radar pixel space, 1024 x 1024. */
  polygons: number[][][];
}

export interface KnowledgeRow {
  id: string;
  title: string;
  map: string;
  side: string;
  topic: string;
  source: string;
  text: string;
  zones: string[];
  cited: number;
  flags: string[];
}

export interface KnowledgeNoteRequest {
  map: "de_mirage" | "de_anubis";
  title: string;
  zones: string[];
  text: string;
}

/** Lab Labels (R07): one data/labels JSONL line (T17). */
export interface LabelVerdict {
  findingId: string;
  detector: string;
  t: number;
  verdict: "correct" | "wrong" | "unsure";
  note?: string | null;
}

export interface MissedEvent {
  detector: string;
  t: number;
  note?: string | null;
}

export interface RoundLabel {
  matchId: string;
  map: string;
  playerId: string;
  round: number;
  labeller: string;
  labelledAt?: string | null;
  findings: LabelVerdict[];
  missed: MissedEvent[];
}

export interface MomentPickRow {
  round: number;
  t0: number;
  t1: number;
  kind: "mistake" | "good";
}

export interface MomentPicks {
  matchId: string;
  playerId: string;
  labeller: string;
  picks: MomentPickRow[];
}

export interface PickScore {
  humanPicks: number;
  coachPicks: number;
  overlap: number;
  overlapAt6: number | null;
  ndcgAt6: number | null;
  coachSource: "ranker" | "agent" | null;
}

export interface LabelScoreRow {
  correct: number;
  wrong: number;
  missed: number;
  unsure: number;
  precision: number | null;
  recall: number | null;
}

export interface LabelsSummary {
  labellers: Record<string, number>;
  rounds: number;
  tool: boolean;
  score?: Record<string, LabelScoreRow>;
  agreement?: { a: string; b: string } & Record<string, unknown>;
}

/** Lab Evaluation (R10). */
export interface EvalRow {
  model: string;
  job: string;
  runs: number;
  verified: number;
  fallbacks: number;
  repaired: number;
  toolCalls: number;
  toolErrors: number;
  medianS: number | null;
  byLang: Record<string, string>;
}

export interface EvalResultFile {
  file: string;
  label: string;
  model: string | null;
  summary: Record<string, unknown>;
}

export interface RatingTally {
  model: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface EvalSummary {
  rows: EvalRow[];
  results: EvalResultFile[];
  ratings: RatingTally[];
}

export interface ABPair {
  job: string;
  target: string;
  lang: string | null;
  question: string;
  a: { traceId: string; text: string };
  b: { traceId: string; text: string };
}

/** Lab Dataset (R11). */
export interface DatasetExample {
  id: string;
  job: string;
  lang: string | null;
  matchId: string | null;
  split: "train" | "val" | "test";
  prompt: string;
  output: string;
  verdict: "accept" | "edit" | "reject" | null;
  edited: string | null;
}

export interface DatasetPage {
  items: DatasetExample[];
  total: number;
  reviewed: number;
  counts: Record<string, number>;
}

/** Matches and Progress (R13, R17). */
export interface MatchRow {
  id: string;
  map: string;
  score: string;
  when: string;
  status: MatchStatus;
  playerId: string | null;
  playerName: string | null;
  moments: number;
  model: string | null;
  versions: number;
  /** The owner's own name for the match */
  title?: string | null;
}

export interface ProgressMatch {
  ref: string;
  matchId: string;
  map: string;
  when: string;
  rounds: number;
}

export interface ProgressDetector {
  detector: string;
  kind: string;
  label: string;
  counts: number[];
  per10Recent: number | null;
  per10Before: number | null;
}

export interface ProgressZone {
  map: string;
  zone: string;
  deaths: number;
  examples: string[];
}

export interface ProgressResponse {
  playerId: string;
  matches: ProgressMatch[];
  detectors: ProgressDetector[];
  zones: ProgressZone[];
}

/** "Show a round where you did this well" (R15). */
export interface GoodExample {
  id: string; // "M2:F7"
  matchId: string;
  findingId: string;
  round: number;
  t: number;
  zone: string | null;
  summary: string;
  sameMatch: boolean;
}

export interface GoodExamples {
  zone: string | null;
  items: GoodExample[];
}


// --- Accounts and the admin panel (docs 27 and 30), mirrors models/contracts.py ---

export type Role = "admin" | "labeller" | "player";

export interface UserOut {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  steamId: string | null;
  hasPassword: boolean;
  createdAt: string | null;
  lastSeenAt: string | null;
  disabled: boolean;
  consented: boolean;
}

export interface AuthState {
  authEnabled: boolean;
  user: UserOut | null;
  needsSetup: boolean;
  signup: "invite" | "open" | "closed";
  steam: boolean;
  studyMode: boolean;
  needsConsent: boolean;
}

export interface UserSettings {
  language: CoachLanguage;
  playbackSpeed: number;
  explanationLength: "short" | "normal" | "long";
  autoplayClips: boolean;
  /** false: defaults, nothing saved on the account yet */
  saved?: boolean;
}

export interface SessionRow {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current?: boolean;
  userName?: string | null;
}

export interface AskHistoryItem {
  id: number;
  matchId: string | null;
  playerId: string;
  question: string;
  answer: string | null;
  citations: string[];
  source: string | null;
  lang: string | null;
  createdAt: string;
}

export interface FeedbackItem {
  target: string;
  kind: "explanation" | "answer";
  verdict: "useful" | "not_right";
  note: string | null;
}

export interface ReviewVersion {
  id: string;
  playerId: string;
  model: string;
  createdAt: string;
  moments: SelectedMoment[];
  explanations: MomentExplanation[];
}

export interface SharedReview {
  map: string | null;
  score: string | null;
  rounds: number | null;
  playerName: string | null;
  lang: CoachLanguage;
  moments: { id: string; round: number; t0: number; t1: number; kind: "mistake" | "good"; pickedBecause: string; clip: string | null }[];
  explanations: Record<string, string>;
}

export interface AdminUser extends UserOut {
  matches: number;
  bytes: number;
  sessions: number;
}

export interface Invite {
  id: string;
  hint: string;
  role: Role;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedBy: string | null;
  usedByName?: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  code?: string;
}

export interface AdminMatch {
  id: string;
  title: string | null;
  map: string | null;
  score: string | null;
  status: MatchStatus;
  error: string | null;
  ownerId: string;
  ownerName: string | null;
  playerId: string | null;
  playerName: string | null;
  model: string | null;
  bytes: number;
  createdAt: string | null;
  shared: boolean;
}

export interface GpuJob {
  id: string;
  kind: string;
  matchId: string | null;
  playerId: string | null;
  userId: string | null;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
}

export interface AdminJobs {
  gpu: { running: GpuJob[]; waiting: GpuJob[]; finished: GpuJob[] };
  pipeline: { matchId: string; status: MatchStatus; error: string | null; since: number | null }[];
  clips: { id: string; matchId: string; playerId: string; round: number; t0: number; t1: number; status: string; createdAt: string; error: string | null }[];
}

export interface StorageInfo {
  folders: { name: string; path: string; bytes: number }[];
  disk: { total: number; free: number } | null;
}

export interface AuditItem {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string | null;
  targetName?: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
}

export interface AdminOverview {
  system: SystemStatus;
  counts: {
    users: number;
    matches: number;
    reviewed: number;
    failed: number;
    processing: number;
    gpuWaiting: number;
    gpuRunning: number;
    clipsFailed: number;
  };
  storage: StorageInfo;
  authEnabled: boolean;
  recent: AuditItem[];
}

export interface RuntimeSetting {
  key: string;
  env: string;
  group: string;
  label: string;
  kind: "bool" | "number" | "text";
  choices: string[] | null;
  value: string | number | boolean | null;
  envValue: string | number | boolean | null;
  source: "env" | "admin";
  updatedAt: string | null;
}

export interface AdminSettings {
  runtime: RuntimeSetting[];
  restart: { key: string; env: string; value: unknown }[];
}

export interface ModelStats {
  system: SystemStatus;
  stats: {
    window: number;
    models: { model: string; runs: number; verifiedRate: number | null; avgLatencyS: number | null; tokensPerSecond: number | null }[];
  };
  command: string;
  sampling: string;
  maxSteps: number;
}

export interface KnowledgeAdmin {
  notes: { map: string; index: string; title: string; text: string }[];
  flags: { id: number; passageId: string; note: string; createdAt: string; title: string | null }[];
  passages: number;
}

export interface StudySummary {
  studyMode: boolean;
  participants: {
    participant: string;
    userId: string;
    name: string;
    role: Role;
    consented: boolean;
    matches: number;
    reviewed: number;
    feedback: number;
    useful: number;
    asks: number;
  }[];
}

export interface ApiToken {
  id: string;
  name: string;
  scope: "read" | "write";
  userId: string;
  userName?: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  token?: string;
}

export interface SecurityInfo {
  sessions: SessionRow[];
  failedLogins: { username: string; at: string; ip: string | null }[];
  tokens: ApiToken[];
  authEnabled: boolean;
}
