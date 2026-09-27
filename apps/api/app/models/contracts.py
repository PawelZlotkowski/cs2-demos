"""Match / moment / coach / processing contracts.

Canonical shapes for Round Reviewer. Keep in sync with:
- docs/handoff/16-DATA-CONTRACTS.md
- apps/web/src/lib/contracts/
- apps/api/data/fixtures/sample-match.json (source: prototype/fixtures/)
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    """Accept and emit camelCase aliases for the web client."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        serialize_by_alias=True,
    )


# --- Enums ---


class MatchStatus(str, Enum):
    """Replay stages, then the coach stages (AI Coach plan §3).

    Radar is usable from ``awaiting_player`` on. After ``detecting`` come
    ``selecting`` (coach model on), ``recording`` (gameplay recording on: the POV
    clip of each moment) and ``explaining`` (coach model on), then ``complete``.
    """

    uploaded = "uploaded"
    decompressing = "decompressing"
    decompressed = "decompressed"
    parsing = "parsing"
    normalizing = "normalizing"
    awaiting_player = "awaiting_player"
    detecting = "detecting"
    selecting = "selecting"
    recording = "recording"
    explaining = "explaining"
    complete = "complete"
    failed = "failed"


# Statuses in which round replays exist and the Radar can load
REPLAY_READY_STATUSES = frozenset(
    {
        MatchStatus.awaiting_player,
        MatchStatus.detecting,
        MatchStatus.selecting,
        MatchStatus.recording,
        MatchStatus.explaining,
        MatchStatus.complete,
    }
)


class MomentKind(str, Enum):
    mistake = "mistake"
    strength = "strength"
    opportunity = "opportunity"


class Side(str, Enum):
    T = "T"
    CT = "CT"


class PlayerRole(str, Enum):
    you = "you"
    team = "team"
    enemy = "enemy"


class TimelineLane(str, Enum):
    insight = "insight"
    you = "you"
    team = "team"
    enemy = "enemy"
    util = "util"


class Glyph(str, Enum):
    mistake = "mistake"
    strength = "strength"
    opportunity = "opportunity"
    note = "note"
    kill = "kill"
    death = "death"
    spot = "spot"
    smoke = "smoke"
    flash = "flash"
    move = "move"
    sound = "sound"
    plant = "plant"


class PatternClass(str, Enum):
    one_off = "one-off"
    recurring = "recurring"
    improving = "improving"
    strength = "strength"


class StageView(str, Enum):
    gameplay = "gameplay"
    radar = "radar"


# --- Core match ---


class ReplayPlayer(CamelModel):
    id: str
    name: str
    team: Side


class Match(CamelModel):
    id: str
    map: str
    score: str
    when: str
    rounds: int
    won: list[Literal[0, 1]]
    status: MatchStatus = MatchStatus.complete
    clip_duration: float = Field(20.0, alias="clipDuration")
    error: str | None = None
    map_name: str | None = Field(None, alias="mapName")
    tick_rate: int | None = Field(None, alias="tickRate")
    players: list[ReplayPlayer] | None = None
    selected_player_id: str | None = Field(None, alias="selectedPlayerId")


class ProcessingStage(CamelModel):
    """Honest pipeline stage (counts only when known)."""

    id: MatchStatus
    label: str
    state: Literal["pending", "active", "done", "error"]
    detail: str | None = None
    progress: dict[str, int] | None = None  # {done, total}


class MatchSummary(CamelModel):
    """Lightweight match for lists / status polling."""

    id: str
    map: str | None = None
    score: str | None = None
    when: str | None = None
    rounds: int | None = None
    status: MatchStatus
    moment_count: int | None = Field(None, alias="momentCount")
    error: str | None = None
    stages: list[ProcessingStage] | None = None


class ClipStatus(str, Enum):
    queued = "queued"
    recording = "recording"
    ready = "ready"
    failed = "failed"
    skipped = "skipped"


class RoundClip(CamelModel):
    round_id: str = Field(alias="roundId")
    status: ClipStatus
    url: str | None = None
    start_tick: int = Field(alias="startTick")
    end_tick: int = Field(alias="endTick")
    duration_sec: float = Field(alias="durationSec")
    focus_steamid: str | None = Field(None, alias="focusSteamid")
    error: str | None = None


class ClipManifest(CamelModel):
    match_id: str = Field(alias="matchId")
    focus_steamid: str | None = Field(None, alias="focusSteamid")
    clips: list[RoundClip]
    done: int = 0
    total: int = 0


class MomentClip(CamelModel):
    """First-person clip of the coached player for one window of a round.

    ``t0``/``t1`` are round clock seconds, so the Studio plays it at
    ``t - t0`` on the shared clock. ``momentId`` is set for the coach's
    moments; on-demand rounds and ``request_clip`` leave it empty.
    """

    id: str  # "c3"
    player_id: str = Field(alias="playerId")
    round: int
    t0: float
    t1: float
    moment_id: str | None = Field(None, alias="momentId")
    status: ClipStatus
    url: str | None = None
    error: str | None = None


class StatusResponse(CamelModel):
    id: str
    status: MatchStatus
    stages: list[ProcessingStage]
    error: str | None = None
    clips: ClipManifest | None = None


# --- Tracks / overlays ---


class TrackPoint(CamelModel):
    """[t, x, y] map units 0–100 in the prototype."""

    model_config = ConfigDict(extra="forbid")

    # Stored as nested lists in fixtures for fidelity to the prototype.
    # Prefer Track.p as list[list[float]].


class Track(CamelModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        serialize_by_alias=True,
    )

    n: str
    r: PlayerRole
    p: list[list[float]]  # [t, x, y]
    f: Literal[1] | None = None
    from_: float | None = Field(None, alias="from")
    death: float | None = None


class Win(CamelModel):
    t0: float
    t1: float
    pri: Literal[1, 2]


class RadarOverlayZone(Win):
    type: Literal["zone"]
    pts: list[list[float]]
    label: str | None = None
    lx: float | None = None
    ly: float | None = None


class RadarOverlaySight(Win):
    type: Literal["sight"]
    x1: float
    y1: float
    x2: float
    y2: float
    good: bool | None = None


class RadarOverlaySmoke(Win):
    type: Literal["smoke"]
    x: float
    y: float
    r: float
    label: str | None = None
    lx: float | None = None
    ly: float | None = None
    good: bool | None = None


class RadarOverlayLink(Win):
    type: Literal["link"]
    a: int
    b: int
    label: str


class RadarOverlayMark(Win):
    type: Literal["mark"]
    pl: int
    at: float
    label: str


RadarOverlay = Annotated[
    Union[
        RadarOverlayZone,
        RadarOverlaySight,
        RadarOverlaySmoke,
        RadarOverlayLink,
        RadarOverlayMark,
    ],
    Field(discriminator="type"),
]


class AnnoAnchorTrack(CamelModel):
    track: str


class AnnoAnchorPoint(CamelModel):
    x: float
    y: float


class GameOverlayAnno(Win):
    type: Literal["anno"]
    at: dict[str, Any]  # {track} or {x,y}
    side: Literal["left", "right"] | None = None
    lab: str | None = None
    g: MomentKind | Literal["note"] | None = None
    text: str


class GameOverlayRing(Win):
    type: Literal["ring"]
    track: str


class GameOverlayLos(Win):
    type: Literal["los"]
    track: str
    to: list[float] | None = None


class GameOverlayZone(Win):
    type: Literal["zone"]
    pts: list[list[float]]


class GameOverlayArrow(Win):
    type: Literal["arrow"]
    d: str


class GameOverlayBlob(Win):
    type: Literal["blob"]
    x: float
    y: float
    r: float


class GameOverlayLine(Win):
    type: Literal["line"]
    x1: float
    y1: float
    x2: float
    y2: float


GameOverlay = Annotated[
    Union[
        GameOverlayAnno,
        GameOverlayRing,
        GameOverlayLos,
        GameOverlayZone,
        GameOverlayArrow,
        GameOverlayBlob,
        GameOverlayLine,
    ],
    Field(discriminator="type"),
]


class OverlayAnnotation(CamelModel):
    """Normalised overlay annotation for Studio (planned ID-stable form)."""

    id: str
    t0: float
    t1: float
    type: str
    pri: Literal[1, 2]
    anchor: dict[str, Any] | None = None
    label: str | None = None
    geometry: dict[str, Any] | None = None


class RadarState(CamelModel):
    """Computed at time t — not stored; returned for tooling / tests."""

    t: float
    camera: dict[str, float]  # {x,y,w,h}
    players: list[dict[str, Any]]


# --- Moment ---


class PatternSnippet(CamelModel):
    text: str
    last7: list[Literal[0, 1]]


class Moment(CamelModel):
    """Selected learning moment (~5–6 per match)."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow",
        serialize_by_alias=True,
    )

    id: str
    round: int
    clock_start: float = Field(alias="clockStart")
    key: float
    kind: MomentKind
    cat: str
    side: Side
    title: str
    label: str
    pick: str
    finding: str
    why: str
    instead: str
    pattern: PatternSnippet
    related: list[int]
    ev: list[list[Any]]  # [label, value, findingId, clipTime]
    bracket: list[Any] | None = None  # [t0, t1, label] | null
    zones: list[str]
    you_death: float | None = Field(None, alias="youDeath")
    players: list[Track]
    rov: list[dict[str, Any]]
    cam: list[list[float]] | None = None
    gtracks: dict[str, Any] = Field(default_factory=dict)
    gov: list[dict[str, Any]]
    events: list[list[Any]]  # TimelineEvent tuples
    qa: list[list[str]] = Field(default_factory=list)
    clip_url: str | None = Field(None, alias="clipUrl")


class TimelineEvent(CamelModel):
    """Structured form of the prototype tuple."""

    lane: TimelineLane
    clip_time: float = Field(alias="clipTime")
    glyph: Glyph
    label: str
    finding_id: str | None = Field(None, alias="findingId")


# --- Coach analysis (AI Coach plan §4.4) ---

FindingKind = Literal["mistake", "good", "context", "pattern"]


class Finding(CamelModel):
    """What happened, stated by a detector. ENGINE provenance.

    ``evidence`` holds every number a sentence may quote; the LLM may not
    introduce numbers that are not here or in ``RoundStats``.
    """

    id: str  # "F12", unique within a match + player
    detector: str  # module name, e.g. "untraded_death"
    kind: FindingKind
    round: int
    t: float  # round clock seconds, same clock as the replay
    tick: int
    player_id: str = Field(alias="playerId")
    other_ids: list[str] = Field(default_factory=list, alias="otherIds")
    zone: str | None = None
    severity: float = Field(ge=0.0, le=1.0)
    evidence: dict[str, Union[int, float, str]] = Field(default_factory=dict)
    summary: str  # templated English sentence, the no-LLM fallback
    template: str  # key in coach/templates/findings.<lang>.json (pl/nl fallback)


class RoundStats(CamelModel):
    """Per-round numbers for the coached player, computed in code."""

    round: int
    player_id: str = Field(alias="playerId")
    side: Side | None = None
    won: bool | None = None
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    flash_assists: int = Field(0, alias="flashAssists")
    headshot_kills: int = Field(0, alias="headshotKills")
    damage: int = 0
    utility_damage: int = Field(0, alias="utilityDamage")
    utility_thrown: int = Field(0, alias="utilityThrown")
    enemies_flashed: int = Field(0, alias="enemiesFlashed")
    teammates_flashed: int = Field(0, alias="teammatesFlashed")
    money_start: int | None = Field(None, alias="moneyStart")
    equip_value: int | None = Field(None, alias="equipValue")
    survived: bool = True
    opening_kill: bool = Field(False, alias="openingKill")
    opening_death: bool = Field(False, alias="openingDeath")
    trade_kills: int = Field(0, alias="tradeKills")
    death_traded: bool | None = Field(None, alias="deathTraded")
    time_alive_s: float | None = Field(None, alias="timeAliveS")


class SelectedMoment(CamelModel):
    """One of the 5–6 moments for a player (plan §6.2).

    ``source`` is ``ranker`` for the code fallback; the phase 2 agent writes
    ``agent``. ``t0``/``t1`` are round clock seconds.
    """

    id: str  # "m1"
    round: int
    t0: float
    t1: float
    finding_ids: list[str] = Field(alias="findingIds")
    kind: Literal["mistake", "good"]
    picked_because: str = Field(alias="pickedBecause")
    score: float | None = None
    source: Literal["ranker", "agent"] = "ranker"


CoachLanguage = Literal["en", "pl", "nl"]


class PlayerSelectRequest(CamelModel):
    player_id: str = Field(alias="playerId")
    # Language of the stored explanations (plan §6.4); the UI copy stays English
    language: CoachLanguage = "en"


class MomentExplanation(CamelModel):
    """Analysis-tab text for one moment ("m3"), an on-demand round ("r12"), or the
    review's opening "summary" and closing "wrapup" (design plan items 2 and 3).

    ``source`` is ``agent`` when the model's text passed the verifier, and
    ``template`` when it fell back to the finding templates (plan §6.3).
    """

    target: str
    lang: CoachLanguage
    text: str
    citations: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list, alias="findingIds")
    source: Literal["agent", "template"]
    verifier_errors: list[str] = Field(default_factory=list, alias="verifierErrors")
    model: str | None = None
    prompt_version: str | None = Field(None, alias="promptVersion")


class PracticeDrill(CamelModel):
    """A drill from the knowledge base for one mistake type in the review (design plan item 3)."""

    detector: str
    finding_ids: list[str] = Field(default_factory=list, alias="findingIds")
    passage_id: str = Field(alias="passageId")
    title: str
    text: str
    source: str


class ReviewWrapUp(CamelModel):
    """End of the review: the verified wrap-up text and one drill per mistake type."""

    explanation: MomentExplanation
    drills: list[PracticeDrill] = Field(default_factory=list)


class ExplainRequest(CamelModel):
    language: CoachLanguage = "en"


class AskRequest(CamelModel):
    """Ask tab question with the Studio's context line (plan §6.2 job 3)."""

    question: str = Field(min_length=1, max_length=500)
    language: CoachLanguage = "en"
    round: int | None = None
    t: float | None = None
    moment_id: str | None = Field(None, alias="momentId")
    view: StageView | None = None


class CoachAskRequest(CamelModel):
    """Coach page question across all the player's matches (doc 29 R05)."""

    question: str = Field(min_length=1, max_length=500)
    language: CoachLanguage = "en"


class PlayerAnalysis(CamelModel):
    """Everything the analysis layer produced for one player in one match."""

    match_id: str = Field(alias="matchId")
    player_id: str = Field(alias="playerId")
    findings: list[Finding]
    round_stats: list[RoundStats] = Field(alias="roundStats")
    moments: list[SelectedMoment]


# --- Coach / personalisation ---


class CoachRequest(CamelModel):
    moment_id: str = Field(alias="momentId")
    question: str
    t: float | None = None
    view: StageView | None = StageView.gameplay


class CoachResponse(CamelModel):
    answer: str
    citations: list[str] = Field(default_factory=list)
    moment_id: str = Field(alias="momentId")
    mocked: bool = True


class Pattern(CamelModel):
    key: str
    label: str
    kind: MomentKind
    occurrences: list[Literal[0, 1]]
    previous_rate: float | None = Field(None, alias="previousRate")
    class_: PatternClass = Field(alias="class")
    direction: Literal["up", "down", "flat"] | None = None
    frequency: float | None = None

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        serialize_by_alias=True,
    )


class PlayerHistorySummary(CamelModel):
    model_config = ConfigDict(populate_by_name=True)

    window: list[dict[str, str]]
    patterns: list[Pattern]


class PatternsResponse(CamelModel):
    last7: list[str]
    patterns: list[Pattern]


# --- Upload ---


class UploadResponse(CamelModel):
    id: str
    status: MatchStatus
    filename: str
    message: str = "Upload accepted"


# --- Replay (Demo Replay milestone) ---


class RoundSummary(CamelModel):
    id: str
    number: int
    winner: Side | None = None
    reason: str | None = None
    start_tick: int = Field(alias="startTick")
    end_tick: int = Field(alias="endTick")
    duration_sec: float = Field(alias="durationSec")
    clip: RoundClip | None = None


class ReplayEventPos(CamelModel):
    x: float
    y: float
    z: float | None = None


class ReplayEvent(CamelModel):
    id: str
    type: str
    tick: int
    t: float
    label: str
    actor_id: str | None = Field(None, alias="actorId")
    victim_id: str | None = Field(None, alias="victimId")
    pos: ReplayEventPos | None = None
    round_id: str | None = Field(None, alias="roundId")


class SamplePlayerState(CamelModel):
    id: str
    x: float
    y: float
    z: float
    yaw: float
    health: int
    alive: bool
    rx: float | None = None
    ry: float | None = None


class ReplaySample(CamelModel):
    tick: int
    t: float
    players: list[SamplePlayerState]


class RoundReplay(CamelModel):
    match_id: str = Field(alias="matchId")
    round_id: str = Field(alias="roundId")
    round_number: int = Field(alias="roundNumber")
    map: str
    tick_rate: int = Field(alias="tickRate")
    start_tick: int = Field(alias="startTick")
    end_tick: int = Field(alias="endTick")
    duration_sec: float = Field(alias="durationSec")
    players: list[ReplayPlayer]
    samples: list[ReplaySample]
    events: list[ReplayEvent]
    clip: RoundClip | None = None


class EventsPage(CamelModel):
    match_id: str = Field(alias="matchId")
    events: list[ReplayEvent]
    total: int


# --- System status (roadmap R01) ---


class SystemCheck(CamelModel):
    """One part of the local setup. ``state`` is ``off`` when the part is disabled
    in ``.env``, ``problem`` when it is on but not working."""

    name: Literal["llm", "mcp", "csdm", "knowledge", "traces"]
    state: Literal["ok", "off", "problem"]
    detail: str


class SystemStatus(CamelModel):
    ok: bool
    llm_model: str = Field(alias="llmModel")  # RR_LLM_MODEL
    served_models: list[str] = Field(default_factory=list, alias="servedModels")  # from /v1/models
    mcp_tools: list[str] = Field(default_factory=list, alias="mcpTools")
    checks: list[SystemCheck]


# --- Lab, Runs (roadmap R03) ---


class TraceToolStep(CamelModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    result_bytes: int = Field(0, alias="resultBytes")
    ms: float = 0.0
    error: str | None = None


class TraceSummary(CamelModel):
    """One coach job as written to ``data/traces/<date>.jsonl``.

    ``id`` is ``<date>:<line>`` (1-based) and stays stable because the files are
    append-only."""

    id: str
    ts: str
    job: str
    match_id: str | None = Field(None, alias="matchId")
    player_id: str | None = Field(None, alias="playerId")
    lang: str | None = None
    model: str | None = None
    source: str | None = None  # agent | template
    verifier_ok: bool | None = Field(None, alias="verifierOk")
    repaired: bool = False
    latency_s: float | None = Field(None, alias="latencyS")
    tool_calls: int = Field(0, alias="toolCalls")


class TraceDetail(TraceSummary):
    steps: list[TraceToolStep] = Field(default_factory=list)
    knowledge_ids: list[str] = Field(default_factory=list, alias="knowledgeIds")
    verifier_errors: list[str] = Field(default_factory=list, alias="verifierErrors")
    output: str | None = None
    fallback: str | None = None
    record: dict[str, Any] = Field(default_factory=dict)  # the raw JSONL line


class TracePage(CamelModel):
    items: list[TraceSummary]
    total: int
