"""Match / moment / coach / processing contracts.

Canonical shapes for Round Reviewer. Keep in sync with:
- docs/handoff/16-DATA-CONTRACTS.md
- apps/web/src/lib/contracts/
- packages/shared/fixtures/sample-match.json
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
    """Replay MVP stages (+ legacy coaching stubs kept for unused routes)."""

    uploaded = "uploaded"
    decompressing = "decompressing"
    decompressed = "decompressed"
    parsing = "parsing"
    normalizing = "normalizing"
    # Legacy analysis stubs (unused by real replay pipeline)
    reconstructing = "reconstructing"
    detecting = "detecting"
    ranking = "ranking"
    rendering = "rendering"
    analyzing = "analyzing"
    complete = "complete"
    failed = "failed"


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


class StatusResponse(CamelModel):
    id: str
    status: MatchStatus
    stages: list[ProcessingStage]
    error: str | None = None


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


class Finding(CamelModel):
    id: str
    type: str
    round: int
    tick: int
    clip_time: float | None = Field(None, alias="clipTime")
    players: list[str] = Field(default_factory=list)
    metrics: dict[str, Union[int, float, str]] = Field(default_factory=dict)


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


class EventsPage(CamelModel):
    match_id: str = Field(alias="matchId")
    events: list[ReplayEvent]
    total: int
