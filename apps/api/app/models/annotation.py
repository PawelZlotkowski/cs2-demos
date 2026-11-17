"""Versioned local annotation contracts, separate from the legacy Lab format."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Literal['shooting', 'utility', 'teamwork', 'positioning', 'objective', 'economy', 'other']
Split = Literal['unassigned', 'train', 'val', 'test']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_max_length=6000)


class Moment(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    start: float = Field(ge=0)
    anchor: float = Field(ge=0)
    end: float = Field(ge=0)
    categories: list[Category] = Field(default_factory=lambda: ['other'], min_length=1, max_length=7)
    assessment: Literal['mistake', 'good', 'neutral', 'uncertain'] = 'uncertain'
    facts: str = ''
    known: str = ''
    unknown: str = ''
    reason: str = ''
    alternative: str = ''
    confidence: Literal['low', 'medium', 'high'] = 'low'
    priority: int = Field(default=1, ge=0, le=3)
    evidence: list[str] = Field(default_factory=list, max_length=100)
    missedDetector: str | None = Field(default=None, max_length=50)
    footageId: str | None = Field(default=None, pattern=r'^[a-f0-9]{32}$')

    @model_validator(mode='after')
    def window(self):
        if not self.start <= self.anchor <= self.end:
            raise ValueError('Moment times must satisfy start <= anchor <= end.')
        return self


class CandidateVerdict(StrictModel):
    verdict: Literal['correct', 'wrong', 'unsure']
    note: str = ''


class ReviewSave(StrictModel):
    previousRevision: int | None = None
    status: Literal['draft', 'complete', 'blocked', 'excluded'] = 'draft'
    fullRoundReviewed: bool = False
    independentComplete: bool = False
    language: Literal['en', 'pl'] = 'en'
    notes: str = ''
    moments: list[Moment] = Field(default_factory=list, max_length=100)
    candidates: dict[str, CandidateVerdict] = Field(default_factory=dict, max_length=500)


class SelectPlayer(StrictModel):
    playerId: str = Field(pattern=r'^\d{1,20}$')
    autoRecord: bool = False
    before: float = Field(default=10, ge=0, le=60)
    after: float = Field(default=5, ge=0, le=60)

    @model_validator(mode='after')
    def context_window(self):
        if self.autoRecord and self.before + self.after <= 0:
            raise ValueError('Choose some before or after context for automatic recording.')
        return self


class Provenance(StrictModel):
    source: str = Field(default='', max_length=500)
    sourceMatchId: str = Field(default='', max_length=200)
    split: Split = 'unassigned'
    trainingPermitted: bool = False


# --- round-reviewer-clips-v1: "Export clips for web" (mirrored in apps/web/src/lib/labeler/manifest.ts)

CLIP_MANIFEST_FORMAT = 'round-reviewer-clips-v1'
HEX32 = r'^[a-f0-9]{32}$'
HEX64 = r'^[a-f0-9]{64}$'


class OpenModel(BaseModel):
    """Typed core fields; additional recorder/detector fields pass through unchanged."""
    model_config = ConfigDict(extra='allow', allow_inf_nan=False)


class ManifestPlayer(OpenModel):
    id: str = Field(pattern=r'^\d{1,20}$')
    name: str = Field(max_length=200)


class ManifestDemoMetadata(StrictModel):
    id: str = Field(pattern=r'^demo-[a-f0-9]{64}$')
    sha256: str = Field(pattern=HEX64)
    filename: str = Field(min_length=1, max_length=250)
    map: Literal['de_ancient', 'de_anubis']
    players: list[ManifestPlayer] = Field(min_length=1, max_length=64)
    parserVersion: str | None = Field(default=None, max_length=50)
    originalSha256: str | None = Field(default=None, pattern=HEX64)

    @model_validator(mode='after')
    def identity(self):
        if self.id != 'demo-' + self.sha256:
            raise ValueError('The demo identity must be its decompressed SHA-256.')
        return self


class ManifestDemo(StrictModel):
    metadata: ManifestDemoMetadata
    provenance: Provenance


class ManifestFinding(OpenModel):
    id: str = Field(pattern=r'^F\d+$')
    detector: str = Field(min_length=1, max_length=60)
    round: int = Field(ge=1)
    t: float = Field(ge=0)
    evidence: dict


class ManifestFootage(OpenModel):
    source: str = Field(max_length=40)
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    duration: float = Field(gt=0)
    startTick: int = Field(ge=0)
    endTick: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    codec: Literal['h264']
    sha256: str = Field(pattern=HEX64)
    bytes: int = Field(gt=0)
    anchor: float | None = Field(default=None, ge=0)
    alignmentConfirmed: bool
    findings: list[ManifestFinding] | None = Field(default=None, min_length=1, max_length=2000)
    reviewKey: str | None = Field(default=None, pattern=r'^F\d+(\+F\d+)*$', max_length=20000)


def validate_clip_group(finding: dict, footage: dict, round_number: int):
    """Validate optional grouped evidence in manifests and portable note exports."""
    members, key = footage.get('findings'), footage.get('reviewKey')
    if members is None and key is None:
        return  # Existing single-finding exports remain readable.
    if not members or len(members) > 2000:
        raise ValueError('A grouped clip needs its original findings.')
    parsed = [ManifestFinding.model_validate(f).model_dump() for f in members]
    ids = [f['id'] for f in parsed]
    if len(set(ids)) != len(ids) or key != '+'.join(sorted(ids)):
        raise ValueError('The clip review key must identify every finding exactly once.')
    if parsed[0] != ManifestFinding.model_validate(finding).model_dump():
        raise ValueError('The lead finding must be the first finding in the clip.')
    if any(f['round'] != round_number for f in parsed):
        raise ValueError('All findings in a clip must belong to its round.')
    if any(not footage['start'] - .05 <= f['t'] <= footage['end'] + .05 for f in parsed):
        raise ValueError('A grouped finding is outside the recorded context.')


class ManifestClip(StrictModel):
    footageId: str = Field(pattern=HEX32)
    path: str = Field(pattern=r'^clips/[a-f0-9]{32}\.mp4$')
    bytes: int = Field(gt=0)
    sha256: str = Field(pattern=HEX64)
    contentType: Literal['video/mp4'] = 'video/mp4'
    matchId: str = Field(pattern=r'^demo-[a-f0-9]{64}$')
    playerId: str = Field(pattern=r'^\d{1,20}$')
    snapshotId: str = Field(min_length=1, max_length=200)
    round: int = Field(ge=1)
    batchId: str = Field(pattern=HEX32)
    finding: ManifestFinding
    footage: ManifestFootage

    @model_validator(mode='after')
    def consistent(self):
        if self.path != f'clips/{self.footageId}.mp4':
            raise ValueError('The clip path must be clips/<footageId>.mp4.')
        if self.finding.round != self.round:
            raise ValueError('The finding and clip round disagree.')
        validate_clip_group(self.finding.model_dump(), self.footage.model_dump(), self.round)
        if self.footage.sha256 != self.sha256 or self.footage.bytes != self.bytes:
            raise ValueError('Footage metadata disagrees with the file entry.')
        return self


class ClipManifest(StrictModel):
    format: Literal['round-reviewer-clips-v1']
    exportedAt: str = Field(max_length=40)
    workspace: str | None = Field(default=None, pattern=HEX32)
    demos: dict[str, ManifestDemo]
    clips: list[ManifestClip] = Field(max_length=2000)

    @model_validator(mode='after')
    def references(self):
        seen = set()
        for key, demo in self.demos.items():
            if demo.metadata.id != key:
                raise ValueError('Demo key and metadata disagree.')
        for clip in self.clips:
            demo = self.demos.get(clip.matchId)
            if demo is None:
                raise ValueError('A clip names a demo missing from the manifest.')
            if clip.playerId not in {p.id for p in demo.metadata.players}:
                raise ValueError('A clip names a player outside its demo.')
            if clip.footageId in seen:
                raise ValueError('Duplicate clip in the manifest.')
            seen.add(clip.footageId)
        return self
