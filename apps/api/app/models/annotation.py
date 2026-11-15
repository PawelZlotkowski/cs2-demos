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
